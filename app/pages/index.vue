<script setup lang="ts">
const { t } = useI18n()
const api = useApi()
const { fmtBytes } = useFormat()

const { data, pending, error } = await useAsyncData('home', async () => {
  const [stats, nodes] = await Promise.all([
    api.stats.public().catch(() => null),
    api.nodes.listPublic().catch(() => [] as Awaited<ReturnType<typeof api.nodes.listPublic>>),
  ])
  return { stats, nodes }
}, { server: false })

const stats = computed(() => data.value?.stats ?? null)
const nodes = computed(() => data.value?.nodes ?? [])
const totalNodes = computed(() => nodes.value.length)

const metrics = computed(() => {
  const s = stats.value
  return [
    { icon: 'dns', tone: 'primary', label: t('landing.metrics.nodesOnline'), value: s?.nodes_online ?? 0, sub: t('landing.metrics.nodesOnlineSub', { total: totalNodes.value }) },
    { icon: 'hub', tone: 'tertiary', label: t('landing.metrics.activePeers'), value: s?.peers_active ?? 0, sub: t('landing.metrics.activePeersSub') },
    { icon: 'swap_vert', tone: 'primary', label: t('landing.metrics.traffic'), value: fmtBytes((s?.total_rx_bytes ?? 0) + (s?.total_tx_bytes ?? 0)), sub: t('landing.metrics.trafficSub', { rx: fmtBytes(s?.total_rx_bytes ?? 0), tx: fmtBytes(s?.total_tx_bytes ?? 0) }) },
    { icon: 'network_ping', tone: 'tertiary', label: t('landing.metrics.avgRtt'), value: (s?.avg_rtt_ms ?? 0).toFixed(1), unit: t('common.ms'), sub: t('landing.metrics.avgRttSub') },
  ]
})

const features = computed(() => [
  { icon: 'auto_fix_high', title: t('landing.why.zeroConfig'), body: t('landing.why.zeroConfigBody') },
  { icon: 'lan', title: t('landing.why.multiNode'), body: t('landing.why.multiNodeBody') },
  { icon: 'volunteer_activism', title: t('landing.why.free'), body: t('landing.why.freeBody') },
])

useHead({ title: t('landing.title') })
</script>

<template>
  <div class="col gap-6">
    <!-- Hero -->
    <section
      class="card"
      :style="{
        background: 'var(--md-sys-color-primary-container)',
        color: 'var(--md-sys-color-on-primary-container)',
        padding: '56px 40px',
        borderRadius: 'var(--md-shape-xl)',
        textAlign: 'center',
      }"
    >
      <div :style="{ maxWidth: '720px', margin: '0 auto' }">
        <span class="chip" :style="{ background: 'rgb(var(--md-sys-color-on-primary-container-rgb) / .10)', border: 'none', color: 'inherit', marginBottom: '20px', cursor: 'default' }">
          <MdSym name="bolt" :size="18" /> <span>{{ t('landing.badge') }}</span>
        </span>
        <h1 class="md-display-medium" :style="{ margin: '0 0 16px', letterSpacing: '-0.5px' }">{{ t('landing.title') }}</h1>
        <p class="md-body-large" :style="{ margin: '0 auto 32px', maxWidth: '560px', opacity: 0.92 }">{{ t('landing.subtitle') }}</p>
        <div class="row gap-3 flex-wrap" :style="{ justifyContent: 'center' }">
          <button
            v-ripple
            class="btn btn-lg"
            :style="{ background: 'var(--md-sys-color-on-primary-container)', color: 'var(--md-sys-color-primary-container)' }"
            @click="navigateTo('/login')"
          >
            <MdSym name="rocket_launch" /> <span>{{ t('landing.getStarted') }}</span>
          </button>
          <a
            v-ripple
            class="btn btn-lg btn-outlined"
            :style="{ color: 'inherit', borderColor: 'rgb(var(--md-sys-color-on-primary-container-rgb) / .4)' }"
            href="https://github.com/Akaere-NetWorks/Autopeer-Center"
            target="_blank"
            rel="noopener"
          >
            <MdSym name="menu_book" /> <span>{{ t('landing.documentation') }}</span>
          </a>
        </div>
      </div>
    </section>

    <!-- Stats -->
    <section class="stats-grid">
      <div v-for="m in metrics" :key="m.label" class="card card-elevated metric-tile">
        <div class="metric-label md-label-large">
          <span :style="{ display: 'inline-flex', width: '36px', height: '36px', borderRadius: '10px', alignItems: 'center', justifyContent: 'center', background: `var(--md-sys-color-${m.tone}-container)`, color: `var(--md-sys-color-on-${m.tone}-container)` }">
            <MdSym :name="m.icon" :size="20" fill />
          </span>
          {{ m.label }}
        </div>
        <div class="metric-value md-display-small" :style="{ fontSize: '34px' }">
          {{ m.value }}<span v-if="m.unit" class="md-title-medium" :style="{ color: 'var(--md-sys-color-on-surface-variant)', marginLeft: '4px' }">{{ m.unit }}</span>
        </div>
        <div class="metric-sub md-body-small">{{ m.sub }}</div>
      </div>
    </section>

    <!-- Error banner -->
    <div v-if="error" class="card card-outlined card-pad" :style="{ color: 'var(--md-sys-color-on-surface-variant)' }">
      <MdSym name="cloud_off" /> {{ t('errors.network') }}
    </div>

    <!-- Nodes table -->
    <section class="card card-elevated">
      <div :style="{ padding: '20px 24px 8px' }">
        <h2 class="md-title-large" :style="{ margin: 0 }">{{ t('landing.nodesTitle') }}</h2>
        <p class="md-body-medium txt-variant" :style="{ margin: '4px 0 0' }">{{ t('landing.nodesSubtitle') }}</p>
      </div>
      <div v-if="pending && !nodes.length" :style="{ padding: '16px 24px 24px' }" class="col gap-3">
        <SkeletonBlock v-for="i in 4" :key="i" height="40px" />
      </div>
      <div v-else-if="!nodes.length" class="md-body-medium txt-variant" :style="{ padding: '8px 24px 24px' }">{{ t('landing.noNodes') }}</div>
      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ t('landing.table.name') }}</th>
              <th>{{ t('landing.table.location') }}</th>
              <th>{{ t('landing.table.publicIp') }}</th>
              <th>{{ t('landing.table.asn') }}</th>
              <th>{{ t('landing.table.status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in nodes" :key="n.id">
              <td :style="{ fontWeight: 500 }">{{ n.name }}</td>
              <td>{{ n.location }}</td>
              <td><span class="code-inline">{{ n.public_ip }}</span></td>
              <td class="mono">AS{{ n.our_asn }}</td>
              <td>
                <MdStatus v-if="n.online" kind="success">{{ t('landing.online') }}</MdStatus>
                <MdStatus v-else kind="neutral">{{ t('landing.offline') }}</MdStatus>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Node performance -->
    <section v-if="stats && stats.nodes.length" class="card card-elevated">
      <div :style="{ padding: '20px 24px 8px' }">
        <h2 class="md-title-large" :style="{ margin: 0 }">{{ t('landing.perfTitle') }}</h2>
        <p class="md-body-medium txt-variant" :style="{ margin: '4px 0 0' }">{{ t('landing.perfSubtitle') }}</p>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ t('landing.table.node') }}</th>
              <th>{{ t('landing.table.activePeers') }}</th>
              <th>{{ t('landing.table.avgRtt') }}</th>
              <th>{{ t('landing.table.rx24') }}</th>
              <th>{{ t('landing.table.tx24') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in stats.nodes" :key="n.node_id">
              <td :style="{ fontWeight: 500 }">{{ n.name }}</td>
              <td>{{ n.peers_active }}</td>
              <td class="mono">{{ n.avg_rtt_ms.toFixed(1) }} {{ t('common.ms') }}</td>
              <td class="mono">{{ fmtBytes(n.rx_bytes_24h) }}</td>
              <td class="mono">{{ fmtBytes(n.tx_bytes_24h) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Why -->
    <section>
      <h2 class="md-headline-small" :style="{ margin: '8px 4px 16px' }">{{ t('landing.whyTitle') }}</h2>
      <div class="why-grid">
        <div v-for="f in features" :key="f.title" class="card card-elevated card-pad">
          <span :style="{ display: 'inline-flex', width: '52px', height: '52px', borderRadius: '16px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)', marginBottom: '16px' }">
            <MdSym :name="f.icon" :size="26" fill />
          </span>
          <h3 class="md-title-large" :style="{ margin: '0 0 8px' }">{{ f.title }}</h3>
          <p class="md-body-medium txt-variant" :style="{ margin: 0 }">{{ f.body }}</p>
        </div>
      </div>
    </section>
  </div>
</template>
