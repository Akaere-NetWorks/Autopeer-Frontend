<script setup lang="ts">
import type { AdminPeerGetResponse, PeerHistoryItem } from '~/types/admin'
import type { PeerMetricPoint } from '~/types/api'

definePageMeta({ middleware: 'admin', title: 'nav.admin.peers' })

const { t, te } = useI18n()
const route = useRoute()
const api = useApi()
const toast = useToast()
const { meta } = usePeerStatus()
const { fmtBytes, fmtRtt, fmtUptime, relTime, fmtDate } = useFormat()

const id = computed(() => String(route.params.id))

// The detail bundle (peer + latest-metric summary + agent-sync + history).
const { data, pending, error, refresh } = await useAsyncData(
  () => `admin-peer-${id.value}`,
  () => api.admin.peers.get(id.value),
  { lazy: true, server: false },
)
const detail = computed<AdminPeerGetResponse | null>(() => data.value ?? null)
const peer = computed(() => detail.value?.peer ?? null)
const summary = computed(() => detail.value?.metrics ?? null)
const agentSync = computed(() => detail.value?.agent_sync ?? null)
const history = computed<PeerHistoryItem[]>(() => detail.value?.history ?? [])

const notFound = computed(() => {
  const e = error.value as { status?: number, statusCode?: number } | null
  return e?.status === 404 || e?.statusCode === 404
})

const statusMeta = computed(() => peer.value ? meta(peer.value.status) : meta('pending'))

// The admin summary carries latest_bgp_uptime_secs at runtime even though the
// shared PeerMetrics type omits it (see center admin_peer.go GetPeer).
const bgpUptimeSecs = computed<number | null>(() => {
  const s = summary.value as (Record<string, unknown> | null)
  const v = s?.latest_bgp_uptime_secs
  return typeof v === 'number' ? v : null
})

// ── Metrics series (separate endpoint, range-scoped) ──────────────────────────
const RANGES: { value: string, hours: number }[] = [
  { value: '24h', hours: 24 },
  { value: '7d', hours: 168 },
]
const range = ref('24h')
const rangeHours = computed(() => RANGES.find(r => r.value === range.value)?.hours ?? 24)
const peakOut = ref(false)

const metricsError = ref('')
const {
  data: metrics,
  pending: metricsPending,
  refresh: refreshMetrics,
} = await useAsyncData(
  () => `admin-peer-metrics-${id.value}-${range.value}`,
  async () => {
    metricsError.value = ''
    try {
      return await api.admin.peers.metrics(id.value, rangeHours.value)
    }
    catch (e) {
      metricsError.value = (e as { message?: string })?.message || t('adminPeerDetail.metricsFailed')
      return null
    }
  },
  { watch: [range], lazy: true, server: false },
)

// The admin metrics endpoint returns route counts per point that the shared
// PeerMetricPoint type doesn't declare — read them through a loose view.
type RoutedPoint = PeerMetricPoint & {
  routes_imported?: number | null
  routes_exported?: number | null
  routes_preferred?: number | null
}
const points = computed<RoutedPoint[]>(() => (metrics.value?.points ?? []) as RoutedPoint[])
const hasSeries = computed(() => points.value.length > 1)

// rx/tx are cumulative WireGuard counters; rate + transferred series are
// derived from counter deltas in usePeerMetricSeries.
const {
  maybeClip,
  rttSeries,
  rxRateSeries,
  txRateSeries,
  peakRx,
  peakTx,
  transferredRx,
  transferredTx,
} = usePeerMetricSeries(points, peakOut)

const fmtRate = (v: number) => `${fmtBytes(v)}/s`
const fmtMs = (v: number) => `${v.toFixed(v >= 10 ? 0 : 1)} ${t('common.ms')}`
const fmtCount = (v: number) => String(Math.round(v))

// Route-count series + per-interval deltas for the route / route-rate charts.
const routesImported = computed(() => maybeClip(points.value.map(p => p.routes_imported ?? 0)))
const routesExported = computed(() => maybeClip(points.value.map(p => p.routes_exported ?? 0)))
const routesPreferred = computed(() => maybeClip(points.value.map(p => p.routes_preferred ?? 0)))
const hasRouteSeries = computed(() => points.value.some(p => p.routes_imported != null || p.routes_exported != null))

const routeDeltas = computed(() => {
  const out: { imported: number, exported: number, preferred: number }[] = []
  const pts = points.value
  for (let i = 1; i < pts.length; i++) {
    const curr = pts[i]!
    if (curr.routes_imported == null && curr.routes_exported == null) continue
    let prevIdx = i - 1
    while (prevIdx >= 0 && pts[prevIdx]!.routes_imported == null && pts[prevIdx]!.routes_exported == null) prevIdx--
    if (prevIdx < 0) continue
    const prev = pts[prevIdx]!
    out.push({
      imported: (curr.routes_imported ?? 0) - (prev.routes_imported ?? 0),
      exported: (curr.routes_exported ?? 0) - (prev.routes_exported ?? 0),
      preferred: (curr.routes_preferred ?? 0) - (prev.routes_preferred ?? 0),
    })
  }
  return out
})

// ── WireGuard tunnel rows ([label, value, copyable]) ──────────────────────────
const tunnelPeerRows = computed(() => {
  const p = peer.value
  if (!p) return []
  return [
    [t('adminPeerDetail.publicKey'), p.remote_pubkey, true],
    [t('adminPeerDetail.endpoint'), p.remote_endpoint, true],
    [t('adminPeerDetail.lla'), p.remote_lla, true],
  ] as [string, string, boolean][]
})
const tunnelNodeRows = computed(() => {
  const p = peer.value
  if (!p) return []
  return [
    [t('adminPeerDetail.nodePublicIp'), p.node_public_ip || t('common.dash'), true],
    [t('adminPeerDetail.nodeLla'), p.node_our_lla || t('common.dash'), true],
    [t('adminPeerDetail.nodeWgPubkey'), p.node_our_wg_pubkey || t('common.dash'), true],
    [t('adminPeerDetail.wgListenPort'), String(p.wg_listen_port), true],
    [t('adminPeerDetail.wgInterface'), p.wg_interface_name, true],
    [t('adminPeerDetail.wgManaged'), p.wg_managed ? t('common.yes') : t('common.no'), false],
  ] as [string, string, boolean][]
})

// Endpoint verification badge beside the configured endpoint.
const endpointBadge = computed<{ icon: string, color: string, title: string } | null>(() => {
  const p = peer.value
  if (!p) return null
  if (p.endpoint_mismatch_since) {
    return { icon: 'warning', color: 'var(--md-sys-color-error)', title: t('adminPeerDetail.endpointMismatchTitle') }
  }
  if (p.status === 'active') {
    return { icon: 'verified', color: 'var(--md-sys-color-tertiary)', title: t('adminPeerDetail.endpointVerified') }
  }
  return null
})

// ── BGP / BIRD + metrics rows ─────────────────────────────────────────────────
const bgpRows = computed(() => {
  const p = peer.value
  const m = summary.value
  if (!p) return []
  const rows: { label: string, value: string, kind?: string }[] = [
    { label: t('adminPeerDetail.bgpProtocol'), value: p.bgp_proto_name || t('common.dash') },
    { label: t('adminPeerDetail.birdConfig'), value: p.bird_config_filename || t('common.dash') },
    { label: t('adminPeerDetail.rtt'), value: m?.latest_rtt != null ? `${m.latest_rtt.toFixed(1)} ${t('common.ms')}` : t('common.dash') },
    { label: t('adminPeerDetail.bgpState'), value: m?.latest_bgp_state || t('common.dash'), kind: 'bgp' },
    { label: t('adminPeerDetail.lastHandshake'), value: m?.latest_handshake ? relTime(m.latest_handshake) : t('common.dash') },
    { label: t('adminPeerDetail.bgpUptime'), value: fmtUptime(bgpUptimeSecs.value) },
  ]
  if (m?.latest_wg_actual_endpoint) {
    rows.push({ label: t('adminPeerDetail.actualEndpoint'), value: m.latest_wg_actual_endpoint })
  }
  return rows
})

// ── Agent-sync localized labels ───────────────────────────────────────────────
function agentSyncLabel(status?: string) {
  const key = `adminPeerDetail.agentStatus.${status}`
  return status ? (te(key) ? t(key) : status) : t('common.dash')
}
function agentDesiredLabel(status?: string) {
  const key = `adminPeerDetail.desired.${status}`
  return status ? (te(key) ? t(key) : status) : t('common.dash')
}
const agentSyncRows = computed(() => {
  const a = agentSync.value
  if (!a) return []
  return [
    { label: t('adminPeerDetail.configurationStatus'), value: agentSyncLabel(a.configuration_status) },
    { label: t('adminPeerDetail.desiredState'), value: agentDesiredLabel(a.desired_state) },
    { label: t('adminPeerDetail.agentOnline'), value: a.agent_online ? t('common.yes') : t('common.no') },
    { label: t('adminPeerDetail.nodeAgentState'), value: a.node_agent_state || t('common.dash') },
    { label: t('adminPeerDetail.nodeAgentVersion'), value: a.node_agent_version || t('common.dash') },
    { label: t('adminPeerDetail.nodeAgentStateChangedAt'), value: a.node_agent_state_changed_at ? relTime(a.node_agent_state_changed_at) : t('common.dash') },
    { label: t('adminPeerDetail.checkedAt'), value: a.checked_at ? relTime(a.checked_at) : t('common.dash') },
  ]
})

// ── History timeline labels ───────────────────────────────────────────────────
function historyActionLabel(action?: string) {
  const key = `adminPeerDetail.action.${action}`
  return action ? (te(key) ? t(key) : action) : t('adminPeerDetail.action.unknown')
}
function historyActionKind(action?: string): 'success' | 'warning' | 'error' | 'neutral' | 'info' {
  if (!action) return 'neutral'
  if (action.includes('approve')) return 'success'
  if (action.includes('reject') || action.includes('delete')) return 'error'
  if (action.includes('suspend')) return 'warning'
  if (action.includes('create') || action.includes('import')) return 'info'
  return 'neutral'
}
function historyDetailSummary(detail?: unknown): string {
  if (!detail || typeof detail !== 'object') return ''
  const obj = detail as Record<string, unknown>
  const keys = Object.keys(obj)
  if (!keys.length) return ''
  return keys.slice(0, 3).map((k) => {
    const v = obj[k]
    const sv = v == null ? t('common.dash') : (typeof v === 'object' ? JSON.stringify(v) : String(v))
    return `${k}: ${sv}`
  }).join(' · ')
}

// ── Shared submit state for every action/dialog ───────────────────────────────
const submitting = ref(false)

async function runAction(fn: () => Promise<unknown>, okMsg: string) {
  if (submitting.value) return
  submitting.value = true
  try {
    await fn()
    toast.show(t(okMsg))
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

function doApprove() {
  const p = peer.value
  if (!p) return
  runAction(() => api.admin.peers.approve(p.id), 'admin.peers.approved')
}
function doUnsuspend() {
  const p = peer.value
  if (!p) return
  runAction(() => api.admin.peers.unsuspend(p.id), 'admin.peers.unsuspended')
}

// ── Reject (reason required) ──────────────────────────────────────────────────
const showReject = ref(false)
const rejectReason = ref('')
function openReject() {
  rejectReason.value = ''
  showReject.value = true
}
async function doReject() {
  const p = peer.value
  const reason = rejectReason.value.trim()
  if (!p || !reason || submitting.value) return
  submitting.value = true
  try {
    await api.admin.peers.reject(p.id, reason)
    toast.show(t('admin.peers.wasRejected'))
    showReject.value = false
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

// ── Suspend (reason optional) ─────────────────────────────────────────────────
const showSuspend = ref(false)
const suspendReason = ref('')
function openSuspend() {
  suspendReason.value = ''
  showSuspend.value = true
}
async function doSuspend() {
  const p = peer.value
  if (!p || submitting.value) return
  submitting.value = true
  try {
    await api.admin.peers.suspend(p.id, suspendReason.value.trim() || undefined)
    toast.show(t('admin.peers.wasSuspended'))
    showSuspend.value = false
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

// ── Full edit (pubkey / endpoint / lla / mtu) ─────────────────────────────────
const showEdit = ref(false)
const editForm = reactive({ remote_pubkey: '', remote_endpoint: '', remote_lla: '', mtu: '' })
function openEdit() {
  const p = peer.value
  if (!p) return
  editForm.remote_pubkey = p.remote_pubkey
  editForm.remote_endpoint = p.remote_endpoint
  editForm.remote_lla = p.remote_lla
  editForm.mtu = p.mtu != null ? String(p.mtu) : ''
  showEdit.value = true
}
async function saveEdit() {
  const p = peer.value
  if (!p || submitting.value) return
  const body: { remote_pubkey?: string, remote_endpoint?: string, remote_lla?: string, mtu?: number | null } = {}
  if (editForm.remote_pubkey.trim() !== p.remote_pubkey) body.remote_pubkey = editForm.remote_pubkey.trim()
  if (editForm.remote_endpoint.trim() !== p.remote_endpoint) body.remote_endpoint = editForm.remote_endpoint.trim()
  if (editForm.remote_lla.trim() !== p.remote_lla) body.remote_lla = editForm.remote_lla.trim()
  const nextMtu = editForm.mtu ? Number(editForm.mtu) : null
  if (nextMtu !== (p.mtu ?? null)) body.mtu = nextMtu
  if (!Object.keys(body).length) { showEdit.value = false; return }
  submitting.value = true
  try {
    await api.admin.peers.update(p.id, body)
    toast.show(t('admin.peers.updated'))
    showEdit.value = false
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

// ── Inline MTU edit (quick path from the tunnel card) ─────────────────────────
const showMtu = ref(false)
const mtuValue = ref('')
function openMtu() {
  mtuValue.value = peer.value?.mtu != null ? String(peer.value.mtu) : ''
  showMtu.value = true
}
async function saveMtu() {
  const p = peer.value
  if (!p || submitting.value) return
  submitting.value = true
  try {
    await api.admin.peers.update(p.id, { mtu: mtuValue.value ? Number(mtuValue.value) : null })
    toast.show(t('admin.peers.updated'))
    showMtu.value = false
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

// ── Contact email (set / retry verification) ──────────────────────────────────
const showContact = ref(false)
const contactEmail = ref('')
function openContact() {
  contactEmail.value = peer.value?.contact_email || ''
  showContact.value = true
}
async function saveContact(retry = false) {
  const p = peer.value
  if (!p || submitting.value) return
  submitting.value = true
  try {
    await api.admin.peers.setContactEmail(p.id, { email: contactEmail.value.trim() || undefined, retry })
    toast.show(t('adminPeerDetail.contactSaved'))
    showContact.value = false
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

// ── Delete (type-to-confirm) ──────────────────────────────────────────────────
const showDelete = ref(false)
const deleteConfirm = ref('')
const deleteArmed = computed(() => deleteConfirm.value.trim().toLowerCase() === 'delete')
function openDelete() {
  deleteConfirm.value = ''
  showDelete.value = true
}
async function doDelete() {
  const p = peer.value
  if (!p || !deleteArmed.value || submitting.value) return
  submitting.value = true
  try {
    await api.admin.peers.remove(p.id)
    toast.show(t('admin.peers.deleted'))
    await navigateTo('/admin/peers')
  }
  catch (e) {
    toast.error(e)
    submitting.value = false
  }
}
</script>

<template>
  <div class="col gap-5">
    <AppBreadcrumb :items="[{ label: t('nav.admin.peers'), to: '/admin/peers' }, { label: peer ? `AS${peer.remote_asn}` : '…' }]" />

    <div v-if="data === null && !error" class="col gap-3">
      <SkeletonBlock height="80px" radius="16px" />
      <SkeletonBlock height="280px" radius="16px" />
      <SkeletonBlock height="220px" radius="16px" />
    </div>

    <div v-else-if="notFound || (!peer && !pending)" class="card card-outlined card-pad text-center col gap-3" :style="{ alignItems: 'center', padding: '56px 24px' }">
      <MdSym name="search_off" :size="40" class="txt-variant" />
      <h2 class="md-headline-small" :style="{ margin: 0 }">{{ t('adminPeerDetail.notFound') }}</h2>
      <p class="md-body-medium txt-variant" :style="{ margin: 0 }">{{ t('adminPeerDetail.notFoundBody') }}</p>
      <MdButton variant="tonal" icon="arrow_back" @click="navigateTo('/admin/peers')">{{ t('adminPeerDetail.backToList') }}</MdButton>
    </div>

    <template v-else-if="peer">
      <!-- Header -->
      <div class="row gap-4 flex-wrap">
        <span :style="{ display: 'inline-flex', width: '56px', height: '56px', borderRadius: '16px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }">
          <MdSym name="swap_horiz" :size="28" fill />
        </span>
        <div :style="{ flex: 1, minWidth: 0 }">
          <h1 class="md-headline-medium mono" :style="{ margin: 0 }">AS{{ peer.remote_asn }}</h1>
          <div class="md-body-medium txt-variant" :style="{ marginTop: '4px' }">
            {{ peer.node_name }} · {{ peer.node_location }}
            <span v-if="peer.contact_email"> · {{ peer.contact_email }}</span>
          </div>
          <div class="md-body-small txt-variant" :style="{ marginTop: '2px' }">
            {{ t('adminPeerDetail.created') }} {{ relTime(peer.created_at) }}
            <span v-if="peer.updated_at !== peer.created_at"> · {{ t('adminPeerDetail.updated') }} {{ relTime(peer.updated_at) }}</span>
          </div>
        </div>
        <MdStatus :kind="statusMeta.kind">{{ statusMeta.label }}</MdStatus>
      </div>

      <!-- Action bar -->
      <div class="row gap-2 flex-wrap">
        <MdButton v-if="peer.status === 'pending'" variant="filled" icon="check" :disabled="submitting" @click="doApprove">{{ t('admin.peers.approve') }}</MdButton>
        <MdButton v-if="peer.status === 'pending'" variant="outlined" icon="block" :disabled="submitting" @click="openReject">{{ t('admin.peers.reject') }}</MdButton>
        <MdButton v-if="peer.status === 'active'" variant="outlined" icon="pause" :disabled="submitting" @click="openSuspend">{{ t('admin.peers.suspend') }}</MdButton>
        <MdButton v-if="peer.status === 'suspended'" variant="filled" icon="play_arrow" :disabled="submitting" @click="doUnsuspend">{{ t('admin.peers.unsuspend') }}</MdButton>
        <MdButton variant="tonal" icon="edit" :disabled="submitting" @click="openEdit">{{ t('common.edit') }}</MdButton>
        <MdButton variant="tonal" icon="mail" :disabled="submitting" @click="openContact">{{ t('adminPeerDetail.contactEmail') }}</MdButton>
        <MdButton variant="outlined" icon="delete" :disabled="submitting" @click="openDelete">{{ t('common.delete') }}</MdButton>
      </div>

      <!-- Reject-reason banner -->
      <div
        v-if="peer.reject_reason"
        class="row gap-3"
        :style="{ alignItems: 'flex-start', padding: '16px', borderRadius: '16px', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }"
      >
        <MdSym name="cancel" :size="22" fill :style="{ flexShrink: 0 }" />
        <div>
          <div class="md-title-small">{{ t('adminPeerDetail.rejectReason') }}</div>
          <div class="md-body-medium" :style="{ marginTop: '2px' }">{{ peer.reject_reason }}</div>
        </div>
      </div>

      <!-- Endpoint-mismatch banner -->
      <div
        v-if="peer.endpoint_mismatch_since"
        class="row gap-3"
        :style="{ alignItems: 'flex-start', padding: '16px', borderRadius: '16px', background: 'var(--md-sys-color-warning-container)', color: 'var(--md-sys-color-on-warning-container)' }"
      >
        <MdSym name="warning" :size="22" fill :style="{ flexShrink: 0 }" />
        <div>
          <div class="md-title-small">{{ t('adminPeerDetail.endpointMismatchTitle') }}</div>
          <div class="md-body-medium" :style="{ marginTop: '2px' }">
            {{ t('adminPeerDetail.endpointMismatchBody') }}
            <span class="txt-variant"> ({{ t('adminPeerDetail.since') }} {{ relTime(peer.endpoint_mismatch_since) }})</span>
          </div>
        </div>
      </div>

      <!-- WireGuard tunnel card -->
      <div class="card card-elevated card-pad">
        <h2 class="md-title-large" :style="{ margin: '0 0 4px' }">{{ t('adminPeerDetail.wireGuard') }}</h2>
        <p class="md-body-small txt-variant" :style="{ margin: '0 0 12px' }">{{ t('adminPeerDetail.wireGuardSub') }}</p>

        <div class="md-label-large txt-variant" :style="{ margin: '6px 0 4px' }">{{ t('adminPeerDetail.peerSection') }}</div>
        <div class="col">
          <div v-for="row in tunnelPeerRows" :key="row[0]" class="row gap-4" :style="{ padding: '14px 0', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }">
            <div class="md-body-medium txt-variant" :style="{ width: '170px', flexShrink: 0 }">{{ row[0] }}</div>
            <div class="md-body-medium row gap-2 mono" :style="{ flex: 1, wordBreak: 'break-all', alignItems: 'center' }">
              <span>{{ row[1] }}</span>
              <span v-if="row[0] === t('adminPeerDetail.endpoint') && endpointBadge" :title="endpointBadge.title" :aria-label="endpointBadge.title" :style="{ display: 'inline-flex' }">
                <MdSym :name="endpointBadge.icon" :size="18" :style="{ color: endpointBadge.color }" fill />
              </span>
              <MdCopyButton :value="row[1]" :size="28" />
            </div>
          </div>
          <!-- MTU (with quick-edit affordance) -->
          <div class="row gap-4" :style="{ padding: '14px 0', borderBottom: 'none' }">
            <div class="md-body-medium txt-variant" :style="{ width: '170px', flexShrink: 0 }">{{ t('adminPeerDetail.mtu') }}</div>
            <div class="md-body-medium row gap-2" :style="{ flex: 1, alignItems: 'center' }">
              <span>{{ peer.mtu ?? t('peerNew.mtuDefault') }}</span>
              <MdButton variant="text" icon="edit" :disabled="submitting" @click="openMtu">{{ t('common.edit') }}</MdButton>
            </div>
          </div>
        </div>

        <div class="md-label-large txt-variant" :style="{ margin: '14px 0 4px' }">{{ t('adminPeerDetail.node') }}</div>
        <div class="col">
          <div
            v-for="(row, i) in tunnelNodeRows" :key="row[0]"
            class="row gap-4"
            :style="{ padding: '14px 0', borderBottom: i < tunnelNodeRows.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none' }"
          >
            <div class="md-body-medium txt-variant" :style="{ width: '170px', flexShrink: 0 }">{{ row[0] }}</div>
            <div class="md-body-medium row gap-2" :class="{ mono: row[2] }" :style="{ flex: 1, wordBreak: 'break-all', alignItems: 'center' }">
              <span>{{ row[1] }}</span>
              <MdCopyButton v-if="row[2] && row[1] !== t('common.dash')" :value="row[1]" :size="28" />
            </div>
          </div>
        </div>
      </div>

      <!-- BGP / BIRD + metrics card -->
      <div class="card card-elevated card-pad">
        <h2 class="md-title-large" :style="{ margin: '0 0 4px' }">{{ t('adminPeerDetail.bgpBird') }}</h2>
        <p class="md-body-small txt-variant" :style="{ margin: '0 0 12px' }">{{ t('adminPeerDetail.bgpBirdSub') }}</p>
        <div class="col">
          <div
            v-for="(row, i) in bgpRows" :key="row.label"
            class="row gap-4"
            :style="{ padding: '14px 0', borderBottom: i < bgpRows.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none' }"
          >
            <div class="md-body-medium txt-variant" :style="{ width: '170px', flexShrink: 0 }">{{ row.label }}</div>
            <div class="md-body-medium" :style="{ flex: 1, wordBreak: 'break-all' }">
              <span v-if="row.kind === 'bgp' && row.value !== t('common.dash')" class="code-inline">{{ row.value }}</span>
              <span v-else>{{ row.value }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Agent sync diagnostics card -->
      <div class="card card-elevated card-pad">
        <h2 class="md-title-large" :style="{ margin: '0 0 4px' }">{{ t('adminPeerDetail.agentSync') }}</h2>
        <p class="md-body-small txt-variant" :style="{ margin: '0 0 12px' }">{{ t('adminPeerDetail.agentSyncSub') }}</p>
        <div v-if="agentSyncRows.length" class="col">
          <div
            v-for="(row, i) in agentSyncRows" :key="row.label"
            class="row gap-4"
            :style="{ padding: '14px 0', borderBottom: i < agentSyncRows.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none' }"
          >
            <div class="md-body-medium txt-variant" :style="{ width: '170px', flexShrink: 0 }">{{ row.label }}</div>
            <div class="md-body-medium" :style="{ flex: 1, wordBreak: 'break-all' }">{{ row.value }}</div>
          </div>
        </div>
        <div v-else class="md-body-medium txt-variant" :style="{ padding: '8px 0' }">{{ t('adminPeerDetail.agentSyncUnavailable') }}</div>
      </div>

      <!-- Charts -->
      <div class="card card-elevated card-pad">
        <div class="row space-between flex-wrap gap-3" :style="{ marginBottom: '20px' }">
          <div>
            <h2 class="md-title-large" :style="{ margin: 0 }">{{ t('adminPeerDetail.charts') }}</h2>
            <p class="md-body-small txt-variant" :style="{ margin: '2px 0 0' }">{{ t('adminPeerDetail.chartsSub') }}</p>
          </div>
          <div class="row gap-4 flex-wrap" :style="{ alignItems: 'center' }">
            <label class="row gap-2 md-body-medium" :style="{ alignItems: 'center', cursor: 'pointer' }">
              <MdSwitch v-model="peakOut" :aria-label="t('adminPeerDetail.peakOut')" />
              <span>{{ t('adminPeerDetail.peakOut') }}</span>
            </label>
            <MdSegmented v-model="range" role="tablist" :options="RANGES.map(r => ({ value: r.value, label: r.value }))" />
          </div>
        </div>

        <div v-if="metricsPending" class="col gap-4" :style="{ padding: '8px 0' }">
          <div class="skeleton" :style="{ height: '150px', borderRadius: '12px' }" />
          <div class="skeleton" :style="{ height: '150px', borderRadius: '12px' }" />
        </div>

        <div v-else-if="metricsError" class="col gap-3 text-center" :style="{ alignItems: 'center', padding: '40px 0' }">
          <MdSym name="error" :size="36" :style="{ color: 'var(--md-sys-color-error)' }" />
          <div class="md-body-medium txt-variant">{{ metricsError }}</div>
          <MdButton variant="tonal" icon="refresh" @click="refreshMetrics()">{{ t('common.retry') }}</MdButton>
        </div>

        <div v-else-if="!hasSeries" class="md-body-medium txt-variant text-center" :style="{ padding: '40px 0' }">
          {{ t('adminPeerDetail.noMetrics') }}
        </div>

        <ClientOnly v-else>
          <div class="col gap-6">
            <div class="charts-2">
              <div>
                <div class="md-title-small" :style="{ marginBottom: '4px' }">{{ t('adminPeerDetail.chartRtt') }}</div>
                <div class="md-body-small txt-variant" :style="{ marginBottom: '8px' }">{{ t('adminPeerDetail.rttCurrent', { rtt: fmtRtt(summary?.latest_rtt), range }) }}</div>
                <MdAreaChart :data="rttSeries" color="primary" :height="150" label="RTT" :format="fmtMs" />
              </div>
              <!-- Per-second transfer-rate chart (derived from counter deltas) -->
              <div>
                <div class="md-title-small" :style="{ marginBottom: '4px' }">{{ t('adminPeerDetail.chartRate') }}</div>
                <div class="md-body-small txt-variant row gap-4" :style="{ marginBottom: '8px' }">
                  <span class="row gap-2"><span :style="{ width: '14px', height: '3px', borderRadius: '2px', background: 'var(--md-sys-color-primary)', display: 'inline-block' }" /> {{ t('adminPeerDetail.rxPeak', { rate: fmtRate(peakRx) }) }}</span>
                  <span class="row gap-2"><span :style="{ width: '14px', height: '3px', borderRadius: '2px', backgroundImage: 'repeating-linear-gradient(90deg, var(--md-sys-color-tertiary) 0 3px, transparent 3px 6px)', display: 'inline-block' }" /> {{ t('adminPeerDetail.txPeak', { rate: fmtRate(peakTx) }) }}</span>
                </div>
                <MdDualAreaChart :rx="rxRateSeries" :tx="txRateSeries" :height="150" :format="fmtRate" />
              </div>
            </div>

            <!-- Actual bytes transferred over the selected range -->
            <div class="row gap-5 flex-wrap" :style="{ padding: '12px 16px', borderRadius: '12px', background: 'var(--md-sys-color-surface-container-low)', alignItems: 'center' }">
              <span class="md-label-large txt-variant">{{ t('adminPeerDetail.transferred', { range }) }}</span>
              <span class="row gap-2 md-body-medium mono" :style="{ alignItems: 'center' }">
                <MdSym name="arrow_downward" :size="16" :style="{ color: 'var(--md-sys-color-primary)' }" /> {{ t('adminPeerDetail.rx') }} {{ fmtBytes(transferredRx) }}
              </span>
              <span class="row gap-2 md-body-medium mono" :style="{ alignItems: 'center' }">
                <MdSym name="arrow_upward" :size="16" :style="{ color: 'var(--md-sys-color-tertiary)' }" /> {{ t('adminPeerDetail.tx') }} {{ fmtBytes(transferredTx) }}
              </span>
            </div>

            <template v-if="hasRouteSeries">
              <div>
                <div class="md-title-small" :style="{ marginBottom: '4px' }">{{ t('adminPeerDetail.chartRoutes') }}</div>
                <div class="md-body-small txt-variant row gap-4 flex-wrap" :style="{ marginBottom: '8px' }">
                  <span class="row gap-2"><span :style="{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--md-sys-color-primary)', display: 'inline-block' }" /> {{ t('adminPeerDetail.imported') }}</span>
                  <span class="row gap-2"><span :style="{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--md-sys-color-tertiary)', display: 'inline-block' }" /> {{ t('adminPeerDetail.exported') }}</span>
                  <span class="row gap-2"><span :style="{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--md-sys-color-secondary)', display: 'inline-block' }" /> {{ t('adminPeerDetail.preferred') }}</span>
                </div>
                <MdAreaChart :data="routesImported" color="primary" :height="120" label="Routes imported" :format="fmtCount" />
                <MdAreaChart :data="routesExported" color="tertiary" :height="120" label="Routes exported" :format="fmtCount" :style="{ marginTop: '6px' }" />
                <MdAreaChart :data="routesPreferred" color="secondary" :height="120" label="Routes preferred" :format="fmtCount" :style="{ marginTop: '6px' }" />
              </div>

              <div v-if="routeDeltas.length > 1">
                <div class="md-title-small" :style="{ marginBottom: '4px' }">{{ t('adminPeerDetail.chartRouteRate') }}</div>
                <div class="md-body-small txt-variant" :style="{ marginBottom: '8px' }">{{ t('adminPeerDetail.chartRouteRateSub') }}</div>
                <MdAdminPeerRouteBars :series="routeDeltas" :height="180" label="Route deltas" />
              </div>
            </template>
          </div>
        </ClientOnly>
      </div>

      <!-- History timeline -->
      <div class="card card-elevated card-pad">
        <h2 class="md-title-large" :style="{ margin: '0 0 4px' }">{{ t('admin.peers.history') }}</h2>
        <p class="md-body-small txt-variant" :style="{ margin: '0 0 12px' }">{{ t('adminPeerDetail.historySub') }}</p>
        <div v-if="history.length" class="col gap-4">
          <div v-for="entry in history" :key="entry.id" class="row gap-3" :style="{ alignItems: 'flex-start' }">
            <span :style="{ marginTop: '6px', width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, background: 'var(--md-sys-color-primary)' }" />
            <div :style="{ flex: 1, minWidth: 0, borderBottom: '1px solid var(--md-sys-color-outline-variant)', paddingBottom: '16px' }">
              <div class="row gap-2 flex-wrap" :style="{ alignItems: 'center' }">
                <MdStatus :kind="historyActionKind(entry.action)">{{ historyActionLabel(entry.action) }}</MdStatus>
                <span class="md-body-small txt-variant">{{ entry.operator }}</span>
                <span class="md-body-small txt-variant">{{ relTime(entry.created_at) }}</span>
              </div>
              <p v-if="historyDetailSummary(entry.detail)" class="md-body-small" :style="{ margin: '8px 0 0', wordBreak: 'break-word' }">{{ historyDetailSummary(entry.detail) }}</p>
            </div>
          </div>
        </div>
        <div v-else class="md-body-medium txt-variant" :style="{ padding: '8px 0' }">{{ t('adminPeerDetail.historyEmpty') }}</div>
      </div>
    </template>

    <!-- Reject (reason required) -->
    <MdDialog v-model:open="showReject" :title="t('admin.peers.rejectTitle')" :submitting="submitting">
      <MdTextArea
        :label="t('admin.peers.rejectReason')" :model-value="rejectReason"
        :supporting="t('admin.peers.rejectReasonHint')" :rows="3"
        tf-bg="var(--md-sys-color-surface-container-high)"
        @update:model-value="(v: string) => (rejectReason = v)"
      />
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="submitting" :disabled="!rejectReason.trim()" @click="doReject">{{ t('admin.peers.reject') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Suspend (reason optional) -->
    <MdDialog v-model:open="showSuspend" :title="t('admin.peers.suspendTitle')" :submitting="submitting">
      <MdTextArea
        :label="t('admin.peers.suspendReason')" :model-value="suspendReason" :rows="3"
        tf-bg="var(--md-sys-color-surface-container-high)"
        @update:model-value="(v: string) => (suspendReason = v)"
      />
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="submitting" @click="doSuspend">{{ t('admin.peers.suspend') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Full edit -->
    <MdDialog v-model:open="showEdit" :title="t('admin.peers.editTitle')" :submitting="submitting">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <MdTextField :label="t('admin.peers.pubkey')" :model-value="editForm.remote_pubkey" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (editForm.remote_pubkey = v)" />
        <MdTextField :label="t('admin.peers.endpoint')" :model-value="editForm.remote_endpoint" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (editForm.remote_endpoint = v)" />
        <MdTextField :label="t('admin.peers.lla')" :model-value="editForm.remote_lla" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (editForm.remote_lla = v)" />
        <MdTextField :label="t('admin.peers.mtu')" :model-value="editForm.mtu" inputmode="numeric" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (editForm.mtu = v.replace(/\D/g, ''))" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="save" :loading="submitting" @click="saveEdit">{{ t('common.save') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Inline MTU edit -->
    <MdDialog v-model:open="showMtu" :title="t('adminPeerDetail.editMtu')" :submitting="submitting">
      <MdTextField
        :label="t('adminPeerDetail.mtu')" :model-value="mtuValue" inputmode="numeric"
        :placeholder="t('peerNew.mtuDefault')" :supporting="t('adminPeerDetail.mtuHint')"
        tf-bg="var(--md-sys-color-surface-container-high)"
        @update:model-value="(v: string) => (mtuValue = v.replace(/\D/g, ''))"
      />
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="save" :loading="submitting" @click="saveMtu">{{ t('common.save') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Contact email (set / retry verification) -->
    <MdDialog v-model:open="showContact" :title="t('adminPeerDetail.contactTitle')" :submitting="submitting">
      <MdTextField
        :label="t('adminPeerDetail.contactEmail')" :model-value="contactEmail"
        :supporting="t('adminPeerDetail.contactHint')"
        tf-bg="var(--md-sys-color-surface-container-high)"
        @update:model-value="(v: string) => (contactEmail = v)"
      />
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="outlined" :disabled="submitting || !contactEmail.trim()" @click="saveContact(true)">{{ t('adminPeerDetail.contactRetry') }}</MdButton>
        <MdButton variant="filled" icon="save" :loading="submitting" @click="saveContact(false)">{{ t('common.save') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Delete (type-to-confirm) -->
    <MdDialog v-model:open="showDelete" :title="t('admin.peers.deleteTitle')" :submitting="submitting">
      <div class="col gap-4" :style="{ marginTop: '4px' }">
        <div
          class="row gap-3"
          :style="{ alignItems: 'flex-start', padding: '14px', borderRadius: '12px', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }"
        >
          <MdSym name="warning" :size="20" fill />
          <span class="md-body-medium">{{ t('admin.peers.deleteBody') }}</span>
        </div>
        <MdTextField
          :model-value="deleteConfirm" :label="t('adminPeerDetail.deleteConfirmLabel')"
          :placeholder="t('adminPeerDetail.deleteConfirmPlaceholder')" mono
          tf-bg="var(--md-sys-color-surface-container-high)"
          @update:model-value="(v: string) => (deleteConfirm = v)"
        />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" :disabled="!deleteArmed" :loading="submitting" @click="doDelete">{{ t('common.delete') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
