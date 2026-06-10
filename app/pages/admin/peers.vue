<script setup lang="ts">
import type { AdminPeerListItem, PeersImportResult } from '~/types/admin'

definePageMeta({ middleware: 'admin', title: 'nav.admin.peers' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const { meta } = usePeerStatus()
const { fmtBytes, fmtRtt } = useFormat()

const statuses = ['all', 'pending', 'active', 'suspended', 'rejected'] as const
type Filter = typeof statuses[number]
const filter = ref<Filter>(statuses.includes(route.query.status as Filter) ? route.query.status as Filter : 'all')
const page = ref(1)
const perPage = 20
const search = ref('')

const rows = ref<AdminPeerListItem[]>([])
const total = ref(0)
const loading = ref(true)
const counts = reactive<Record<Filter, number>>({ all: 0, pending: 0, active: 0, suspended: 0, rejected: 0 })

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage)))

// Client-side narrowing (ASN / node / endpoint) over the current page — mirrors
// the closed-source's per-page search; server pagination stays authoritative.
const peers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(p =>
    [`as${p.remote_asn}`, p.remote_asn, p.node_name, p.remote_endpoint, p.remote_pubkey]
      .join(' ').toLowerCase().includes(q))
})

async function load() {
  loading.value = true
  try {
    const res = await api.admin.peers.list({
      status: filter.value === 'all' ? undefined : filter.value,
      page: page.value,
      per_page: perPage,
    })
    rows.value = res.peers
    total.value = res.total
  } catch (e) {
    toast.error(e)
  } finally {
    loading.value = false
  }
}

// Per-status totals shown beside each filter chip (one cheap per_page:1 list call
// per status; refreshed after any moderation action mutates the population).
async function loadCounts() {
  try {
    const [all, pending, active, suspended, rejected] = await Promise.all([
      api.admin.peers.list({ per_page: 1, page: 1 }),
      api.admin.peers.list({ status: 'pending', per_page: 1, page: 1 }),
      api.admin.peers.list({ status: 'active', per_page: 1, page: 1 }),
      api.admin.peers.list({ status: 'suspended', per_page: 1, page: 1 }),
      api.admin.peers.list({ status: 'rejected', per_page: 1, page: 1 }),
    ])
    counts.all = all.total
    counts.pending = pending.total
    counts.active = active.total
    counts.suspended = suspended.total
    counts.rejected = rejected.total
  } catch { /* counts are best-effort */ }
}

async function refreshAll() {
  await Promise.all([load(), loadCounts()])
}

// Reset page synchronously, then run a single deterministic fetch so the table
// shows a loading state on every filter change instead of stale rows.
async function selectFilter(s: Filter) {
  if (filter.value === s && page.value === 1) return
  filter.value = s
  page.value = 1
  router.replace({ query: s === 'all' ? {} : { status: s } })
  await load()
}

async function gotoPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  await load()
}

function rowOpen(p: AdminPeerListItem) {
  router.push(`/admin/peers/${p.id}`)
}

// ── Action dialogs ────────────────────────────────────────────────────────────
const busy = ref<string | null>(null)
const submitting = ref(false)
const rejectFor = ref<AdminPeerListItem | null>(null)
const suspendFor = ref<AdminPeerListItem | null>(null)
const deleteFor = ref<AdminPeerListItem | null>(null)
const editFor = ref<AdminPeerListItem | null>(null)
const rejectReason = ref('')
const suspendReason = ref('')
const edit = reactive({ remote_pubkey: '', remote_endpoint: '', remote_lla: '', mtu: '' })

// Inline row action (approve / unsuspend) — disables the row while in flight.
async function act<T>(id: string, fn: () => Promise<T>, okMsg: string) {
  busy.value = id
  try {
    await fn()
    toast.show(t(okMsg))
    await refreshAll()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = null
  }
}

// Dialog submit — keeps the dialog OPEN while the request is in flight (confirm
// button shows a spinner and is disabled), closes only on success, and on
// failure leaves the dialog open so the admin can retry.
async function submit<T>(fn: () => Promise<T>, okMsg: string, onDone: () => void) {
  submitting.value = true
  try {
    await fn()
    toast.show(t(okMsg))
    onDone()
    await refreshAll()
  } catch (e) {
    toast.error(e)
  } finally {
    submitting.value = false
  }
}

function openReject(p: AdminPeerListItem) { rejectFor.value = p; rejectReason.value = '' }
function openSuspend(p: AdminPeerListItem) { suspendFor.value = p; suspendReason.value = '' }
function openEdit(p: AdminPeerListItem) {
  editFor.value = p
  edit.remote_pubkey = p.remote_pubkey
  edit.remote_endpoint = p.remote_endpoint
  edit.remote_lla = p.remote_lla
  edit.mtu = p.mtu != null ? String(p.mtu) : ''
}

function doReject() {
  const p = rejectFor.value!
  const reason = rejectReason.value.trim()
  if (!reason) return
  submit(() => api.admin.peers.reject(p.id, reason), 'admin.peers.wasRejected', () => { rejectFor.value = null })
}
function doSuspend() {
  const p = suspendFor.value!
  submit(() => api.admin.peers.suspend(p.id, suspendReason.value.trim() || undefined), 'admin.peers.wasSuspended', () => { suspendFor.value = null })
}
function doDelete() {
  const p = deleteFor.value!
  submit(() => api.admin.peers.remove(p.id), 'admin.peers.deleted', () => { deleteFor.value = null })
}
function doEdit() {
  const p = editFor.value!
  submit(() => api.admin.peers.update(p.id, {
    remote_pubkey: edit.remote_pubkey || undefined,
    remote_endpoint: edit.remote_endpoint || undefined,
    remote_lla: edit.remote_lla || undefined,
    mtu: edit.mtu ? Number(edit.mtu) : null,
  }), 'admin.peers.updated', () => { editFor.value = null })
}

// ── Export / Import ───────────────────────────────────────────────────────────
const exporting = ref(false)
const showImport = ref(false)
const importFile = ref<File | null>(null)
const importFileInput = ref<HTMLInputElement | null>(null)
const importOverwrite = ref(false)
const importing = ref(false)
const importError = ref('')
const importResult = ref<PeersImportResult | null>(null)

async function doExport() {
  exporting.value = true
  try {
    const blob = await api.admin.peers.exportBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'peers-export.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.show(t('admin.peers.exported'))
  } catch (e) {
    toast.error(e)
  } finally {
    exporting.value = false
  }
}

function openImport() {
  importFile.value = null
  importOverwrite.value = false
  importError.value = ''
  if (importFileInput.value) importFileInput.value.value = ''
  showImport.value = true
}

function onImportFile(e: Event) {
  const files = (e.target as HTMLInputElement).files
  importFile.value = files && files.length > 0 ? files[0]! : null
  importError.value = ''
}

async function doImport() {
  if (!importFile.value) return
  importing.value = true
  importError.value = ''
  try {
    const text = await importFile.value.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      importError.value = t('admin.peers.importInvalidJson')
      return
    }
    const res = await api.admin.peers.import(parsed, importOverwrite.value)
    importResult.value = res
    showImport.value = false
    toast.show(t('admin.peers.importDone'))
    await refreshAll()
  } catch (e: unknown) {
    importError.value = (e as { message?: string })?.message || t('admin.peers.importFailed')
  } finally {
    importing.value = false
  }
}

onMounted(refreshAll)
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="swap_horiz" :title="t('admin.peers.title')" :subtitle="t('admin.peers.subtitle')">
      <template #action>
        <div class="row gap-2 flex-wrap">
          <MdButton variant="outlined" icon="download" :loading="exporting" @click="doExport">{{ t('admin.peers.export') }}</MdButton>
          <MdButton variant="tonal" icon="upload" @click="openImport">{{ t('admin.peers.import') }}</MdButton>
        </div>
      </template>
    </PageHeader>

    <!-- Import result summary: warning tone when some rows failed, success otherwise -->
    <div
      v-if="importResult"
      class="row gap-3"
      :style="importResult.errors.length
        ? { alignItems: 'flex-start', padding: '16px', borderRadius: '16px', background: 'var(--md-sys-color-warning-container)', color: 'var(--md-sys-color-on-warning-container)' }
        : { alignItems: 'flex-start', padding: '16px', borderRadius: '16px', background: 'var(--md-sys-color-success-container)', color: 'var(--md-sys-color-on-success-container)' }"
    >
      <MdSym :name="importResult.errors.length ? 'warning' : 'check_circle'" :size="22" fill :style="{ flexShrink: 0 }" />
      <div :style="{ flex: 1, minWidth: 0 }">
        <div class="md-body-medium">{{ t('admin.peers.importResult', { imported: importResult.imported, overwritten: importResult.overwritten, skipped: importResult.skipped, total: importResult.total }) }}</div>
        <ul v-if="importResult.errors.length" class="md-body-small" :style="{ margin: '6px 0 0', paddingLeft: '18px' }">
          <li v-for="(err, i) in importResult.errors" :key="i">AS{{ err.asn }} ({{ err.node_id || t('common.dash') }}): {{ err.reason }}</li>
        </ul>
      </div>
      <MdIconButton icon="close" :title="t('common.close')" @click="importResult = null" />
    </div>

    <div class="row gap-2 flex-wrap" :style="{ alignItems: 'center' }">
      <MdChip v-for="s in statuses" :key="s" :selected="filter === s" @click="selectFilter(s)">
        {{ (s === 'all' ? t('common.all') : meta(s).label) }} ({{ counts[s] }})
      </MdChip>
      <div :style="{ flex: 1, minWidth: '180px' }">
        <MdTextField :model-value="search" :placeholder="t('admin.peers.searchPlaceholder')" icon="search" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (search = v)" />
      </div>
    </div>

    <div v-if="loading" class="col gap-3">
      <SkeletonBlock v-for="i in 6" :key="i" height="56px" radius="12px" />
    </div>

    <div v-else-if="!peers.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.peers.empty') }}</div>

    <template v-else>
      <div class="card card-elevated">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>{{ t('admin.peers.asn') }}</th>
                <th>{{ t('admin.peers.node') }}</th>
                <th>{{ t('admin.peers.endpoint') }}</th>
                <th>{{ t('admin.peers.bgp') }}</th>
                <th>{{ t('admin.peers.rtt') }}</th>
                <th>{{ t('admin.peers.traffic') }}</th>
                <th>{{ t('admin.peers.status') }}</th>
                <th :style="{ textAlign: 'right' }">{{ t('admin.peers.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in peers" :key="p.id" class="row-clickable" @click="rowOpen(p)">
                <td class="mono" :style="{ fontWeight: 500 }">AS{{ p.remote_asn }}</td>
                <td>{{ p.node_name }}</td>
                <td>
                  <span class="row gap-1" :style="{ alignItems: 'center' }">
                    <span class="code-inline">{{ p.remote_endpoint }}</span>
                    <MdSym v-if="p.endpoint_mismatch_since" name="warning" :size="16" :style="{ color: 'var(--md-sys-color-warning)' }" />
                  </span>
                </td>
                <td>{{ p.latest_bgp_state || t('common.dash') }}</td>
                <td class="mono">{{ fmtRtt(p.latest_rtt) }}</td>
                <td class="mono">{{ fmtBytes(p.rx_bytes_24h) }} / {{ fmtBytes(p.tx_bytes_24h) }}</td>
                <td><MdStatus :kind="meta(p.status).kind">{{ meta(p.status).label }}</MdStatus></td>
                <td @click.stop>
                  <div class="row gap-2" :style="{ justifyContent: 'flex-end' }">
                    <MdIconButton v-if="p.status === 'pending'" icon="check" :title="t('admin.peers.approve')" :disabled="busy === p.id" @click="act(p.id, () => api.admin.peers.approve(p.id), 'admin.peers.approved')" />
                    <MdIconButton v-if="p.status === 'pending'" icon="block" :title="t('admin.peers.reject')" :disabled="busy === p.id" @click="openReject(p)" />
                    <MdIconButton v-if="p.status === 'active'" icon="pause" :title="t('admin.peers.suspend')" :disabled="busy === p.id" @click="openSuspend(p)" />
                    <MdIconButton v-if="p.status === 'suspended'" icon="play_arrow" :title="t('admin.peers.unsuspend')" :disabled="busy === p.id" @click="act(p.id, () => api.admin.peers.unsuspend(p.id), 'admin.peers.unsuspended')" />
                    <MdIconButton icon="edit" :title="t('common.edit')" :disabled="busy === p.id" @click="openEdit(p)" />
                    <MdIconButton icon="delete" :title="t('common.delete')" :disabled="busy === p.id" @click="deleteFor = p" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="row space-between" :style="{ alignItems: 'center' }">
        <span class="md-body-small txt-variant">{{ t('admin.peers.total', { total, page }) }}</span>
        <div class="row gap-2">
          <MdIconButton icon="chevron_left" :disabled="page <= 1 || loading" :title="t('common.back')" @click="gotoPage(page - 1)" />
          <span class="md-label-large" :style="{ alignSelf: 'center' }">{{ page }} / {{ totalPages }}</span>
          <MdIconButton icon="chevron_right" :disabled="page >= totalPages || loading" :title="t('common.next')" @click="gotoPage(page + 1)" />
        </div>
      </div>
    </template>

    <!-- Reject -->
    <MdDialog :open="!!rejectFor" :title="t('admin.peers.rejectTitle')" :submitting="submitting" @update:open="rejectFor = null">
      <MdTextField :label="t('admin.peers.rejectReason')" :model-value="rejectReason" :supporting="t('admin.peers.rejectReasonHint')" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (rejectReason = v)" />
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="submitting" :disabled="!rejectReason.trim()" @click="doReject">{{ t('admin.peers.reject') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Suspend -->
    <MdDialog :open="!!suspendFor" :title="t('admin.peers.suspendTitle')" :submitting="submitting" @update:open="suspendFor = null">
      <MdTextField :label="t('admin.peers.suspendReason')" :model-value="suspendReason" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (suspendReason = v)" />
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="submitting" @click="doSuspend">{{ t('admin.peers.suspend') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Delete -->
    <ConfirmDialog
      :open="!!deleteFor"
      :title="t('admin.peers.deleteTitle')"
      :warning="t('admin.peers.deleteBody')"
      :recap="deleteFor ? [
        [t('admin.peers.asn'), `AS${deleteFor.remote_asn}`],
        [t('admin.peers.node'), deleteFor.node_name],
        [t('admin.peers.endpoint'), deleteFor.remote_endpoint],
      ] : []"
      :confirm-label="t('common.delete')"
      confirm-icon="delete"
      :submitting="submitting"
      @update:open="deleteFor = null"
      @confirm="doDelete"
    />

    <!-- Edit -->
    <MdDialog :open="!!editFor" :title="t('admin.peers.editTitle')" :submitting="submitting" @update:open="editFor = null">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <MdTextField :label="t('admin.peers.pubkey')" :model-value="edit.remote_pubkey" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (edit.remote_pubkey = v)" />
        <MdTextField :label="t('admin.peers.endpoint')" :model-value="edit.remote_endpoint" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (edit.remote_endpoint = v)" />
        <MdTextField :label="t('admin.peers.lla')" :model-value="edit.remote_lla" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (edit.remote_lla = v)" />
        <MdTextField :label="t('admin.peers.mtu')" :model-value="edit.mtu" inputmode="numeric" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (edit.mtu = v.replace(/\D/g, ''))" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="submitting" @click="doEdit">{{ t('common.save') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Import -->
    <MdDialog :open="showImport" :title="t('admin.peers.importTitle')" :submitting="importing" @update:open="showImport = false">
      <p :style="{ margin: '0 0 12px' }">{{ t('admin.peers.importHint') }}</p>
      <div class="field">
        <input ref="importFileInput" type="file" accept="application/json,.json" :style="{ width: '100%' }" @change="onImportFile">
      </div>
      <label class="row gap-3" :style="{ cursor: 'pointer', marginTop: '12px' }">
        <MdSwitch :model-value="importOverwrite" @update:model-value="(v: boolean) => (importOverwrite = v)" />
        <span class="md-body-medium">{{ t('admin.peers.importOverwrite') }}</span>
      </label>
      <div
        v-if="importError"
        class="row gap-2"
        :style="{ alignItems: 'flex-start', padding: '12px', borderRadius: '12px', marginTop: '12px', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }"
      >
        <MdSym name="warning" :size="20" fill :style="{ flexShrink: 0 }" />
        <span class="md-body-small">{{ importError }}</span>
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="importing" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="importing" :disabled="!importFile" @click="doImport">{{ t('admin.peers.import') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>

<style scoped>
.row-clickable { cursor: pointer; }
.row-clickable:hover { background: var(--md-sys-color-surface-container-high); }
</style>
