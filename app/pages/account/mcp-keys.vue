<script setup lang="ts">
import type { McpAuditLog } from '~/types/api'

definePageMeta({ middleware: 'auth', title: 'nav.mcpKeys' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const cfg = useRuntimeConfig()
const { relTime, fmtDate } = useFormat()

const KEY_LIMIT = 10

const { data: keys, pending, refresh } = await useAsyncData('mcp-keys', () => api.mcp.list().catch(() => []), { lazy: true, server: false })
const activeKeys = computed(() => (keys.value ?? []).filter((k) => !k.revoked_at))
const atLimit = computed(() => activeKeys.value.length >= KEY_LIMIT)

const CAPS = [
  'read:nodes', 'read:peers', 'read:metrics', 'read:audit',
  'write:peer:create', 'write:peer:update_pending', 'write:peer:cancel_pending', 'write:operation:create',
]
const DEFAULT_CAPS = ['read:nodes', 'read:peers', 'read:metrics']

const isWrite = (caps: string[]) => caps.some((c) => c.startsWith('write:'))

function isExpired(expiresAt?: string | null) {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() < Date.now()
}

const mcpUrl = computed(() => `${cfg.public.siteUrl}/api/v1/mcp`)
const configSnippet = computed(() => `{
  "mcpServers": {
    "autopeer": {
      "url": "${mcpUrl.value}",
      "headers": { "Authorization": "Bearer ap_mcp_…" }
    }
  }
}`)

// ── Create ───────────────────────────────────────────────────────────────────
const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ name: '', caps: [...DEFAULT_CAPS], expires: '' })
const formHasWrite = computed(() => isWrite(form.caps))
function toggleCap(c: string) {
  const i = form.caps.indexOf(c)
  if (i >= 0) form.caps.splice(i, 1)
  else form.caps.push(c)
}
function openCreate() {
  if (atLimit.value) return
  form.name = ''
  form.caps = [...DEFAULT_CAPS]
  form.expires = ''
  showCreate.value = true
}

// ── One-time secret reveal ───────────────────────────────────────────────────
const secret = ref<string | null>(null)
const secretIsWrite = ref(false)
const showSecret = ref(false)
let secretTimer: ReturnType<typeof setTimeout> | null = null

function clearSecret() {
  if (secretTimer) {
    clearTimeout(secretTimer)
    secretTimer = null
  }
  secret.value = null
  showSecret.value = false
}

async function create() {
  if (!form.name.trim() || creating.value) return
  // Never mint a scope-less key: fall back to the read preset so the created
  // key's capabilities match what the UI presented.
  const caps = form.caps.length ? [...form.caps] : [...DEFAULT_CAPS]
  creating.value = true
  try {
    const res = await api.mcp.create({
      name: form.name.trim(),
      capabilities: caps,
      expires_at: form.expires ? new Date(form.expires).toISOString() : null,
    })
    showCreate.value = false
    if (res.key) {
      secret.value = res.key
      secretIsWrite.value = isWrite(res.capabilities ?? caps)
      showSecret.value = true
      // Auto-invalidate the plaintext key after 60s so it is not retained.
      if (secretTimer) clearTimeout(secretTimer)
      secretTimer = setTimeout(clearSecret, 60_000)
    }
    toast.show(t('mcpKeys.created'))
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    creating.value = false
  }
}

// ── Revoke ───────────────────────────────────────────────────────────────────
const showRevoke = ref(false)
const revokeId = ref<string | null>(null)
const revokeName = ref('')
const revoking = ref(false)
function askRevoke(id: string, name: string) {
  revokeId.value = id
  revokeName.value = name
  showRevoke.value = true
}
async function doRevoke() {
  if (!revokeId.value || revoking.value) return
  revoking.value = true
  try {
    await api.mcp.remove(revokeId.value)
    toast.show(t('mcpKeys.revoked'))
    showRevoke.value = false
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    revoking.value = false
  }
}

// ── Tool-call audit log ──────────────────────────────────────────────────────
const auditLogs = ref<McpAuditLog[]>([])
const auditLoading = ref(false)
const toolFilter = ref('')

const toolOptions = computed(() => {
  const names = new Set<string>()
  for (const l of auditLogs.value) if (l.tool_name) names.add(l.tool_name)
  return [
    { value: '', label: t('mcpKeys.audit.allTools') },
    ...[...names].sort().map((n) => ({ value: n, label: n })),
  ]
})

const visibleLogs = computed(() =>
  toolFilter.value ? auditLogs.value.filter((l) => l.tool_name === toolFilter.value) : auditLogs.value,
)

async function loadAuditLogs() {
  auditLoading.value = true
  try {
    // USER scope: bare array, latest 200 for the caller's ASN.
    auditLogs.value = await api.mcp.auditLogs()
  } catch {
    // Audit logs are non-critical — fail silently to avoid noise.
    auditLogs.value = []
  } finally {
    auditLoading.value = false
  }
}

onMounted(loadAuditLogs)
onBeforeUnmount(() => {
  if (secretTimer) clearTimeout(secretTimer)
})
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="vpn_key" :title="t('mcpKeys.title')" :subtitle="t('mcpKeys.subtitle')">
      <template #action>
        <MdButton variant="filled" icon="add" :disabled="atLimit" @click="openCreate">{{ t('mcpKeys.newKey') }}</MdButton>
      </template>
    </PageHeader>

    <div v-if="keys === null" class="metric-3">
      <SkeletonBlock v-for="i in 3" :key="i" height="160px" radius="12px" />
    </div>

    <div v-else-if="!activeKeys.length" class="card card-outlined card-pad text-center txt-variant">
      <p :style="{ margin: '0 0 12px' }">{{ t('mcpKeys.empty') }}</p>
      <MdButton variant="filled" icon="add" :disabled="atLimit" @click="openCreate">{{ t('mcpKeys.newKey') }}</MdButton>
    </div>

    <template v-else>
      <div class="metric-3">
        <div v-for="k in activeKeys" :key="k.id" class="card card-elevated card-pad col gap-3">
          <div class="row gap-2">
            <MdSym name="vpn_key" :style="{ color: 'var(--md-sys-color-primary)' }" fill />
            <span class="md-title-medium" :style="{ flex: 1 }">{{ k.name }}</span>
            <MdStatus :kind="isWrite(k.capabilities) ? 'warning' : 'info'" :dot="false">
              {{ isWrite(k.capabilities) ? t('mcpKeys.readWrite') : t('mcpKeys.readOnly') }}
            </MdStatus>
          </div>
          <div class="row gap-2" :style="{ alignItems: 'center' }">
            <div class="code-inline mono">{{ k.key_prefix }}…</div>
            <MdStatus v-if="isExpired(k.expires_at)" kind="error" :dot="false">{{ t('mcpKeys.expired') }}</MdStatus>
          </div>
          <div class="md-body-small txt-variant">{{ t('mcpKeys.createdAt', { time: fmtDate(k.created_at) }) }} · {{ t('mcpKeys.lastUsed', { time: k.last_used_at ? relTime(k.last_used_at) : t('common.never') }) }}</div>
          <div class="md-body-small" :class="isExpired(k.expires_at) ? '' : 'txt-variant'" :style="isExpired(k.expires_at) ? { color: 'var(--md-sys-color-error)', fontWeight: 500 } : undefined">{{ t('mcpKeys.expires', { time: k.expires_at ? fmtDate(k.expires_at) : t('common.never') }) }}</div>
          <div class="row gap-2" :style="{ marginTop: 'auto', paddingTop: '4px' }">
            <MdButton variant="text" icon="block" @click="askRevoke(k.id, k.name)">{{ t('mcpKeys.revoke') }}</MdButton>
          </div>
        </div>
      </div>
      <p v-if="atLimit" class="md-body-small txt-variant text-center" :style="{ margin: 0 }">{{ t('mcpKeys.limitReached') }}</p>
    </template>

    <div class="card card-elevated card-pad">
      <div class="md-title-large" :style="{ marginBottom: '4px' }">{{ t('mcpKeys.configTitle') }}</div>
      <p class="md-body-small txt-variant" :style="{ margin: '0 0 12px' }">{{ t('mcpKeys.configBody') }}</p>
      <div :style="{ position: 'relative' }">
        <pre class="code-block" :style="{ margin: 0 }">{{ configSnippet }}</pre>
        <MdCopyButton :value="configSnippet" :style="{ position: 'absolute', top: '8px', right: '8px' }" />
      </div>
    </div>

    <!-- Tool-call audit log -->
    <div class="card card-elevated card-pad col gap-3">
      <div class="row gap-2" :style="{ alignItems: 'center' }">
        <MdSym name="receipt_long" :style="{ color: 'var(--md-sys-color-primary)' }" />
        <div class="md-title-large" :style="{ flex: 1 }">{{ t('mcpKeys.audit.title') }}</div>
        <MdSelect
          v-if="!auditLoading && auditLogs.length"
          :model-value="toolFilter"
          :options="toolOptions"
          tf-bg="var(--md-sys-color-surface-container-high)"
          :style="{ minWidth: '180px' }"
          @update:model-value="(v: string) => (toolFilter = v)"
        />
        <MdButton variant="text" icon="refresh" :loading="auditLoading" @click="loadAuditLogs">{{ t('common.refresh') }}</MdButton>
      </div>
      <p class="md-body-small txt-variant" :style="{ margin: 0 }">{{ t('mcpKeys.audit.subtitle') }}</p>

      <div v-if="auditLoading" class="col gap-2">
        <SkeletonBlock v-for="i in 4" :key="i" height="44px" radius="8px" />
      </div>
      <div v-else-if="!visibleLogs.length" class="text-center txt-variant md-body-medium" :style="{ padding: '24px 0' }">
        {{ t('mcpKeys.audit.empty') }}
      </div>
      <div v-else :style="{ overflowX: 'auto' }">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ t('mcpKeys.audit.tool') }}</th>
              <th>{{ t('mcpKeys.audit.status') }}</th>
              <th>{{ t('mcpKeys.audit.when') }}</th>
              <th>{{ t('mcpKeys.audit.error') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in visibleLogs" :key="log.id">
              <td><span class="code-inline mono">{{ log.tool_name }}</span></td>
              <td>
                <MdStatus :kind="log.result_ok ? 'success' : 'error'" :dot="false">
                  {{ log.result_ok ? t('mcpKeys.audit.ok') : t('mcpKeys.audit.fail') }}
                </MdStatus>
              </td>
              <td class="txt-variant md-body-small">{{ relTime(log.called_at) }}</td>
              <td class="md-body-small" :class="log.error_msg ? '' : 'txt-variant'" :style="{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: log.error_msg ? 'var(--md-sys-color-error)' : undefined }" :title="log.error_msg || ''">
                {{ log.error_msg || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create dialog -->
    <MdDialog v-model:open="showCreate" :title="t('mcpKeys.createTitle')" :submitting="creating">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <MdTextField v-model="form.name" :label="t('mcpKeys.nameLabel')" :placeholder="t('mcpKeys.namePlaceholder')" tf-bg="var(--md-sys-color-surface-container-high)" />
        <div>
          <p class="md-label-large txt-variant" :style="{ margin: '0 0 8px' }">{{ t('mcpKeys.capabilitiesLabel') }}</p>
          <div class="col gap-2">
            <label v-for="c in CAPS" :key="c" class="row gap-3" :style="{ cursor: 'pointer', padding: '4px 0' }">
              <input type="checkbox" :checked="form.caps.includes(c)" :style="{ accentColor: 'var(--md-sys-color-primary)', width: '18px', height: '18px' }" @change="toggleCap(c)">
              <span class="md-body-medium">{{ t(`mcpKeys.caps.${c}`) }} <span class="code-inline mono" :style="{ fontSize: '11px' }">{{ c }}</span></span>
            </label>
          </div>
        </div>
        <div v-if="formHasWrite" class="card card-outlined card-pad row gap-3" :style="{ alignItems: 'flex-start', borderColor: 'var(--md-sys-color-error)' }">
          <MdSym name="warning" :style="{ color: 'var(--md-sys-color-error)' }" fill />
          <span class="md-body-small" :style="{ color: 'var(--md-sys-color-error)' }">{{ t('mcpKeys.writeWarning') }}</span>
        </div>
        <MdTextField :model-value="form.expires" type="date" :label="t('mcpKeys.expiresLabel')" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.expires = v)" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="creating" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="add" :disabled="!form.name.trim() || !form.caps.length" :loading="creating" @click="create">{{ t('common.create') }}</MdButton>
      </template>
    </MdDialog>

    <!-- One-time secret reveal -->
    <MdDialog v-model:open="showSecret" :title="t('mcpKeys.created')" @close="clearSecret">
      <p class="md-body-medium">{{ t('mcpKeys.secretOnce') }}</p>
      <div v-if="secretIsWrite" class="card card-outlined card-pad row gap-3" :style="{ alignItems: 'flex-start', marginTop: '12px', borderColor: 'var(--md-sys-color-error)' }">
        <MdSym name="warning" :style="{ color: 'var(--md-sys-color-error)' }" fill />
        <span class="md-body-small" :style="{ color: 'var(--md-sys-color-error)' }">{{ t('mcpKeys.writeKeyWarning') }}</span>
      </div>
      <div class="code-block" :style="{ marginTop: '12px', position: 'relative', wordBreak: 'break-all', whiteSpace: 'pre-wrap', paddingRight: '44px' }">
        {{ secret }}
        <MdCopyButton :value="secret || ''" :style="{ position: 'absolute', top: '6px', right: '6px' }" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="filled" icon="check" @click="close">{{ t('mcpKeys.iSaved') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Revoke -->
    <MdDialog v-model:open="showRevoke" :title="t('mcpKeys.revokeTitle')" :submitting="revoking">
      <p class="md-body-medium">{{ t('mcpKeys.revokeConfirm', { name: revokeName }) }}</p>
      <p class="md-body-small txt-variant" :style="{ marginTop: '8px' }">{{ t('mcpKeys.revokeBody') }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="revoking" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="block" :loading="revoking" @click="doRevoke">{{ t('mcpKeys.revoke') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
