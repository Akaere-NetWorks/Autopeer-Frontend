<script setup lang="ts">
import type { UpdatePeerReq } from '~/types/api'

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

const { data: peer, error, refresh } = await useAsyncData(`peer-${id.value}`, () => api.peers.get(id.value), { server: false })
const { data: metrics } = await useAsyncData(
  () => `peer-metrics-${id.value}-${range.value}`,
  () => api.peers.metrics(id.value, rangeHours.value).catch(() => null),
  { watch: [range], server: false },
)

const notFound = computed(() => {
  const e = error.value as unknown as { status?: number, statusCode?: number } | null
  return e?.status === 404 || e?.statusCode === 404
})

const statusMeta = computed(() => peer.value ? meta(peer.value.status) : meta('pending'))
const guidance = computed(() => {
  const s = peer.value?.status
  return s ? t(`peerDetail.guidance.${s}`) : ''
})

const points = computed(() => metrics.value?.points ?? [])
const rttSeries = computed(() => points.value.map((p) => p.rtt_ms ?? 0))
const rxSeries = computed(() => points.value.map((p) => p.rx_bytes))
const txSeries = computed(() => points.value.map((p) => p.tx_bytes))
const hasSeries = computed(() => points.value.length > 1)
const totalRx = computed(() => points.value.reduce((a, p) => a + p.rx_bytes, 0))
const totalTx = computed(() => points.value.reduce((a, p) => a + p.tx_bytes, 0))

const latestTiles = computed(() => {
  const m = metrics.value
  return [
    { icon: 'network_ping', label: t('peerDetail.metrics.rtt'), value: fmtRtt(m?.latest_rtt), unit: m?.latest_rtt != null ? t('common.ms') : '', tone: 'primary' },
    { icon: 'route', label: t('peerDetail.metrics.bgpState'), value: m?.latest_bgp_state || t('common.dash'), unit: '', tone: 'tertiary' },
    { icon: 'handshake', label: t('peerDetail.metrics.lastHandshake'), value: relTime(m?.latest_handshake), unit: '', tone: 'secondary' },
  ]
})

const connRows = computed(() => {
  const p = peer.value
  if (!p) return []
  return [
    [t('peerDetail.fields.remoteAsn'), `AS${p.remote_asn}`, true],
    [t('peerDetail.fields.pubkey'), p.remote_pubkey, true],
    [t('peerDetail.fields.endpoint'), p.remote_endpoint, true],
    [t('peerDetail.fields.lla'), p.remote_lla, true],
    [t('peerDetail.fields.mtu'), p.mtu ? String(p.mtu) : t('peerNew.mtuDefault'), true],
    [t('peerDetail.fields.psk'), p.wg_preshared_key ? t('peerDetail.pskEnabled') : t('peerDetail.pskNot'), false],
  ] as [string, string, boolean][]
})
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
  ] as [string, string, boolean][]
})

// ── Edit ─────────────────────────────────────────────────────────────────────
const showEdit = ref(false)
const saving = ref(false)
const editForm = reactive({ pubkey: '', endpoint: '', lla: '', mtu: '' })
function openEdit() {
  const p = peer.value
  if (!p) return
  editForm.pubkey = p.remote_pubkey
  editForm.endpoint = p.remote_endpoint
  editForm.lla = p.remote_lla
  editForm.mtu = p.mtu ? String(p.mtu) : ''
  showEdit.value = true
}
const editValid = computed(() =>
  isValidPubkey(editForm.pubkey) && isValidEndpoint(editForm.endpoint) && isValidLLA(editForm.lla) && isValidMtu(editForm.mtu),
)
async function saveEdit() {
  const p = peer.value
  if (!p) return
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
    showEdit.value = false
    toast.show(t('peerDetail.updated'))
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────
const showDelete = ref(false)
const deleting = ref(false)
async function confirmDelete() {
  if (!peer.value) return
  deleting.value = true
  try {
    await api.peers.remove(peer.value.id)
    toast.show(t('peerDetail.deleted'))
    await navigateTo('/peers')
  } catch (e) {
    toast.error(e)
  } finally {
    deleting.value = false
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
          <MdIconButton icon="delete" :title="t('peerDetail.delete')" @click="showDelete = true" />
        </div>
      </div>

      <!-- Guidance -->
      <div class="card card-filled" :style="{ padding: '18px', display: 'flex', gap: '14px', alignItems: 'flex-start', background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)', borderRadius: '16px' }">
        <MdSym :name="statusMeta.icon" :size="24" fill />
        <div>
          <div class="md-title-small">{{ t('peerDetail.statusGuidance') }}</div>
          <div class="md-body-medium" :style="{ marginTop: '2px' }">{{ guidance }}</div>
          <div v-if="peer.status === 'rejected' && peer.reject_reason" class="md-body-small" :style="{ marginTop: '6px' }">
            <strong>{{ t('peerDetail.rejectReason') }}:</strong> {{ peer.reject_reason }}
          </div>
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
          <MdSegmented v-model="range" :options="RANGES.map(r => ({ value: r.value, label: r.value }))" />
        </div>
        <div v-if="!hasSeries" class="md-body-medium txt-variant text-center" :style="{ padding: '40px 0' }">
          {{ t('lookingGlass.empty') }}
        </div>
        <div v-else class="charts-2">
          <div>
            <div class="md-title-small" :style="{ marginBottom: '4px' }">{{ t('peerDetail.metrics.rtt') }}</div>
            <div class="md-body-small txt-variant" :style="{ marginBottom: '8px' }">{{ t('peerDetail.rangeNote', { rtt: fmtRtt(metrics?.latest_rtt), range }) }}</div>
            <MdAreaChart :data="rttSeries" color="primary" :height="150" label="RTT" />
          </div>
          <div>
            <div class="md-title-small" :style="{ marginBottom: '4px' }">{{ t('peerDetail.traffic') }}</div>
            <div class="md-body-small txt-variant row gap-4" :style="{ marginBottom: '8px' }">
              <span class="row gap-2"><span :style="{ width: '14px', height: '3px', borderRadius: '2px', background: 'var(--md-sys-color-primary)', display: 'inline-block' }" /> {{ t('peerDetail.rx') }} {{ fmtBytes(totalRx) }}</span>
              <span class="row gap-2"><span :style="{ width: '14px', height: '3px', borderRadius: '2px', backgroundImage: 'repeating-linear-gradient(90deg, var(--md-sys-color-tertiary) 0 3px, transparent 3px 6px)', display: 'inline-block' }" /> {{ t('peerDetail.tx') }} {{ fmtBytes(totalTx) }}</span>
            </div>
            <MdDualAreaChart :rx="rxSeries" :tx="txSeries" :height="150" />
          </div>
        </div>
      </div>

      <!-- Params -->
      <div class="params-2">
        <div class="card card-elevated card-pad">
          <h2 class="md-title-large" :style="{ margin: '0 0 4px' }">{{ t('peerDetail.connParams') }}</h2>
          <p class="md-body-small txt-variant" :style="{ margin: '0 0 12px' }">{{ t('peerDetail.connParamsSub') }}</p>
          <div class="col">
            <div v-for="(row, i) in connRows" :key="row[0]" class="row gap-4" :style="{ padding: '14px 0', borderBottom: i < connRows.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none' }">
              <div class="md-body-medium txt-variant" :style="{ width: '150px', flexShrink: 0 }">{{ row[0] }}</div>
              <div class="md-body-medium row gap-2" :class="{ mono: row[2] }" :style="{ flex: 1, wordBreak: 'break-all', alignItems: 'center' }">
                <span>{{ row[1] }}</span>
                <button v-if="row[2] && row[1] !== t('common.dash')" class="icon-btn" :style="{ width: '28px', height: '28px' }" :title="t('common.copy')" @click="copy(row[1])"><MdSym name="content_copy" :size="16" /></button>
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
              <div class="md-body-medium" :class="{ mono: row[2] }" :style="{ flex: 1, wordBreak: 'break-all' }">{{ row[1] }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Edit dialog -->
    <MdDialog v-model:open="showEdit" :title="t('peerDetail.editTitle')">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <MdTextField v-model="editForm.pubkey" :label="t('peerNew.pubkey')" mono tf-bg="var(--md-sys-color-surface-container-high)" :error="editForm.pubkey && !isValidPubkey(editForm.pubkey) ? t('peerNew.validation.pubkey') : ''" />
        <MdTextField v-model="editForm.endpoint" :label="t('peerNew.endpoint')" mono tf-bg="var(--md-sys-color-surface-container-high)" :error="editForm.endpoint && !isValidEndpoint(editForm.endpoint) ? t('peerNew.validation.endpoint') : ''" />
        <MdTextField v-model="editForm.lla" :label="t('peerNew.lla')" mono tf-bg="var(--md-sys-color-surface-container-high)" :error="editForm.lla && !isValidLLA(editForm.lla) ? t('peerNew.validation.lla') : ''" />
        <MdTextField :model-value="editForm.mtu" :label="t('peerNew.mtu')" mono tf-bg="var(--md-sys-color-surface-container-high)" inputmode="numeric" :error="!isValidMtu(editForm.mtu) ? t('peerNew.validation.mtu') : ''" @update:model-value="(v: string) => (editForm.mtu = v.replace(/\D/g, ''))" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="save" :disabled="!editValid" :loading="saving" @click="saveEdit">{{ t('common.save') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Delete dialog -->
    <MdDialog v-model:open="showDelete" :title="t('peerDetail.deleteTitle')">
      <p>{{ t('peerDetail.deleteBody', { asn: peer?.remote_asn }) }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="delete" :loading="deleting" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" @click="confirmDelete">{{ t('common.delete') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
