<script setup lang="ts">
definePageMeta({ middleware: 'admin', title: 'nav.admin.overview' })

const { t } = useI18n()
const api = useApi()

const { data: stats, pending } = await useAsyncData('admin-stats', () => api.admin.stats())

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
        <div v-if="pending" class="skeleton" :style="{ height: '34px', width: '60%', marginTop: '8px' }" />
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
  </div>
</template>
