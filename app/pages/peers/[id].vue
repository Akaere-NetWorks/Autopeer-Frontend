<script setup lang="ts">
import type { PeerMetricPoint, UpdatePeerReq } from '~/types/api'

definePageMeta({ middleware: 'auth', title: 'nav.myPeers' })

const { t } = useI18n()
const route = useRoute()
const api = useApi()
const toast = useToast()
const { meta } = usePeerStatus()
const { fmtRtt, fmtBytes, relTime, fmtDate } = useFormat()

const id = computed(() => String(route.params.id))

const RANGES: { value: string, hours: number }[] = [
  { value: '1h', hours: 1 },
  { value: '6h', hours: 6 },
  { value: '24h', hours: 24 },
  { value: '7d', hours: 168 },
]
const range = ref('24h')
const rangeHours = computed(() => RANGES.find((r) => r.value === range.value)?.hours ?? 24)

const { data: peer, error, refresh } = await useAsyncData(`peer-${id.value}`, () => api.peers.get(id.value), { lazy: true, server: false })

// Track the metrics fetch state explicitly so we can tell a transient error
// apart from genuinely-empty history (closed keeps load / empty / error
// separable; the OSS rewrite collapsed them into one "empty" string).
const metricsError = ref('')
const {
  data: metrics,
  pending: metricsPending,
  refresh: refreshMetrics,
} = await useAsyncData(
  () => `peer-metrics-${id.value}-${range.value}`,
  async () => {
    metricsError.value = ''
    try {
      return await api.peers.metrics(id.value, rangeHours.value)
    }
    catch (e) {
      metricsError.value = errorMessage(e, t('peerDetail.metricsFailed'))
      return null
    }
  },
  { watch: [range], lazy: true, server: false },
)

function errorMessage(e: unknown, fallback: string): string {
  const m = (e as { message?: string } | null)?.message
  return m || fallback
}

const notFound = computed(() => {
  const e = error.value as unknown as { status?: number, statusCode?: number } | null
  return e?.status === 404 || e?.statusCode === 404
})

const statusMeta = computed(() => peer.value ? meta(peer.value.status) : meta('pending'))

function isBgpHealthy(state?: string | null) {
  return state === 'established' || state === 'up'
}

// ── Dynamic, BGP/endpoint-aware status guidance (closed has 8 branches) ───────
type Guidance = { kind: 'success' | 'warning' | 'error' | 'info', icon: string, text: string }
const guidance = computed<Guidance | null>(() => {
  const p = peer.value
  if (!p) return null
  const bgp = metrics.value?.latest_bgp_state
  if (p.status === 'active' && p.endpoint_mismatch_since) {
    return { kind: 'warning', icon: 'warning', text: t('peerDetail.guidance.endpointMismatch') }
  }
  if (p.status === 'pending') {
    return { kind: 'info', icon: 'hourglass_top', text: t('peerDetail.guidance.pending') }
  }
  if (p.status === 'active' && isBgpHealthy(bgp)) {
    return { kind: 'success', icon: 'check_circle', text: t('peerDetail.guidance.active') }
  }
  if (p.status === 'active' && bgp && !isBgpHealthy(bgp)) {
    return { kind: 'warning', icon: 'warning', text: t('peerDetail.guidance.bgpIssue') }
  }
  if (p.status === 'rejected') {
    return { kind: 'error', icon: 'cancel', text: t('peerDetail.guidance.rejected') }
  }
  if (p.status === 'suspended') {
    return { kind: 'warning', icon: 'pause_circle', text: t('peerDetail.guidance.suspended') }
  }
  if (!bgp) {
    return { kind: 'info', icon: 'info', text: t('peerDetail.guidance.noMetrics') }
  }
  return { kind: 'info', icon: 'info', text: t('peerDetail.guidance.default') }
})

const guidanceTone: Record<Guidance['kind'], { bg: string, fg: string }> = {
  success: { bg: 'var(--md-sys-color-tertiary-container)', fg: 'var(--md-sys-color-on-tertiary-container)' },
  warning: { bg: 'var(--md-sys-color-warning-container)', fg: 'var(--md-sys-color-on-warning-container)' },
  error: { bg: 'var(--md-sys-color-error-container)', fg: 'var(--md-sys-color-on-error-container)' },
  info: { bg: 'var(--md-sys-color-secondary-container)', fg: 'var(--md-sys-color-on-secondary-container)' },
}

const statusSummary = computed(() => {
  const p = peer.value
  if (!p) return ''
  const bgp = metrics.value?.latest_bgp_state
  return t('peerDetail.statusSummary', {
    status: statusMeta.value.label,
    bgp: bgp || t('peerDetail.noBgpState'),
  })
})

// Endpoint verification badge beside the configured endpoint.
const endpointBadge = computed<{ icon: string, color: string, title: string } | null>(() => {
  const p = peer.value
  if (!p) return null
  if (p.endpoint_mismatch_since) {
    return { icon: 'warning', color: 'var(--md-sys-color-error)', title: t('peerDetail.endpointMismatchHint') }
  }
  if (p.status === 'active') {
    return { icon: 'verified', color: 'var(--md-sys-color-tertiary)', title: t('peerDetail.endpointVerified') }
  }
  return null
})

const showMismatchBanner = computed(() => peer.value?.status === 'active' && !!peer.value?.endpoint_mismatch_since)

const latestTiles = computed(() => {
  const m = metrics.value
  return [
    { icon: 'network_ping', label: t('peerDetail.metrics.rtt'), value: fmtRtt(m?.latest_rtt), unit: m?.latest_rtt != null ? t('common.ms') : '', tone: 'primary' },
    { icon: 'route', label: t('peerDetail.metrics.bgpState'), value: m?.latest_bgp_state || t('common.dash'), unit: '', tone: 'tertiary' },
    { icon: 'handshake', label: t('peerDetail.metrics.lastHandshake'), value: relTime(m?.latest_handshake), unit: '', tone: 'secondary' },
  ]
})

// ── Detail rows ───────────────────────────────────────────────────────────────
// [label, value, copyable]
const connRows = computed(() => {
  const p = peer.value
  if (!p) return []
  const rows: [string, string, boolean][] = [
    [t('peerDetail.fields.remoteAsn'), `AS${p.remote_asn}`, true],
    [t('peerDetail.fields.pubkey'), p.remote_pubkey, true],
    [t('peerDetail.fields.lla'), p.remote_lla, true],
    [t('peerDetail.fields.mtu'), p.mtu ? String(p.mtu) : t('peerNew.mtuDefault'), false],
  ]
  // PSK persists on GET /user/peers/{id} (backend returns wg_preshared_key);
  // show the real value (copyable) when present, else the disabled state.
  if (p.wg_preshared_key) rows.push([t('peerDetail.fields.psk'), p.wg_preshared_key, true])
  else rows.push([t('peerDetail.fields.psk'), t('peerDetail.pskNot'), false])
  if (p.contact_email) rows.push([t('peerDetail.fields.contactEmail'), p.contact_email, false])
  return rows
})

// Endpoint row is rendered separately so it can carry the verification badge
// and the observed/actual endpoint sub-row.
const actualEndpoint = computed(() =>
  peer.value?.status === 'active' ? (metrics.value?.latest_wg_actual_endpoint || '') : '',
)

const nodeRows = computed(() => {
  const p = peer.value
  if (!p) return []
  return [
    [t('peerDetail.fields.node'), `${p.node_name} · ${p.node_location}`, false],
    [t('peerDetail.fields.nodePublicIp'), p.node_public_ip || t('common.dash'), true],
    [t('peerDetail.fields.nodePubkey'), p.node_our_wg_pubkey || t('common.dash'), true],
    [t('peerDetail.fields.nodeLla'), p.node_our_lla || t('common.dash'), true],
    [t('peerDetail.fields.listenPort'), String(p.wg_listen_port), true],
    [t('peerDetail.fields.interface'), p.wg_interface_name, true],
    [t('peerDetail.fields.created'), fmtDate(p.created_at), false],
    [t('peerDetail.fields.updated'), fmtDate(p.updated_at), false],
  ] as [string, string, boolean][]
})

// ── Charts ────────────────────────────────────────────────────────────────────
// rx/tx are cumulative WireGuard counters; rate + transferred series are
// derived from counter deltas in usePeerMetricSeries.
const peakOut = ref(false)

const points = computed<PeerMetricPoint[]>(() => metrics.value?.points ?? [])
const hasSeries = computed(() => points.value.length > 1)

const {
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

// ── Edit ─────────────────────────────────────────────────────────────────────
const showEdit = ref(false)
const saving = ref(false)
const editForm = reactive({ pubkey: '', endpoint: '', lla: '', mtu: '' })
function seedEditForm() {
  const p = peer.value
  if (!p) return
  editForm.pubkey = p.remote_pubkey
  editForm.endpoint = p.remote_endpoint
  editForm.lla = p.remote_lla
  editForm.mtu = p.mtu ? String(p.mtu) : ''
}
function openEdit() {
  if (!peer.value) return
  seedEditForm()
  showEdit.value = true
}
const editValid = computed(() =>
  isValidPubkey(editForm.pubkey) && isValidEndpoint(editForm.endpoint) && isValidLLA(editForm.lla) && isValidMtu(editForm.mtu),
)
async function saveEdit() {
  const p = peer.value
  if (!p) return
  if (!editValid.value) return
  const body: UpdatePeerReq = {}
  if (editForm.pubkey.trim() !== p.remote_pubkey) body.remote_pubkey = editForm.pubkey.trim()
  if (editForm.endpoint.trim() !== p.remote_endpoint) body.remote_endpoint = editForm.endpoint.trim()
  if (editForm.lla.trim() !== p.remote_lla) body.remote_lla = editForm.lla.trim()
  const nextMtu = editForm.mtu ? Number(editForm.mtu) : null
  if (nextMtu !== (p.mtu ?? null)) body.mtu = nextMtu
  if (!Object.keys(body).length) { showEdit.value = false; return }
  saving.value = true
  try {
    await api.peers.update(p.id, body)
    await refresh()
    // Re-seed the form from server truth so a re-open reflects normalization
    // (closed's edit route rewrites every field from the refetched peer).
    seedEditForm()
    showEdit.value = false
    toast.show(t('peerDetail.updated'))
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    saving.value = false
  }
}

// ── Delete (type-to-confirm friction, mirrors closed delete route) ────────────
const showDelete = ref(false)
const deleting = ref(false)
const confirmText = ref('')
const deleteArmed = computed(() => confirmText.value.trim().toLowerCase() === 'delete')
const deleteRecap = computed(() => {
  const p = peer.value
  if (!p) return []
  return [
    [t('peerDetail.fields.remoteAsn'), `AS${p.remote_asn}`],
    [t('peerDetail.fields.node'), `${p.node_name} · ${p.node_location}`],
    [t('peerDetail.fields.endpoint'), p.remote_endpoint],
    [t('common.status'), statusMeta.value.label],
  ] as [string, string][]
})
function openDelete() {
  confirmText.value = ''
  showDelete.value = true
}
async function confirmDelete() {
  if (!peer.value || !deleteArmed.value) return
  deleting.value = true
  try {
    await api.peers.remove(peer.value.id)
    toast.show(t('peerDetail.deleted'))
    await navigateTo('/peers')
  }
  catch (e) {
    toast.error(e)
    deleting.value = false
  }
}
</script>

<template>
  <div class="col gap-5">
    <AppBreadcrumb :items="[{ label: t('nav.myPeers'), to: '/peers' }, { label: peer ? `AS${peer.remote_asn}` : '…' }]" />

    <div v-if="notFound" class="card card-outlined card-pad text-center col gap-3" :style="{ alignItems: 'center', padding: '56px 24px' }">
      <MdSym name="search_off" :size="40" class="txt-variant" />
      <h2 class="md-headline-small" :style="{ margin: 0 }">{{ t('peerDetail.notFound') }}</h2>
      <p class="md-body-medium txt-variant" :style="{ margin: 0 }">{{ t('peerDetail.notFoundBody') }}</p>
      <MdButton variant="tonal" icon="arrow_back" @click="navigateTo('/peers')">{{ t('common.backToPeers') }}</MdButton>
    </div>

    <template v-else-if="peer">
      <!-- Header -->
      <div class="row gap-4 flex-wrap">
        <span :style="{ display: 'inline-flex', width: '56px', height: '56px', borderRadius: '16px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }">
          <MdSym name="hub" :size="28" fill />
        </span>
        <div :style="{ flex: 1, minWidth: 0 }">
          <h1 class="md-headline-medium mono" :style="{ margin: 0 }">AS{{ peer.remote_asn }}</h1>
          <div class="md-body-medium txt-variant" :style="{ marginTop: '4px' }">{{ peer.node_name }} · {{ peer.node_location }}</div>
        </div>
        <MdStatus :kind="statusMeta.kind">{{ statusMeta.label }}</MdStatus>
        <div class="row gap-2">
          <MdIconButton icon="edit" variant="tonal" :title="t('peerDetail.edit')" @click="openEdit" />
          <MdIconButton icon="delete" :title="t('peerDetail.delete')" @click="openDelete" />
        </div>
      </div>

      <!-- Reject reason: prominent destructive alert -->
      <div
        v-if="peer.reject_reason"
        class="row gap-3"
        :style="{ alignItems: 'flex-start', padding: '16px', borderRadius: '16px', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }"
      >
        <MdSym name="cancel" :size="22" fill />
        <div>
          <div class="md-title-small">{{ t('peerDetail.rejectReason') }}</div>
          <div class="md-body-medium" :style="{ marginTop: '2px' }">{{ peer.reject_reason }}</div>
        </div>
      </div>

      <!-- Endpoint-mismatch / BGP-suspended-by-endpoint warning -->
      <div
        v-if="showMismatchBanner"
        class="row gap-3"
        :style="{ alignItems: 'flex-start', padding: '16px', borderRadius: '16px', background: 'var(--md-sys-color-warning-container)', color: 'var(--md-sys-color-on-warning-container)' }"
      >
        <MdSym name="warning" :size="22" fill />
        <div>
          <div class="md-title-small">{{ t('peerDetail.endpointMismatchTitle') }}</div>
          <div class="md-body-medium" :style="{ marginTop: '2px' }">{{ t('peerDetail.endpointMismatchBody') }}</div>
        </div>
      </div>

      <!-- Guidance (dynamic, BGP/endpoint-aware) -->
      <div
        v-if="guidance"
        class="card card-filled"
        :style="{ padding: '18px', display: 'flex', gap: '14px', alignItems: 'flex-start', background: guidanceTone[guidance.kind].bg, color: guidanceTone[guidance.kind].fg, borderRadius: '16px' }"
      >
        <MdSym :name="guidance.icon" :size="24" fill />
        <div>
          <div class="md-title-small">{{ t('peerDetail.statusGuidance') }}</div>
          <div class="md-body-medium" :style="{ marginTop: '2px' }">{{ guidance.text }}</div>
          <div class="md-body-small" :style="{ marginTop: '6px', opacity: 0.85 }">{{ statusSummary }}</div>
        </div>
      </div>

      <!-- Latest tiles -->
      <div class="metric-3">
        <div v-for="m in latestTiles" :key="m.label" class="card card-elevated metric-tile">
          <div class="metric-label md-label-large">
            <MdSym :name="m.icon" :size="20" :style="{ color: m.tone === 'secondary' ? 'var(--md-sys-color-on-surface-variant)' : `var(--md-sys-color-${m.tone})` }" fill />
            {{ m.label }}
          </div>
          <div class="metric-value md-headline-small" :style="{ marginTop: '10px' }">
            {{ m.value }}<span v-if="m.unit" class="md-title-medium txt-variant" :style="{ marginLeft: '4px' }">{{ m.unit }}</span>
          </div>
        </div>
      </div>

      <!-- Charts -->
      <div class="card card-elevated card-pad">
        <div class="row space-between flex-wrap gap-3" :style="{ marginBottom: '20px' }">
          <h2 class="md-title-large" :style="{ margin: 0 }">{{ t('peerDetail.runtimeMetrics') }}</h2>
          <div class="row gap-4 flex-wrap" :style="{ alignItems: 'center' }">
            <label class="row gap-2 md-body-medium" :style="{ alignItems: 'center', cursor: 'pointer' }">
              <MdSwitch v-model="peakOut" :aria-label="t('peerDetail.peakOut')" />
              <span>{{ t('peerDetail.peakOut') }}</span>
            </label>
            <MdSegmented v-model="range" role="tablist" :options="RANGES.map(r => ({ value: r.value, label: r.value }))" />
          </div>
        </div>

        <!-- Loading skeleton during a range refetch -->
        <div v-if="metricsPending" class="col gap-4" :style="{ padding: '8px 0' }">
          <div class="skeleton" :style="{ height: '150px', borderRadius: '12px' }" />
          <div class="skeleton" :style="{ height: '150px', borderRadius: '12px' }" />
        </div>

        <!-- Hard error: separable from empty, with retry -->
        <div
          v-else-if="metricsError"
          class="col gap-3 text-center"
          :style="{ alignItems: 'center', padding: '40px 0' }"
        >
          <MdSym name="error" :size="36" :style="{ color: 'var(--md-sys-color-error)' }" />
          <div class="md-body-medium txt-variant">{{ metricsError }}</div>
          <MdButton variant="tonal" icon="refresh" @click="refreshMetrics()">{{ t('common.retry') }}</MdButton>
        </div>

        <!-- Genuinely empty -->
        <div v-else-if="!hasSeries" class="md-body-medium txt-variant text-center" :style="{ padding: '40px 0' }">
          {{ t('peerDetail.noMetricsYet') }}
        </div>

        <div v-else class="col gap-6">
          <div class="charts-2">
            <div>
              <div class="md-title-small" :style="{ marginBottom: '4px' }">{{ t('peerDetail.metrics.rtt') }}</div>
              <div class="md-body-small txt-variant" :style="{ marginBottom: '8px' }">{{ t('peerDetail.rangeNote', { rtt: fmtRtt(metrics?.latest_rtt), range }) }}</div>
              <MdAreaChart :data="rttSeries" color="primary" :height="150" label="RTT" :format="fmtMs" />
            </div>
            <!-- Per-second transfer-rate chart (derived from counter deltas) -->
            <div>
              <div class="md-title-small" :style="{ marginBottom: '4px' }">{{ t('peerDetail.transferRate') }}</div>
              <div class="md-body-small txt-variant row gap-4" :style="{ marginBottom: '8px' }">
                <span class="row gap-2"><span :style="{ width: '14px', height: '3px', borderRadius: '2px', background: 'var(--md-sys-color-primary)', display: 'inline-block' }" /> {{ t('peerDetail.rxPeak', { rate: fmtRate(peakRx) }) }}</span>
                <span class="row gap-2"><span :style="{ width: '14px', height: '3px', borderRadius: '2px', backgroundImage: 'repeating-linear-gradient(90deg, var(--md-sys-color-tertiary) 0 3px, transparent 3px 6px)', display: 'inline-block' }" /> {{ t('peerDetail.txPeak', { rate: fmtRate(peakTx) }) }}</span>
              </div>
              <MdDualAreaChart :rx="rxRateSeries" :tx="txRateSeries" :height="150" :format="fmtRate" />
            </div>
          </div>

          <!-- Actual bytes transferred over the selected range -->
          <div class="row gap-5 flex-wrap" :style="{ padding: '12px 16px', borderRadius: '12px', background: 'var(--md-sys-color-surface-container-low)', alignItems: 'center' }">
            <span class="md-label-large txt-variant">{{ t('peerDetail.transferred', { range }) }}</span>
            <span class="row gap-2 md-body-medium mono" :style="{ alignItems: 'center' }">
              <MdSym name="arrow_downward" :size="16" :style="{ color: 'var(--md-sys-color-primary)' }" /> {{ t('peerDetail.rx') }} {{ fmtBytes(transferredRx) }}
            </span>
            <span class="row gap-2 md-body-medium mono" :style="{ alignItems: 'center' }">
              <MdSym name="arrow_upward" :size="16" :style="{ color: 'var(--md-sys-color-tertiary)' }" /> {{ t('peerDetail.tx') }} {{ fmtBytes(transferredTx) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Params -->
      <div class="params-2">
        <div class="card card-elevated card-pad">
          <h2 class="md-title-large" :style="{ margin: '0 0 4px' }">{{ t('peerDetail.connParams') }}</h2>
          <p class="md-body-small txt-variant" :style="{ margin: '0 0 12px' }">{{ t('peerDetail.connParamsSub') }}</p>
          <div class="col">
            <!-- ASN / pubkey / lla / mtu / psk / contact -->
            <div v-for="row in connRows" :key="row[0]" class="row gap-4" :style="{ padding: '14px 0', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }">
              <div class="md-body-medium txt-variant" :style="{ width: '150px', flexShrink: 0 }">{{ row[0] }}</div>
              <div class="md-body-medium row gap-2" :class="{ mono: row[2] }" :style="{ flex: 1, wordBreak: 'break-all', alignItems: 'center' }">
                <span>{{ row[1] }}</span>
                <MdCopyButton v-if="row[2]" :value="row[1]" :size="28" />
              </div>
            </div>
            <!-- Endpoint (with verification badge + actual endpoint) -->
            <div class="row gap-4" :style="{ padding: '14px 0', borderBottom: actualEndpoint ? '1px solid var(--md-sys-color-outline-variant)' : 'none' }">
              <div class="md-body-medium txt-variant" :style="{ width: '150px', flexShrink: 0 }">{{ t('peerDetail.fields.endpoint') }}</div>
              <div class="md-body-medium row gap-2 mono" :style="{ flex: 1, wordBreak: 'break-all', alignItems: 'center' }">
                <span>{{ peer.remote_endpoint }}</span>
                <span v-if="endpointBadge" :title="endpointBadge.title" :aria-label="endpointBadge.title" :style="{ display: 'inline-flex' }">
                  <MdSym :name="endpointBadge.icon" :size="18" :style="{ color: endpointBadge.color }" fill />
                </span>
                <MdCopyButton :value="peer.remote_endpoint" :size="28" />
              </div>
            </div>
            <div v-if="actualEndpoint" class="row gap-4" :style="{ padding: '14px 0' }">
              <div class="md-body-medium txt-variant" :style="{ width: '150px', flexShrink: 0 }">{{ t('peerDetail.fields.actualEndpoint') }}</div>
              <div class="md-body-medium row gap-2 mono" :style="{ flex: 1, wordBreak: 'break-all', alignItems: 'center' }">
                <span>{{ actualEndpoint }}</span>
                <MdCopyButton :value="actualEndpoint" :size="28" />
              </div>
            </div>
          </div>
        </div>
        <div class="card card-elevated card-pad">
          <h2 class="md-title-large" :style="{ margin: '0 0 4px' }">{{ t('peerDetail.nodeConfig') }}</h2>
          <p class="md-body-small txt-variant" :style="{ margin: '0 0 12px' }">{{ t('peerDetail.nodeConfigSub') }}</p>
          <div class="col">
            <div v-for="(row, i) in nodeRows" :key="row[0]" class="row gap-4" :style="{ padding: '14px 0', borderBottom: i < nodeRows.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none' }">
              <div class="md-body-medium txt-variant" :style="{ width: '150px', flexShrink: 0 }">{{ row[0] }}</div>
              <div class="md-body-medium row gap-2" :class="{ mono: row[2] }" :style="{ flex: 1, wordBreak: 'break-all', alignItems: 'center' }">
                <span>{{ row[1] }}</span>
                <MdCopyButton v-if="row[2] && row[1] !== t('common.dash')" :value="row[1]" :size="28" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Help / guidance affordance (non-Atlas) -->
      <div class="card card-outlined card-pad">
        <div class="row gap-3" :style="{ alignItems: 'flex-start' }">
          <MdSym name="help" :size="22" :style="{ color: 'var(--md-sys-color-primary)' }" fill />
          <div>
            <div class="md-title-small">{{ t('peerDetail.helpTitle') }}</div>
            <ul class="md-body-medium txt-variant" :style="{ margin: '6px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }">
              <li>{{ t('peerDetail.helpEndpoint') }}</li>
              <li>{{ t('peerDetail.helpBgp') }}</li>
              <li>{{ t('peerDetail.helpEdit') }}</li>
            </ul>
          </div>
        </div>
      </div>
    </template>

    <!-- Edit dialog -->
    <MdDialog v-model:open="showEdit" :title="t('peerDetail.editTitle')" :submitting="saving">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <MdTextField v-model="editForm.pubkey" :label="t('peerNew.pubkey')" mono tf-bg="var(--md-sys-color-surface-container-high)" :error="editForm.pubkey && !isValidPubkey(editForm.pubkey) ? t('peerNew.validation.pubkey') : ''" />
        <MdTextField v-model="editForm.endpoint" :label="t('peerNew.endpoint')" mono tf-bg="var(--md-sys-color-surface-container-high)" :error="editForm.endpoint && !isValidEndpoint(editForm.endpoint) ? t('peerNew.validation.endpoint') : ''" />
        <MdTextField v-model="editForm.lla" :label="t('peerNew.lla')" mono tf-bg="var(--md-sys-color-surface-container-high)" :error="editForm.lla && !isValidLLA(editForm.lla) ? t('peerNew.validation.lla') : ''" />
        <MdTextField :model-value="editForm.mtu" :label="t('peerNew.mtu')" mono tf-bg="var(--md-sys-color-surface-container-high)" inputmode="numeric" :error="!isValidMtu(editForm.mtu) ? t('peerNew.validation.mtu') : ''" @update:model-value="(v: string) => (editForm.mtu = v.replace(/\D/g, ''))" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="saving" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="save" :disabled="!editValid" :loading="saving" @click="saveEdit">{{ t('common.save') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Delete dialog: type-to-confirm friction + recap -->
    <MdDialog v-model:open="showDelete" :title="t('peerDetail.deleteTitle')" :submitting="deleting">
      <div class="col gap-4" :style="{ marginTop: '4px' }">
        <div
          class="row gap-3"
          :style="{ alignItems: 'flex-start', padding: '14px', borderRadius: '12px', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }"
        >
          <MdSym name="warning" :size="20" fill />
          <span class="md-body-medium">{{ t('peerDetail.deleteWarning') }}</span>
        </div>
        <div :style="{ borderRadius: '12px', border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden' }">
          <div
            v-for="(row, i) in deleteRecap"
            :key="row[0]"
            class="row gap-4"
            :style="{ padding: '12px 14px', borderBottom: i < deleteRecap.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none' }"
          >
            <div class="md-body-small txt-variant" :style="{ width: '110px', flexShrink: 0 }">{{ row[0] }}</div>
            <div class="md-body-small" :style="{ flex: 1, wordBreak: 'break-all' }">{{ row[1] }}</div>
          </div>
        </div>
        <MdTextField v-model="confirmText" :label="t('peerDetail.deleteConfirmLabel')" :placeholder="t('peerDetail.deleteConfirmPlaceholder')" mono tf-bg="var(--md-sys-color-surface-container-high)" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="deleting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="delete" :disabled="!deleteArmed || deleting" :loading="deleting" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" @click="confirmDelete">{{ t('common.delete') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
