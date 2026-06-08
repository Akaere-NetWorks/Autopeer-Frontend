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
const ADMIN_KEY_MAX = 10

const view = ref<'admin' | 'user' | 'audit'>('admin')
const viewOptions = computed(() => [
  { value: 'admin', label: t('admin.mcpKeys.ownKeys'), icon: 'key' },
  { value: 'user', label: t('admin.mcpKeys.userKeys'), icon: 'group' },
  { value: 'audit', label: t('admin.mcpKeys.auditLogs'), icon: 'history' },
])

// ── Admin keys ────────────────────────────────────────────────────────────────
const { data: adminKeys, pending: loadingAdmin, refresh: refreshAdmin } = await useAsyncData('admin-mcp-keys', () => api.admin.mcpKeys.list(), { lazy: true, server: false })
const showCreate = ref(false)
const newName = ref('')
// Deliberate default: every read capability EXCEPT the sensitive one.
const newCaps = ref<string[]>(ADMIN_CAPS.filter((c) => c !== 'admin:read:sensitive'))
const newExpiresAt = ref('')
const creating = ref(false)
const createdKey = ref<string | null>(null)
let revealTimer: ReturnType<typeof setTimeout> | null = null

function openCreate() {
  newName.value = ''
  newCaps.value = ADMIN_CAPS.filter((c) => c !== 'admin:read:sensitive')
  newExpiresAt.value = ''
  showCreate.value = true
}
function toggleCap(c: string) {
  newCaps.value = newCaps.value.includes(c) ? newCaps.value.filter((x) => x !== c) : [...newCaps.value, c]
}
function clearReveal() {
  if (revealTimer) { clearTimeout(revealTimer); revealTimer = null }
  createdKey.value = null
}
async function doCreate() {
  if (!newName.value || creating.value) return
  creating.value = true
  try {
    const body: { name: string, expires_at?: string, capabilities?: string[] } = { name: newName.value.trim() }
    if (newExpiresAt.value) body.expires_at = new Date(newExpiresAt.value).toISOString()
    if (newCaps.value.length) body.capabilities = newCaps.value
    const r = await api.admin.mcpKeys.create(body)
    showCreate.value = false
    createdKey.value = r.key ?? null
    // One-time secret: auto-clear from memory/UI after 60s.
    if (revealTimer) clearTimeout(revealTimer)
    if (createdKey.value) revealTimer = setTimeout(() => { createdKey.value = null; revealTimer = null }, 60_000)
    await refreshAdmin()
  } catch (e) { toast.error(e) } finally { creating.value = false }
}
const revokeAdminFor = ref<AdminMcpKey | null>(null)
const revokingAdmin = ref(false)
async function doRevokeAdmin() {
  if (!revokeAdminFor.value || revokingAdmin.value) return
  const k = revokeAdminFor.value
  revokingAdmin.value = true
  try {
    await api.admin.mcpKeys.remove(k.id)
    toast.show(t('admin.mcpKeys.revoked'))
    revokeAdminFor.value = null
    await refreshAdmin()
  } catch (e) { toast.error(e) } finally { revokingAdmin.value = false }
}

// Ready-to-paste admin MCP client config snippet (shown when at least one key exists).
const adminMcpConfig = computed(() => JSON.stringify({
  mcpServers: {
    autopeerAdmin: {
      type: 'sse',
      url: `${import.meta.client ? window.location.origin : ''}/api/v1/admin/mcp`,
      headers: { Authorization: 'Bearer <your-admin-key>' },
    },
  },
}, null, 2))

// ── User keys oversight ───────────────────────────────────────────────────────
const userAsnInput = ref('')
const userAsnApplied = ref('')
const { data: userKeys, pending: loadingUser, refresh: refreshUser } = await useAsyncData(
  'admin-user-mcp-keys',
  () => api.admin.mcpKeys.userKeys(userAsnApplied.value ? Number(userAsnApplied.value) : undefined),
  { lazy: true, server: false },
)
async function applyUserFilter() {
  userAsnApplied.value = userAsnInput.value
  await refreshUser()
}
const revokeUserFor = ref<McpKey | null>(null)
const revokingUser = ref(false)
async function doRevokeUser() {
  if (!revokeUserFor.value || revokingUser.value) return
  const k = revokeUserFor.value
  revokingUser.value = true
  try {
    await api.admin.mcpKeys.forceRemoveUserKey(k.id)
    toast.show(t('admin.mcpKeys.revoked'))
    revokeUserFor.value = null
    await refreshUser()
  } catch (e) { toast.error(e) } finally { revokingUser.value = false }
}

// ── Audit logs ────────────────────────────────────────────────────────────────
const AUDIT_PER_PAGE = 50
const auditAsnInput = ref('')
const auditToolInput = ref('')
const auditAsnApplied = ref('')
const auditToolApplied = ref('')
const auditPage = ref(1)
const { data: auditData, pending: loadingAudit, refresh: refreshAudit } = await useAsyncData(
  'admin-mcp-audit',
  () => api.admin.mcpKeys.auditLogs({
    asn: auditAsnApplied.value ? Number(auditAsnApplied.value) : undefined,
    tool: auditToolApplied.value || undefined,
    page: auditPage.value,
    per_page: AUDIT_PER_PAGE,
  }),
  { watch: [auditPage], lazy: true, server: false },
)
const auditLogs = computed(() => auditData.value?.logs ?? [])
async function applyAuditFilter() {
  auditAsnApplied.value = auditAsnInput.value
  auditToolApplied.value = auditToolInput.value.trim()
  if (auditPage.value === 1) await refreshAudit()
  else auditPage.value = 1 // watch triggers the refetch
}
function capLabel(c: string) { return c.replace('admin:read:', '') }

onUnmounted(() => { if (revealTimer) clearTimeout(revealTimer) })

// Select the whole secret on click so it can be copied with one keystroke.
function selectAll(e: MouseEvent) {
  if (!import.meta.client) return
  const node = e.currentTarget as Node
  const sel = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(node)
  sel?.removeAllRanges()
  sel?.addRange(range)
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="key" :title="t('admin.mcpKeys.title')" :subtitle="t('admin.mcpKeys.subtitle')" />

    <div class="row space-between flex-wrap gap-3">
      <MdSegmented v-model="view" :options="viewOptions" />
      <MdButton v-if="view === 'admin'" variant="filled" icon="add" :disabled="(adminKeys?.length ?? 0) >= ADMIN_KEY_MAX" @click="openCreate">{{ t('admin.mcpKeys.create') }}</MdButton>
    </div>

    <!-- Admin keys -->
    <template v-if="view === 'admin'">
      <div v-if="loadingAdmin" class="col gap-3"><SkeletonBlock v-for="i in 2" :key="i" height="80px" radius="12px" /></div>
      <div v-else-if="!adminKeys?.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.mcpKeys.empty') }}</div>
      <div v-else class="col gap-3">
        <div v-for="k in adminKeys" :key="k.id" class="card card-elevated card-pad row gap-4 flex-wrap" :style="{ alignItems: 'center' }">
          <div :style="{ flex: 1, minWidth: '220px' }">
            <div class="md-title-medium">{{ k.name }}</div>
            <div class="md-body-small mono txt-variant">{{ k.key_prefix }}… · {{ t('admin.mcpKeys.created') }} {{ relTime(k.created_at) }} · {{ t('admin.mcpKeys.lastUsed') }} {{ k.last_used_at ? relTime(k.last_used_at) : t('common.never') }}</div>
            <div class="row gap-2 flex-wrap" :style="{ marginTop: '8px' }">
              <span v-for="c in k.capabilities" :key="c" class="status status-info">{{ capLabel(c) }}</span>
            </div>
          </div>
          <div class="md-body-small txt-variant">{{ k.expires_at ? `${t('admin.mcpKeys.expires')} ${fmtDate(k.expires_at)}` : t('common.never') }}</div>
          <MdButton variant="text" icon="delete" @click="revokeAdminFor = k">{{ t('admin.mcpKeys.revoke') }}</MdButton>
        </div>

        <!-- Admin MCP client config snippet -->
        <div class="card card-outlined card-pad col gap-2">
          <div class="md-body-small txt-variant">{{ t('admin.mcpKeys.configDesc') }}</div>
          <div class="code-block" :style="{ position: 'relative' }">
            <pre :style="{ margin: 0, whiteSpace: 'pre', overflowX: 'auto' }">{{ adminMcpConfig }}</pre>
            <MdCopyButton :value="adminMcpConfig" :style="{ position: 'absolute', top: '6px', right: '6px' }" />
          </div>
        </div>
      </div>
    </template>

    <!-- User keys -->
    <template v-else-if="view === 'user'">
      <div class="row gap-2" :style="{ maxWidth: '360px' }">
        <MdTextField :model-value="userAsnInput" icon="tag" :placeholder="t('admin.mcpKeys.filterAsn')" inputmode="numeric" mono :style="{ flex: 1 }" @update:model-value="(v: string) => (userAsnInput = v.replace(/\D/g, ''))" @keydown.enter="applyUserFilter" />
        <MdIconButton icon="search" :title="t('common.search')" @click="applyUserFilter" />
      </div>
      <div v-if="loadingUser" class="col gap-3"><SkeletonBlock v-for="i in 2" :key="i" height="64px" radius="12px" /></div>
      <div v-else-if="!userKeys?.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.mcpKeys.empty') }}</div>
      <div v-else class="card card-elevated">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>{{ t('admin.mcpKeys.asn') }}</th><th>{{ t('admin.mcpKeys.name') }}</th><th>{{ t('admin.mcpKeys.prefix') }}</th><th>{{ t('admin.mcpKeys.capabilities') }}</th><th>{{ t('admin.mcpKeys.expires') }}</th><th>{{ t('admin.mcpKeys.lastUsed') }}</th><th /></tr></thead>
            <tbody>
              <tr v-for="k in userKeys" :key="k.id">
                <td class="mono">AS{{ k.asn }}</td>
                <td>{{ k.name }}</td>
                <td><span class="code-inline">{{ k.key_prefix }}…</span></td>
                <td>
                  <div class="row gap-1 flex-wrap">
                    <span v-for="c in k.capabilities" :key="c" class="status status-info">{{ capLabel(c) }}</span>
                  </div>
                </td>
                <td class="md-body-small txt-variant">{{ k.expires_at ? fmtDate(k.expires_at) : t('common.dash') }}</td>
                <td class="md-body-small txt-variant">{{ k.last_used_at ? relTime(k.last_used_at) : t('common.dash') }}</td>
                <td :style="{ textAlign: 'right' }"><MdIconButton icon="delete" :title="t('admin.mcpKeys.forceRevoke')" @click="revokeUserFor = k" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Audit logs -->
    <template v-else>
      <div class="row gap-2 flex-wrap" :style="{ alignItems: 'center' }">
        <MdTextField :model-value="auditAsnInput" icon="tag" :placeholder="t('admin.mcpKeys.filterAsn')" inputmode="numeric" mono :style="{ width: '160px' }" @update:model-value="(v: string) => (auditAsnInput = v.replace(/\D/g, ''))" @keydown.enter="applyAuditFilter" />
        <MdTextField :model-value="auditToolInput" icon="search" :placeholder="t('admin.mcpKeys.filterTool')" :style="{ width: '220px' }" @update:model-value="(v: string) => (auditToolInput = v)" @keydown.enter="applyAuditFilter" />
        <MdButton variant="tonal" icon="search" @click="applyAuditFilter">{{ t('common.search') }}</MdButton>
      </div>
      <div v-if="loadingAudit && !auditLogs.length" class="col gap-3"><SkeletonBlock v-for="i in 4" :key="i" height="52px" radius="12px" /></div>
      <div v-else-if="!auditLogs.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.mcpKeys.empty') }}</div>
      <template v-else>
        <div class="card card-elevated">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>{{ t('admin.mcpKeys.tool') }}</th><th>{{ t('admin.mcpKeys.asn') }}</th><th>{{ t('admin.mcpKeys.admin') }}</th><th>{{ t('admin.mcpKeys.result') }}</th><th>{{ t('admin.mcpKeys.error') }}</th><th>{{ t('admin.mcpKeys.calledAt') }}</th></tr></thead>
              <tbody>
                <tr v-for="l in auditLogs" :key="l.id">
                  <td class="mono">{{ l.tool_name }}</td>
                  <td class="mono">{{ l.asn ? `AS${l.asn}` : t('common.dash') }}</td>
                  <td class="mono txt-variant">{{ l.admin_id || t('common.dash') }}</td>
                  <td><MdStatus :kind="l.result_ok ? 'success' : 'error'">{{ l.result_ok ? 'OK' : 'ERR' }}</MdStatus></td>
                  <td class="md-body-small" :style="{ color: l.error_msg ? 'var(--md-sys-color-error)' : undefined, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }" :title="l.error_msg || ''">{{ l.error_msg || t('common.dash') }}</td>
                  <td :style="{ whiteSpace: 'nowrap' }">{{ relTime(l.called_at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="row space-between" :style="{ alignItems: 'center' }">
          <span class="md-body-small txt-variant">{{ t('admin.mcpKeys.page', { page: auditPage }) }}</span>
          <div class="row gap-2">
            <MdIconButton icon="chevron_left" :disabled="auditPage <= 1" :title="t('common.back')" @click="auditPage--" />
            <MdIconButton icon="chevron_right" :disabled="auditLogs.length < AUDIT_PER_PAGE" :title="t('common.next')" @click="auditPage++" />
          </div>
        </div>
      </template>
    </template>

    <!-- Create admin key -->
    <MdDialog :open="showCreate" :title="t('admin.mcpKeys.createTitle')" :submitting="creating" @update:open="showCreate = false">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <MdTextField :label="t('admin.mcpKeys.name')" :model-value="newName" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (newName = v)" @keydown.enter="doCreate" />
        <MdTextField :label="t('admin.mcpKeys.expiresAt')" :model-value="newExpiresAt" type="datetime-local" tf-bg="var(--md-sys-color-surface-container-high)" :supporting="t('admin.mcpKeys.expiresHint')" @update:model-value="(v: string) => (newExpiresAt = v)" />
        <div>
          <div class="md-label-large txt-variant" :style="{ marginBottom: '8px' }">{{ t('admin.mcpKeys.capabilities') }}</div>
          <div class="row gap-2 flex-wrap">
            <MdChip v-for="c in ADMIN_CAPS" :key="c" :selected="newCaps.includes(c)" @click="toggleCap(c)">{{ capLabel(c) }}</MdChip>
          </div>
        </div>
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="creating" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :disabled="!newName" :loading="creating" @click="doCreate">{{ t('common.create') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Created key reveal (one-time secret) -->
    <MdDialog :open="!!createdKey" :title="t('admin.mcpKeys.keyTitle')" @update:open="clearReveal">
      <div class="status status-warning" :style="{ marginBottom: '12px' }">
        <MdSym name="warning" :size="18" />
        <span>{{ t('admin.mcpKeys.keyBody') }}</span>
      </div>
      <div class="code-block" :style="{ position: 'relative', wordBreak: 'break-all', whiteSpace: 'normal' }">
        <span class="mono" tabindex="0" :style="{ display: 'block', paddingRight: '40px', cursor: 'text', userSelect: 'all' }" @click="selectAll">{{ createdKey }}</span>
        <MdCopyButton :value="createdKey || ''" :style="{ position: 'absolute', top: '6px', right: '6px' }" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="filled" @click="close">{{ t('admin.mcpKeys.iSaved') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Revoke confirms -->
    <MdDialog :open="!!revokeAdminFor" :title="t('admin.mcpKeys.revoke')" :submitting="revokingAdmin" @update:open="revokeAdminFor = null">
      <p :style="{ margin: 0 }">{{ t('admin.mcpKeys.revokeConfirm', { name: revokeAdminFor?.name }) }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="revokingAdmin" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="revokingAdmin" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" @click="doRevokeAdmin">{{ t('admin.mcpKeys.revoke') }}</MdButton>
      </template>
    </MdDialog>
    <MdDialog :open="!!revokeUserFor" :title="t('admin.mcpKeys.forceRevoke')" :submitting="revokingUser" @update:open="revokeUserFor = null">
      <p :style="{ margin: 0 }">{{ t('admin.mcpKeys.forceRevokeConfirm', { asn: revokeUserFor?.asn, name: revokeUserFor?.name }) }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="revokingUser" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="revokingUser" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" @click="doRevokeUser">{{ t('admin.mcpKeys.forceRevoke') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
