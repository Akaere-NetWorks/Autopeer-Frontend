<script setup lang="ts">
definePageMeta({ middleware: 'auth', title: 'nav.mcpKeys' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const cfg = useRuntimeConfig()
const { relTime, fmtDate } = useFormat()

const { data: keys, pending, refresh } = await useAsyncData('mcp-keys', () => api.mcp.list().catch(() => []))
const activeKeys = computed(() => (keys.value ?? []).filter((k) => !k.revoked_at))

const CAPS = [
  'read:nodes', 'read:peers', 'read:metrics', 'read:audit',
  'write:peer:create', 'write:peer:update_pending', 'write:peer:cancel_pending', 'write:operation:create',
]
const DEFAULT_CAPS = ['read:nodes', 'read:peers', 'read:metrics']

const isWrite = (caps: string[]) => caps.some((c) => c.startsWith('write:'))

const mcpUrl = computed(() => `${cfg.public.siteUrl}/api/v1/mcp`)
const configSnippet = computed(() => `{
  "mcpServers": {
    "autopeer": {
      "url": "${mcpUrl.value}",
      "headers": { "Authorization": "Bearer ap_mcp_…" }
    }
  }
}`)

// Create
const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ name: '', caps: [...DEFAULT_CAPS], expires: '' })
function toggleCap(c: string) {
  const i = form.caps.indexOf(c)
  if (i >= 0) form.caps.splice(i, 1)
  else form.caps.push(c)
}
function openCreate() {
  form.name = ''
  form.caps = [...DEFAULT_CAPS]
  form.expires = ''
  showCreate.value = true
}

// Secret reveal
const secret = ref<string | null>(null)
const showSecret = ref(false)

async function create() {
  if (!form.name.trim()) return
  creating.value = true
  try {
    const res = await api.mcp.create({
      name: form.name.trim(),
      capabilities: form.caps.length ? form.caps : undefined,
      expires_at: form.expires ? new Date(form.expires).toISOString() : null,
    })
    showCreate.value = false
    if (res.key) {
      secret.value = res.key
      showSecret.value = true
    }
    toast.show(t('mcpKeys.created'))
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    creating.value = false
  }
}

// Revoke
const showRevoke = ref(false)
const revokeId = ref<string | null>(null)
const revoking = ref(false)
function askRevoke(id: string) {
  revokeId.value = id
  showRevoke.value = true
}
async function doRevoke() {
  if (!revokeId.value) return
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

async function copy(text: string) {
  if (import.meta.client && navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    toast.show(t('common.copied'))
  }
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="vpn_key" :title="t('mcpKeys.title')" :subtitle="t('mcpKeys.subtitle')">
      <template #action>
        <MdButton variant="filled" icon="add" @click="openCreate">{{ t('mcpKeys.newKey') }}</MdButton>
      </template>
    </PageHeader>

    <div v-if="pending" class="metric-3">
      <SkeletonBlock v-for="i in 3" :key="i" height="160px" radius="12px" />
    </div>

    <div v-else-if="!activeKeys.length" class="card card-outlined card-pad text-center txt-variant">{{ t('mcpKeys.empty') }}</div>

    <div v-else class="metric-3">
      <div v-for="k in activeKeys" :key="k.id" class="card card-elevated card-pad col gap-3">
        <div class="row gap-2">
          <MdSym name="vpn_key" :style="{ color: 'var(--md-sys-color-primary)' }" fill />
          <span class="md-title-medium" :style="{ flex: 1 }">{{ k.name }}</span>
          <MdStatus :kind="isWrite(k.capabilities) ? 'warning' : 'info'" :dot="false">
            {{ isWrite(k.capabilities) ? t('mcpKeys.readWrite') : t('mcpKeys.readOnly') }}
          </MdStatus>
        </div>
        <div class="code-inline mono" :style="{ alignSelf: 'flex-start' }">{{ k.key_prefix }}…</div>
        <div class="md-body-small txt-variant">{{ t('mcpKeys.createdAt', { time: fmtDate(k.created_at) }) }} · {{ t('mcpKeys.lastUsed', { time: k.last_used_at ? relTime(k.last_used_at) : t('common.never') }) }}</div>
        <div class="md-body-small txt-variant">{{ t('mcpKeys.expires', { time: k.expires_at ? fmtDate(k.expires_at) : t('common.never') }) }}</div>
        <div class="row gap-2" :style="{ marginTop: 'auto', paddingTop: '4px' }">
          <MdButton variant="text" icon="content_copy" @click="copy(k.key_prefix)">{{ t('common.copy') }}</MdButton>
          <MdButton variant="text" icon="block" @click="askRevoke(k.id)">{{ t('mcpKeys.revoke') }}</MdButton>
        </div>
      </div>
    </div>

    <div class="card card-elevated card-pad">
      <div class="md-title-large" :style="{ marginBottom: '4px' }">{{ t('mcpKeys.configTitle') }}</div>
      <p class="md-body-small txt-variant" :style="{ margin: '0 0 12px' }">{{ t('mcpKeys.configBody') }}</p>
      <pre class="code-block" :style="{ margin: 0 }">{{ configSnippet }}</pre>
    </div>

    <!-- Create dialog -->
    <MdDialog v-model:open="showCreate" :title="t('mcpKeys.createTitle')">
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
        <MdTextField :model-value="form.expires" type="date" :label="t('mcpKeys.expiresLabel')" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.expires = v)" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="add" :disabled="!form.name.trim()" :loading="creating" @click="create">{{ t('common.create') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Secret reveal -->
    <MdDialog v-model:open="showSecret" :title="t('mcpKeys.created')">
      <p>{{ t('mcpKeys.secretOnce') }}</p>
      <div class="code-block" :style="{ marginTop: '12px', position: 'relative', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }">
        {{ secret }}
        <button class="icon-btn" :style="{ position: 'absolute', top: '6px', right: '6px', width: '32px', height: '32px' }" :title="t('common.copy')" @click="copy(secret || '')">
          <MdSym name="content_copy" :size="18" />
        </button>
      </div>
      <template #actions="{ close }">
        <MdButton variant="filled" icon="check" @click="close">{{ t('common.confirm') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Revoke -->
    <MdDialog v-model:open="showRevoke" :title="t('mcpKeys.revokeTitle')">
      <p>{{ t('mcpKeys.revokeBody') }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="block" :loading="revoking" @click="doRevoke">{{ t('mcpKeys.revoke') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
