<script setup lang="ts">
definePageMeta({ middleware: 'admin', title: 'nav.admin.overview' })

const { t } = useI18n()
const api = useApi()
const { fmtRtt } = useFormat()

const { data: stats, pending } = await useAsyncData('admin-stats', () => api.admin.stats(), { lazy: true, server: false })
const { data: nodes, pending: nodesPending } = await useAsyncData('admin-overview-nodes', () => api.admin.nodes.list(), { lazy: true, server: false })

useHead({ title: t('admin.overview.title') })

const tiles = computed(() => {
  const s = stats.value
  return [
    { icon: 'check_circle', tone: 'primary', label: t('admin.overview.activePeers'), value: s?.peers_active ?? 0 },
    { icon: 'hourglass_top', tone: 'tertiary', label: t('admin.overview.pending'), value: s?.peers_pending ?? 0, to: '/admin/peers?status=pending' },
    { icon: 'pause_circle', tone: 'tertiary', label: t('admin.overview.suspended'), value: s?.peers_suspended ?? 0 },
    { icon: 'cancel', tone: 'primary', label: t('admin.overview.rejected'), value: s?.peers_rejected ?? 0 },
    { icon: 'dns', tone: 'primary', label: t('admin.overview.nodesOnline'), value: `${s?.nodes_online ?? 0}/${s?.nodes_total ?? 0}` },
    { icon: 'fiber_new', tone: 'tertiary', label: t('admin.overview.newToday'), value: s?.new_today ?? 0 },
  ]
})

const actions = [
  { icon: 'rule', label: 'admin.overview.reviewPending', to: '/admin/peers?status=pending' },
  { icon: 'dns', label: 'admin.overview.manageNodes', to: '/admin/nodes' },
  { icon: 'monitor_heart', label: 'admin.overview.systemHealth', to: '/admin/system' },
]
</script>

<template>
  <div class="col gap-6">
    <PageHeader icon="dashboard" :title="t('admin.overview.title')" :subtitle="t('admin.overview.subtitle')" />

    <section class="stats-grid">
      <component
        :is="tile.to ? 'NuxtLink' : 'div'"
        v-for="tile in tiles"
        :key="tile.label"
        :to="tile.to"
        class="card card-elevated metric-tile"
        :class="{ 'state-layer': tile.to }"
        :style="tile.to ? { cursor: 'pointer', '--slc': 'var(--md-sys-color-on-surface)' } : undefined"
      >
        <div class="metric-label md-label-large">
          <span :style="{ display: 'inline-flex', width: '36px', height: '36px', borderRadius: '10px', alignItems: 'center', justifyContent: 'center', background: `var(--md-sys-color-${tile.tone}-container)`, color: `var(--md-sys-color-on-${tile.tone}-container)` }">
            <MdSym :name="tile.icon" :size="20" fill />
          </span>
          {{ tile.label }}
        </div>
        <div v-if="stats === null" class="skeleton" :style="{ height: '34px', width: '60%', marginTop: '8px' }" />
        <div v-else class="metric-value md-display-small" :style="{ fontSize: '34px' }">{{ tile.value }}</div>
      </component>
    </section>

    <section>
      <h2 class="md-title-large" :style="{ margin: '8px 4px 16px' }">{{ t('admin.overview.quickActions') }}</h2>
      <div class="metric-3">
        <NuxtLink
          v-for="a in actions"
          :key="a.to"
          v-ripple
          :to="a.to"
          class="card card-elevated card-pad state-layer row gap-4"
          :style="{ cursor: 'pointer', alignItems: 'center', '--slc': 'var(--md-sys-color-primary)' }"
        >
          <span :style="{ display: 'inline-flex', width: '44px', height: '44px', borderRadius: '12px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)', flexShrink: 0 }">
            <MdSym :name="a.icon" :size="22" fill />
          </span>
          <span class="md-title-medium">{{ t(a.label) }}</span>
          <MdSym name="chevron_right" :style="{ marginLeft: 'auto', color: 'var(--md-sys-color-on-surface-variant)' }" />
        </NuxtLink>
      </div>
    </section>

    <section>
      <div class="row gap-3" :style="{ alignItems: 'center', margin: '8px 4px 16px' }">
        <h2 class="md-title-large" :style="{ margin: 0 }">{{ t('admin.overview.nodesTitle') }}</h2>
        <NuxtLink to="/admin/nodes" class="btn btn-text" :style="{ marginLeft: 'auto' }">
          {{ t('admin.overview.viewAllNodes') }}
          <MdSym name="chevron_right" :size="18" />
        </NuxtLink>
      </div>

      <div class="card card-elevated">
        <div v-if="nodesPending" class="col gap-2 card-pad">
          <div class="skeleton" :style="{ height: '44px', borderRadius: '8px' }" />
          <div class="skeleton" :style="{ height: '44px', borderRadius: '8px' }" />
          <div class="skeleton" :style="{ height: '44px', borderRadius: '8px' }" />
        </div>
        <div v-else-if="!nodes || !nodes.length" class="card-pad txt-variant md-body-medium" :style="{ textAlign: 'center', padding: '40px 16px' }">
          {{ t('admin.overview.noNodes') }}
        </div>
        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>{{ t('admin.nodes.name') }}</th>
                <th>{{ t('admin.nodes.location') }}</th>
                <th>{{ t('admin.nodes.status') }}</th>
                <th>{{ t('admin.overview.activePeers') }}</th>
                <th>{{ t('admin.overview.avgRtt') }}</th>
                <th>{{ t('admin.nodes.agent') }}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="n in nodes"
                :key="n.id"
                class="row-clickable"
                @click="navigateTo(`/admin/nodes/${n.id}`)"
              >
                <td :style="{ fontWeight: 500 }">{{ n.name }}</td>
                <td>{{ n.location || t('common.dash') }}</td>
                <td>
                  <MdStatus v-if="n.online" kind="success">{{ t('admin.nodes.online') }}</MdStatus>
                  <MdStatus v-else kind="neutral">{{ t('admin.nodes.offline') }}</MdStatus>
                </td>
                <td>{{ n.active_peers }}</td>
                <td class="mono md-body-small">{{ fmtRtt(n.avg_rtt_ms) }} <span v-if="n.avg_rtt_ms != null" class="txt-variant">{{ t('common.ms') }}</span></td>
                <td><span class="mono md-body-small">{{ n.agent_version || t('common.dash') }}</span></td>
                <td @click.stop>
                  <NuxtLink :to="`/admin/nodes/${n.id}`" class="btn btn-text">{{ t('admin.overview.viewNode') }}</NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>
