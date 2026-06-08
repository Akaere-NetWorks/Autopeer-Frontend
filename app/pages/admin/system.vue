<script setup lang="ts">
definePageMeta({ middleware: 'admin', title: 'nav.admin.system' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const { fmtBytes, fmtUptime, relTime } = useFormat()

const { data: sys, pending, refresh } = await useAsyncData('admin-system', () => api.admin.system.status())
const { data: tables } = await useAsyncData('admin-db-tables', () => api.admin.system.dbTables(30).catch(() => null))

const subsystems = computed(() => {
  const s = sys.value
  if (!s) return []
  return [
    { key: 'database', icon: 'database', ok: s.database.ping_ms >= 0, lines: [`${t('admin.system.ping')} ${s.database.ping_ms.toFixed(1)}ms`, `${t('admin.system.conns')} ${s.database.in_use}/${s.database.max_open_conns}`] },
    { key: 'redis', icon: 'memory', ok: s.redis.available || !s.redis.enabled, lines: [s.redis.enabled ? (s.redis.available ? t('admin.system.available') : t('admin.system.unavailable')) : t('common.disabled')] },
    { key: 'queue', icon: 'lists', ok: s.queue.available || !s.queue.enabled, lines: [s.queue.backend, `×${s.queue.concurrency}`] },
    { key: 'email', icon: 'mail', ok: s.email.configured, lines: [s.email.backend, s.email.configured ? t('admin.system.available') : t('admin.system.unavailable')] },
    { key: 'cache', icon: 'cached', ok: true, lines: [s.cache.backend, fmtBytes(s.cache.file_size_bytes)] },
    { key: 'lock', icon: 'lock', ok: s.lock.available || !s.lock.enabled, lines: [s.lock.backend || t('common.disabled')] },
  ]
})

// Rotate
const showRotate = ref(false)
const rotateDays = ref('90')
const rotateTables = ref<string[]>(['request_logs'])
const rotating = ref(false)
function toggleTable(tbl: string) {
  rotateTables.value = rotateTables.value.includes(tbl) ? rotateTables.value.filter((x) => x !== tbl) : [...rotateTables.value, tbl]
}
async function doRotate() {
  rotating.value = true
  try {
    await api.admin.system.rotateTables(rotateTables.value, Number(rotateDays.value))
    toast.show(t('admin.system.rotated'))
    showRotate.value = false
    await refresh()
  } catch (e) { toast.error(e) } finally { rotating.value = false }
}
const tableRows = computed(() => {
  const tb = tables.value
  if (!tb) return []
  return [
    { key: 'request_logs', size: tb.request_logs.total_size_bytes, rows: tb.request_logs.row_estimate, pending: tb.request_logs.pending_count },
    { key: 'peer_metrics', size: tb.peer_metrics.total_size_bytes, rows: tb.peer_metrics.row_estimate, pending: tb.peer_metrics.pending_count },
    { key: 'node_metrics', size: tb.node_metrics.total_size_bytes, rows: tb.node_metrics.row_estimate, pending: tb.node_metrics.pending_count },
  ]
})
</script>

<template>
  <div class="col gap-6">
    <PageHeader icon="monitor_heart" :title="t('admin.system.title')" :subtitle="t('admin.system.subtitle')">
      <template #action>
        <MdIconButton icon="refresh" :title="t('common.refresh')" @click="refresh()" />
      </template>
    </PageHeader>

    <div v-if="pending" class="col gap-3"><SkeletonBlock v-for="i in 4" :key="i" height="90px" radius="12px" /></div>

    <template v-else-if="sys">
      <!-- Build / process -->
      <section class="card card-elevated card-pad row gap-6 flex-wrap">
        <div><div class="md-label-medium txt-variant">{{ t('admin.system.version') }}</div><div class="md-title-medium mono">{{ sys.build.version || t('common.dash') }}</div></div>
        <div><div class="md-label-medium txt-variant">{{ t('admin.system.commit') }}</div><div class="md-title-medium mono">{{ sys.build.commit_hash.slice(0, 8) || t('common.dash') }}</div></div>
        <div><div class="md-label-medium txt-variant">{{ t('admin.system.goVersion') }}</div><div class="md-title-medium mono">{{ sys.build.go_version }}</div></div>
        <div><div class="md-label-medium txt-variant">{{ t('admin.system.uptime') }}</div><div class="md-title-medium">{{ fmtUptime(sys.process.uptime_secs) }}</div></div>
        <div><div class="md-label-medium txt-variant">{{ t('admin.system.connectedAgents') }}</div><div class="md-title-medium">{{ sys.hub.connected_agents }}</div></div>
      </section>

      <!-- Subsystems -->
      <section class="stats-grid">
        <div v-for="ss in subsystems" :key="ss.key" class="card card-elevated metric-tile">
          <div class="row space-between" :style="{ alignItems: 'flex-start' }">
            <div class="metric-label md-label-large"><MdSym :name="ss.icon" :size="18" /> {{ t(`admin.system.${ss.key}`) }}</div>
            <span class="status" :class="ss.ok ? 'status-success' : 'status-error'"><span class="dot" /></span>
          </div>
          <div class="md-body-medium" :style="{ marginTop: '8px' }">
            <div v-for="(l, i) in ss.lines" :key="i" class="mono md-body-small txt-variant">{{ l }}</div>
          </div>
        </div>
      </section>

      <!-- Requests + alerts -->
      <section class="metric-3">
        <div class="card card-elevated metric-tile">
          <div class="metric-label md-label-large"><MdSym name="bar_chart" :size="18" /> {{ t('admin.system.reqs5min') }}</div>
          <div class="metric-value md-headline-medium">{{ sys.request_log.last_5min_count }}</div>
          <div class="metric-sub md-body-small">{{ t('admin.system.p95') }} {{ sys.request_log.p95_duration_ms.toFixed(0) }}ms · {{ t('admin.system.errorRate') }} {{ sys.request_log.error_rate_5xx.toFixed(1) }}%</div>
        </div>
        <div class="card card-elevated metric-tile">
          <div class="metric-label md-label-large"><MdSym name="warning" :size="18" /> {{ t('admin.system.alerts') }}</div>
          <div class="metric-value md-headline-medium">{{ sys.alerts.latency_active + sys.alerts.bgp_fail + sys.alerts.node_offline }}</div>
          <div class="metric-sub md-body-small">BGP {{ sys.alerts.bgp_fail }} · {{ t('admin.nodes.offline') }} {{ sys.alerts.node_offline }}</div>
        </div>
        <div class="card card-elevated metric-tile">
          <div class="metric-label md-label-large"><MdSym name="hub" :size="18" /> {{ t('admin.system.hub') }}</div>
          <div class="metric-value md-headline-medium">{{ sys.hub.connected_agents }}</div>
          <div class="metric-sub md-body-small">{{ sys.hub.bot_connected ? t('admin.bot.connected') : t('admin.bot.disconnected') }}</div>
        </div>
      </section>

      <!-- DB tables -->
      <section v-if="tableRows.length" class="col gap-3">
        <div class="row space-between" :style="{ alignItems: 'center' }">
          <h2 class="md-title-large" :style="{ margin: 0 }">{{ t('admin.system.dbTables') }}</h2>
          <MdButton variant="tonal" icon="cleaning_services" @click="showRotate = true">{{ t('admin.system.rotate') }}</MdButton>
        </div>
        <div class="card card-elevated">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>{{ t('admin.settings.key') }}</th><th>{{ t('admin.system.size') }}</th><th>{{ t('admin.system.rows') }}</th><th>{{ t('admin.system.pending') }}</th></tr></thead>
              <tbody>
                <tr v-for="r in tableRows" :key="r.key">
                  <td class="mono">{{ r.key }}</td>
                  <td class="mono">{{ fmtBytes(r.size) }}</td>
                  <td class="mono">{{ r.rows.toLocaleString() }}</td>
                  <td class="mono">{{ r.pending.toLocaleString() }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>

    <MdDialog :open="showRotate" :title="t('admin.system.rotateTitle')" @update:open="showRotate = false">
      <p :style="{ margin: '0 0 12px' }">{{ t('admin.system.rotateBody') }}</p>
      <div class="row gap-2 flex-wrap" :style="{ marginBottom: '16px' }">
        <MdChip v-for="tbl in ['request_logs', 'peer_metrics', 'node_metrics']" :key="tbl" :selected="rotateTables.includes(tbl)" @click="toggleTable(tbl)">{{ tbl }}</MdChip>
      </div>
      <MdTextField :label="t('admin.system.retentionDays')" :model-value="rotateDays" inputmode="numeric" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (rotateDays = v.replace(/\D/g, ''))" />
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :disabled="!rotateTables.length || !rotateDays" :loading="rotating" @click="doRotate">{{ t('admin.system.rotate') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
