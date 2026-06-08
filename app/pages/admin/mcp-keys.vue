<script setup lang="ts">
import type { AdminMcpKey } from '~/types/admin'
import type { McpKey } from '~/types/api'

definePageMeta({ middleware: 'admin', title: 'nav.admin.mcpKeys' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const { relTime, fmtDate } = useFormat()

const ADMIN_CAPS = [
  'admin:read:topology', 'admin:read:peers', 'admin:read:metrics', 'admin:read:audit',
  'admin:read:mcp_keys', 'admin:read:settings', 'admin:read:system', 'admin:read:sensitive',
]

const view = ref<'admin' | 'user' | 'audit'>('admin')
const viewOptions = computed(() => [
  { value: 'admin', label: t('admin.mcpKeys.title'), icon: 'key' },
  { value: 'user', label: t('admin.mcpKeys.userKeys'), icon: 'group' },
  { value: 'audit', label: t('admin.mcpKeys.auditLogs' /* fallback below */), icon: 'history' },
])

// ── Admin keys ────────────────────────────────────────────────────────────────
const { data: adminKeys, pending: loadingAdmin, refresh: refreshAdmin } = await useAsyncData('admin-mcp-keys', () => api.admin.mcpKeys.list())
const showCreate = ref(false)
const newName = ref('')
const newCaps = ref<string[]>([...ADMIN_CAPS.slice(0, 6)])
const creating = ref(false)
const createdKey = ref<string | null>(null)

function toggleCap(c: string) {
  newCaps.value = newCaps.value.includes(c) ? newCaps.value.filter((x) => x !== c) : [...newCaps.value, c]
}
async function doCreate() {
  creating.value = true
  try {
    const r = await api.admin.mcpKeys.create({ name: newName.value, capabilities: newCaps.value.length ? newCaps.value : undefined })
    showCreate.value = false
    createdKey.value = r.key ?? null
    newName.value = ''; newCaps.value = [...ADMIN_CAPS.slice(0, 6)]
    await refreshAdmin()
  } catch (e) { toast.error(e) } finally { creating.value = false }
}
const revokeAdminFor = ref<AdminMcpKey | null>(null)
async function doRevokeAdmin() {
  const k = revokeAdminFor.value!; revokeAdminFor.value = null
  try { await api.admin.mcpKeys.remove(k.id); toast.show(t('admin.mcpKeys.revoked')); await refreshAdmin() } catch (e) { toast.error(e) }
}

// ── User keys oversight ───────────────────────────────────────────────────────
const userAsn = ref('')
const { data: userKeys, pending: loadingUser, refresh: refreshUser } = await useAsyncData(
  'admin-user-mcp-keys',
  () => api.admin.mcpKeys.userKeys(userAsn.value ? Number(userAsn.value) : undefined),
  { watch: [userAsn] },
)
const revokeUserFor = ref<McpKey | null>(null)
async function doRevokeUser() {
  const k = revokeUserFor.value!; revokeUserFor.value = null
  try { await api.admin.mcpKeys.forceRemoveUserKey(k.id); toast.show(t('admin.mcpKeys.revoked')); await refreshUser() } catch (e) { toast.error(e) }
}

// ── Audit logs ────────────────────────────────────────────────────────────────
const { data: auditData, pending: loadingAudit } = await useAsyncData('admin-mcp-audit', () => api.admin.mcpKeys.auditLogs({ per_page: 50 }))
const auditLogs = computed(() => auditData.value?.logs ?? [])

async function copy(text: string) {
  if (import.meta.client && navigator.clipboard) { await navigator.clipboard.writeText(text); toast.show(t('common.copied')) }
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="key" :title="t('admin.mcpKeys.title')" :subtitle="t('admin.mcpKeys.subtitle')" />

    <div class="row space-between flex-wrap gap-3">
      <MdSegmented v-model="view" :options="viewOptions" />
      <MdButton v-if="view === 'admin'" variant="filled" icon="add" @click="showCreate = true">{{ t('admin.mcpKeys.create') }}</MdButton>
    </div>

    <!-- Admin keys -->
    <template v-if="view === 'admin'">
      <div v-if="loadingAdmin" class="col gap-3"><SkeletonBlock v-for="i in 2" :key="i" height="80px" radius="12px" /></div>
      <div v-else-if="!adminKeys?.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.mcpKeys.empty') }}</div>
      <div v-else class="col gap-3">
        <div v-for="k in adminKeys" :key="k.id" class="card card-elevated card-pad row gap-4 flex-wrap" :style="{ alignItems: 'center' }">
          <div :style="{ flex: 1, minWidth: '220px' }">
            <div class="md-title-medium">{{ k.name }}</div>
            <div class="md-body-small mono txt-variant">{{ k.key_prefix }}… · {{ t('admin.mcpKeys.created') }} {{ relTime(k.created_at) }}</div>
            <div class="row gap-2 flex-wrap" :style="{ marginTop: '8px' }">
              <span v-for="c in k.capabilities" :key="c" class="status status-info">{{ c.replace('admin:read:', '') }}</span>
            </div>
          </div>
          <div class="md-body-small txt-variant">{{ k.expires_at ? `${t('admin.mcpKeys.expires')} ${fmtDate(k.expires_at)}` : t('common.never') }}</div>
          <MdButton variant="text" icon="delete" @click="revokeAdminFor = k">{{ t('admin.mcpKeys.revoke') }}</MdButton>
        </div>
      </div>
    </template>

    <!-- User keys -->
    <template v-else-if="view === 'user'">
      <div class="row" :style="{ maxWidth: '280px' }">
        <MdTextField :model-value="userAsn" icon="tag" :placeholder="t('admin.mcpKeys.filterAsn')" inputmode="numeric" mono :style="{ width: '100%' }" @update:model-value="(v: string) => (userAsn = v.replace(/\D/g, ''))" />
      </div>
      <div v-if="loadingUser" class="col gap-3"><SkeletonBlock v-for="i in 2" :key="i" height="64px" radius="12px" /></div>
      <div v-else-if="!userKeys?.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.mcpKeys.empty') }}</div>
      <div v-else class="card card-elevated">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>{{ t('admin.mcpKeys.asn') }}</th><th>{{ t('admin.mcpKeys.name') }}</th><th>{{ t('admin.mcpKeys.prefix') }}</th><th>{{ t('admin.mcpKeys.lastUsed') }}</th><th /></tr></thead>
            <tbody>
              <tr v-for="k in userKeys" :key="k.id">
                <td class="mono">AS{{ k.asn }}</td>
                <td>{{ k.name }}</td>
                <td><span class="code-inline">{{ k.key_prefix }}…</span></td>
                <td>{{ k.last_used_at ? relTime(k.last_used_at) : t('common.never') }}</td>
                <td :style="{ textAlign: 'right' }"><MdIconButton icon="delete" :title="t('admin.mcpKeys.forceRevoke')" @click="revokeUserFor = k" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Audit logs -->
    <template v-else>
      <div v-if="loadingAudit" class="col gap-3"><SkeletonBlock v-for="i in 4" :key="i" height="52px" radius="12px" /></div>
      <div v-else-if="!auditLogs.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.mcpKeys.empty') }}</div>
      <div v-else class="card card-elevated">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>{{ t('admin.mcpKeys.tool' /* */) }}</th><th>ASN</th><th>{{ t('admin.mcpKeys.result' /* */) }}</th><th>{{ t('admin.mcpKeys.calledAt' /* */) }}</th></tr></thead>
            <tbody>
              <tr v-for="l in auditLogs" :key="l.id">
                <td class="mono">{{ l.tool_name }}</td>
                <td class="mono">{{ l.asn ? `AS${l.asn}` : (l.admin_id ? 'admin' : t('common.dash')) }}</td>
                <td><MdStatus :kind="l.result_ok ? 'success' : 'error'">{{ l.result_ok ? 'OK' : 'ERR' }}</MdStatus></td>
                <td>{{ relTime(l.called_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Create admin key -->
    <MdDialog :open="showCreate" :title="t('admin.mcpKeys.createTitle')" @update:open="showCreate = false">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <MdTextField :label="t('admin.mcpKeys.name')" :model-value="newName" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (newName = v)" />
        <div>
          <div class="md-label-large txt-variant" :style="{ marginBottom: '8px' }">{{ t('admin.mcpKeys.capabilities') }}</div>
          <div class="row gap-2 flex-wrap">
            <MdChip v-for="c in ADMIN_CAPS" :key="c" :selected="newCaps.includes(c)" @click="toggleCap(c)">{{ c.replace('admin:read:', '') }}</MdChip>
          </div>
        </div>
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :disabled="!newName" :loading="creating" @click="doCreate">{{ t('common.create') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Created key reveal -->
    <MdDialog :open="!!createdKey" :title="t('admin.mcpKeys.keyTitle')" @update:open="createdKey = null">
      <p :style="{ margin: '0 0 12px' }">{{ t('admin.mcpKeys.keyBody') }}</p>
      <div class="code-block" :style="{ position: 'relative', wordBreak: 'break-all', whiteSpace: 'normal' }">
        {{ createdKey }}
        <button class="icon-btn" :style="{ position: 'absolute', top: '6px', right: '6px', width: '32px', height: '32px' }" :title="t('common.copy')" @click="copy(createdKey!)">
          <MdSym name="content_copy" :size="18" />
        </button>
      </div>
      <template #actions="{ close }">
        <MdButton variant="filled" @click="close">{{ t('common.close') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Revoke confirms -->
    <MdDialog :open="!!revokeAdminFor" :title="t('admin.mcpKeys.revoke')" @update:open="revokeAdminFor = null">
      <p :style="{ margin: 0 }">{{ revokeAdminFor?.name }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" @click="doRevokeAdmin">{{ t('admin.mcpKeys.revoke') }}</MdButton>
      </template>
    </MdDialog>
    <MdDialog :open="!!revokeUserFor" :title="t('admin.mcpKeys.forceRevoke')" @update:open="revokeUserFor = null">
      <p :style="{ margin: 0 }">AS{{ revokeUserFor?.asn }} · {{ revokeUserFor?.name }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" @click="doRevokeUser">{{ t('admin.mcpKeys.forceRevoke') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
