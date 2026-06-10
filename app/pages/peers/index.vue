<script setup lang="ts">
import type { PeerStatus } from '~/types/api'

definePageMeta({ middleware: 'auth', title: 'nav.myPeers' })

const { t } = useI18n()
const api = useApi()
const { meta } = usePeerStatus()
const { fmtRtt } = useFormat()

const filter = ref<'all' | PeerStatus>('all')
const view = useCookie<'cards' | 'table'>('ap-peer-view', { default: () => 'cards', path: '/' })

const { data, pending, error, refresh } = await useAsyncData('peers', async () => {
  const [peers, summary, creation] = await Promise.all([
    api.peers.list(),
    api.peers.summary().catch(() => []),
    api.peers.creationStatus().catch(() => ({ enabled: true })),
  ])
  const byId = new Map(summary.map((s) => [s.peer_id, s]))
  return {
    peers: peers.map((p) => ({ ...p, _summary: byId.get(p.id) ?? null })),
    creationEnabled: creation.enabled,
  }
}, { lazy: true, server: false })

const peers = computed(() => data.value?.peers ?? [])
const creationEnabled = computed(() => data.value?.creationEnabled ?? true)
const activeCount = computed(() => peers.value.filter((p) => p.status === 'active').length)
const filtered = computed(() => filter.value === 'all' ? peers.value : peers.value.filter((p) => p.status === filter.value))

const retrying = ref(false)
async function retry() {
  retrying.value = true
  try {
    await refresh()
  }
  finally {
    retrying.value = false
  }
}

const filters: { value: 'all' | PeerStatus, label: string }[] = [
  { value: 'all', label: t('peers.filters.all') },
  { value: 'active', label: t('peers.filters.active') },
  { value: 'pending', label: t('peers.filters.pending') },
  { value: 'suspended', label: t('peers.filters.suspended') },
  { value: 'rejected', label: t('peers.filters.rejected') },
]

const viewOptions = [
  { value: 'cards', label: t('peers.view.cards'), icon: 'grid_view' },
  { value: 'table', label: t('peers.view.table'), icon: 'table_rows' },
]
</script>

<template>
  <div class="col gap-5">
    <div class="row space-between flex-wrap gap-4" :style="{ alignItems: 'flex-end' }">
      <div>
        <h1 class="md-headline-medium" :style="{ margin: 0 }">{{ t('peers.title') }}</h1>
        <p class="md-body-medium txt-variant" :style="{ margin: '6px 0 0' }">{{ t('peers.summary', { total: peers.length, active: activeCount }) }}</p>
      </div>
      <MdButton v-if="creationEnabled" variant="filled" icon="add" @click="navigateTo('/peers/new')">{{ t('peers.newPeer') }}</MdButton>
    </div>

    <div class="row space-between flex-wrap gap-3">
      <div class="row gap-2 flex-wrap">
        <MdChip v-for="f in filters" :key="f.value" :selected="filter === f.value" @click="filter = f.value">{{ f.label }}</MdChip>
      </div>
      <MdSegmented v-model="view" :options="viewOptions" />
    </div>

    <!-- Loading -->
    <div v-if="pending" class="peers-grid">
      <SkeletonBlock v-for="i in 4" :key="i" height="120px" radius="12px" />
    </div>

    <!-- Error (kept distinct from the empty state so a failed request never
         reads as "you have zero peers") -->
    <div
      v-else-if="error"
      class="card card-outlined card-pad text-center col gap-4"
      :style="{ alignItems: 'center', padding: '56px 24px' }"
    >
      <span :style="{ display: 'inline-flex', width: '72px', height: '72px', borderRadius: '24px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }">
        <MdSym name="cloud_off" :size="36" />
      </span>
      <h2 class="md-headline-small" :style="{ margin: 0 }">{{ t('peers.loadError') }}</h2>
      <p class="md-body-medium txt-variant" :style="{ margin: 0, maxWidth: '420px' }">{{ t('peers.loadErrorBody') }}</p>
      <MdButton variant="tonal" icon="refresh" :loading="retrying" @click="retry">{{ t('common.retry') }}</MdButton>
    </div>

    <!-- Empty (only when there is genuinely no data and no error) -->
    <div v-else-if="!peers.length" class="card card-outlined card-pad text-center col gap-4" :style="{ alignItems: 'center', padding: '56px 24px' }">
      <span :style="{ display: 'inline-flex', width: '72px', height: '72px', borderRadius: '24px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface-variant)' }">
        <MdSym name="hub" :size="36" />
      </span>
      <h2 class="md-headline-small" :style="{ margin: 0 }">{{ t('peers.empty') }}</h2>
      <p class="md-body-medium txt-variant" :style="{ margin: 0, maxWidth: '420px' }">{{ t('peers.emptyBody') }}</p>
      <MdButton v-if="creationEnabled" variant="filled" icon="add" @click="navigateTo('/peers/new')">{{ t('peers.newPeer') }}</MdButton>
    </div>

    <EmptyState v-else-if="!filtered.length" icon="filter_alt_off" :body="t('peers.emptyFiltered')">
      <MdButton variant="tonal" icon="filter_alt_off" @click="filter = 'all'">{{ t('peers.clearFilter') }}</MdButton>
    </EmptyState>

    <!-- Table view -->
    <div v-else-if="view === 'table'" class="card card-elevated">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ t('peers.table.asn') }}</th>
              <th>{{ t('peers.table.node') }}</th>
              <th>{{ t('peers.table.bgp') }}</th>
              <th>{{ t('peers.table.rtt') }}</th>
              <th>{{ t('peers.table.endpoint') }}</th>
              <th>{{ t('peers.table.status') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filtered" :key="p.id" class="row-clickable" @click="navigateTo(`/peers/${p.id}`)">
              <td class="mono" :style="{ fontWeight: 500 }">AS{{ p.remote_asn }}</td>
              <td>{{ p.node_name }}</td>
              <td>{{ p._summary?.latest_bgp_state || t('common.dash') }}</td>
              <td class="mono">{{ fmtRtt(p._summary?.latest_rtt) }}</td>
              <td><span class="code-inline">{{ p.remote_endpoint }}</span></td>
              <td><MdStatus :kind="meta(p.status).kind">{{ meta(p.status).label }}</MdStatus></td>
              <td><MdSym name="chevron_right" :style="{ color: 'var(--md-sys-color-on-surface-variant)' }" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Cards view -->
    <div v-else class="peers-grid">
      <div
        v-for="p in filtered"
        :key="p.id"
        v-ripple
        class="card card-elevated state-layer"
        :style="{ padding: '20px', cursor: 'pointer', '--slc': 'var(--md-sys-color-on-surface)' }"
        @click="navigateTo(`/peers/${p.id}`)"
      >
        <div class="row gap-3" :style="{ position: 'relative', zIndex: 1 }">
          <span :style="{ display: 'inline-flex', width: '44px', height: '44px', borderRadius: '12px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface-variant)' }">
            <MdSym name="dns" :size="22" />
          </span>
          <div :style="{ flex: 1, minWidth: 0 }">
            <div class="md-title-medium mono" :style="{ fontWeight: 600 }">AS{{ p.remote_asn }}</div>
            <div class="md-body-small txt-variant">{{ p.node_name }} · {{ p.node_location }}</div>
          </div>
          <MdStatus :kind="meta(p.status).kind">{{ meta(p.status).label }}</MdStatus>
        </div>
        <div class="row gap-6" :style="{ marginTop: '18px', position: 'relative', zIndex: 1 }">
          <div>
            <div class="md-label-medium txt-variant">{{ t('peers.card.bgp') }}</div>
            <div class="md-title-medium">{{ p._summary?.latest_bgp_state || t('common.dash') }}</div>
          </div>
          <div>
            <div class="md-label-medium txt-variant">{{ t('peers.card.rtt') }}</div>
            <div class="md-title-medium mono">{{ fmtRtt(p._summary?.latest_rtt) }}<span v-if="p._summary?.latest_rtt != null"> {{ t('common.ms') }}</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
