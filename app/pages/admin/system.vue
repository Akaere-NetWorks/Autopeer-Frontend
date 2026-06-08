<script setup lang="ts">
import type { SystemStatus, DBTablesResponse } from '~/types/admin'

definePageMeta({ middleware: 'admin', title: 'nav.admin.system' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const { fmtBytes, fmtUptime, fmtDate } = useFormat()

// The center system-status response carries `active_alerts` and `bucket_keys`
// inside `cache` (see center diff/add/docs/api/admin-ops.md), but the shared
// SystemStatus type only declares the bucket COUNT map. Augment locally so the
// cache key browser can read the per-key entries the backend already returns.
interface CacheKeyEntry { key: string, expires_at?: number, expired?: boolean }
interface CacheActiveAlert { type: string, target: string }
type CacheExt = SystemStatus['cache'] & {
  active_alerts?: CacheActiveAlert[]
  bucket_keys?: Record<string, CacheKeyEntry[]>
}

const { data: sys, pending, refresh: refreshSys } = await useAsyncData(
  'admin-system',
  () => api.admin.system.status(),
  { lazy: true, server: false },
)

// ── DB tables ────────────────────────────────────────────────────────────────
const tablesDays = ref(30)
const tablesError = ref('')
const { data: tables, pending: tablesPending, refresh: refreshTablesRaw } = await useAsyncData(
  'admin-db-tables',
  async () => {
    tablesError.value = ''
    try {
      return await api.admin.system.dbTables(tablesDays.value)
    }
    catch (e) {
      tablesError.value = e instanceof Error ? e.message : String(e)
      throw e
    }
  },
  { lazy: true, server: false },
)

async function refreshAll() {
  await Promise.all([refreshSys(), refreshTablesRaw().catch(() => {})])
}

// ── View switch ──────────────────────────────────────────────────────────────
const view = ref<'status' | 'cache' | 'tables'>('status')
const viewOptions = computed(() => [
  { value: 'status', label: t('admin.system.viewStatus'), icon: 'monitor_heart' },
  { value: 'cache', label: t('admin.system.viewCache'), icon: 'database' },
  { value: 'tables', label: t('admin.system.viewTables'), icon: 'table' },
])

// ── Status helpers ───────────────────────────────────────────────────────────
const totalAlerts = computed(() => {
  const a = sys.value?.alerts
  if (!a) return 0
  return a.bgp_down + a.bgp_fail + a.handshake_stale + a.node_offline + a.latency_high + a.latency_active
})

const subsystems = computed(() => {
  const s = sys.value
  if (!s) return []
  return [
    { key: 'database', icon: 'database', ok: s.database.ping_ms >= 0, lines: [`${t('admin.system.ping')} ${s.database.ping_ms.toFixed(1)}ms`, `${t('admin.system.conns')} ${s.database.in_use}/${s.database.max_open_conns || '∞'}`] },
    { key: 'redis', icon: 'memory', ok: s.redis.available || !s.redis.enabled, lines: [s.redis.enabled ? (s.redis.available ? t('admin.system.available') : t('admin.system.unavailable')) : t('common.disabled')] },
    { key: 'queue', icon: 'lists', ok: s.queue.available || !s.queue.enabled, lines: [s.queue.backend, `×${s.queue.concurrency}`] },
    { key: 'email', icon: 'mail', ok: s.email.configured, lines: [s.email.backend, s.email.configured ? t('admin.system.available') : t('admin.system.unavailable')] },
    { key: 'cache', icon: 'cached', ok: true, lines: [s.cache.backend, fmtBytes(s.cache.file_size_bytes)] },
    { key: 'lock', icon: 'lock', ok: s.lock.available || !s.lock.enabled, lines: [s.lock.backend || t('common.disabled')] },
  ]
})

const showMigrations = ref(false)
const migrations = computed(() => sys.value?.database.migrations ?? [])
const redisError = computed(() => sys.value?.redis.last_error || sys.value?.cache.redis_last_error || '')

const queueRows = computed(() => Object.entries(sys.value?.queue.queues ?? {}).map(([name, weight]) => ({ name, weight })))
const pendingCommands = computed(() => Object.entries(sys.value?.hub.pending_commands ?? {}).map(([node, count]) => ({ node, count })))

// ── Cache key browser ────────────────────────────────────────────────────────
const cacheTab = ref<'overview' | 'alerts' | 'registry' | 'rate_limit' | 'settings'>('overview')
const cache = computed(() => sys.value?.cache as CacheExt | undefined)
const bucketKeys = computed(() => cache.value?.bucket_keys ?? {})
const bucketCounts = computed(() => cache.value?.buckets ?? {})
function bucketCount(name: string): number {
  return bucketKeys.value[name]?.length ?? 0
}
const cacheBuckets = computed(() => Object.entries(bucketCounts.value).map(([bucket, count]) => ({ bucket, count })))
const cacheTabs = computed(() => [
  { value: 'overview', label: t('admin.system.cacheOverview') },
  { value: 'alerts', label: `${t('admin.system.cacheAlerts')} (${bucketCount('alerts')})` },
  { value: 'registry', label: `${t('admin.system.cacheRegistry')} (${bucketCount('registry')})` },
  { value: 'rate_limit', label: `${t('admin.system.cacheRateLimit')} (${bucketCount('rate_limit')})` },
  { value: 'settings', label: `${t('admin.system.cacheSettings')} (${bucketCount('settings')})` },
])

const redisLabel = computed(() => {
  const c = cache.value
  if (!c?.backend) return t('common.dash')
  if (c.backend !== 'redis') return t('admin.system.notInUse')
  return c.redis_available ? t('admin.system.available') : t('admin.system.unavailable')
})
const redisOk = computed(() => {
  const c = cache.value
  return !c || c.backend !== 'redis' ? null : c.redis_available
})

interface RegistryEntry extends CacheKeyEntry { suffix: string, dot: string }
const registryGroups = computed(() => {
  const keys = bucketKeys.value.registry ?? []
  const asn: RegistryEntry[] = []
  const gpg: RegistryEntry[] = []
  const gpgPubkey: RegistryEntry[] = []
  for (const e of keys) {
    if (e.key.startsWith('r:gpg:pubkey:')) gpgPubkey.push({ ...e, suffix: e.key.slice('r:gpg:pubkey:'.length), dot: '#6366f1' })
    else if (e.key.startsWith('r:gpg:')) gpg.push({ ...e, suffix: e.key.slice('r:gpg:'.length), dot: '#06b6d4' })
    else if (e.key.startsWith('r:asn:')) asn.push({ ...e, suffix: e.key.slice('r:asn:'.length), dot: '#3b82f6' })
    else asn.push({ ...e, suffix: e.key, dot: '#3b82f6' })
  }
  return { asn, gpg, gpgPubkey }
})

function fmtUnix(unix?: number): string {
  if (!unix) return t('common.dash')
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(unix * 1000))
}

// ── DB tables: rotation preview + per-table selection ────────────────────────
const TABLE_NAMES = ['request_logs', 'peer_metrics', 'node_metrics'] as const
type TableName = typeof TABLE_NAMES[number]

const tableRows = computed(() => {
  const tb = tables.value
  if (!tb) return []
  return TABLE_NAMES.map(name => ({
    key: name,
    size: tb[name].total_size_bytes,
    rows: tb[name].row_estimate,
    pending: tb[name].pending_count,
  }))
})

const compressionRatio = computed(() => {
  const pm = tables.value?.peer_metrics
  if (!pm || pm.before_compression_bytes === 0 || pm.after_compression_bytes === 0) return ''
  return `${(pm.before_compression_bytes / pm.after_compression_bytes).toFixed(1)}:1`
})

// Preview: re-fetch pending counts for a chosen retention window.
const rotateDays = ref(30)
const previewData = ref<DBTablesResponse | null>(null)
const previewing = ref(false)
const selected = ref<TableName[]>([])

const selectableCount = computed(() => {
  const p = previewData.value
  if (!p) return 0
  return TABLE_NAMES.filter(n => p[n].pending_count > 0).length
})
const allSelected = computed(() => selectableCount.value > 0 && selected.value.length === selectableCount.value)
const someSelected = computed(() => selected.value.length > 0 && !allSelected.value)

async function previewRotation() {
  if (!rotateDays.value || rotateDays.value < 1) return
  previewing.value = true
  try {
    const data = await api.admin.system.dbTables(rotateDays.value)
    previewData.value = data
    selected.value = TABLE_NAMES.filter(n => data[n].pending_count > 0)
  }
  catch (e) { toast.error(e) }
  finally { previewing.value = false }
}

function toggleTable(name: TableName, pending: number) {
  if (pending === 0) return
  selected.value = selected.value.includes(name)
    ? selected.value.filter(x => x !== name)
    : [...selected.value, name]
}
function toggleAll() {
  const p = previewData.value
  if (!p) return
  selected.value = allSelected.value ? [] : TABLE_NAMES.filter(n => p[n].pending_count > 0)
}
function pendingLabel(name: TableName, count: number): string {
  if (count <= 0) return '0'
  return name === 'request_logs'
    ? t('admin.system.pendingRows', { n: count.toLocaleString() })
    : t('admin.system.pendingChunks', { n: count })
}

// ── Rotate (confirm dialog + per-table results) ──────────────────────────────
const showRotate = ref(false)
const rotating = ref(false)
const rotateResults = ref<Record<string, { deleted_count?: number, dropped_chunks?: number, error?: string }> | null>(null)
const hadRotateError = computed(() => Object.values(rotateResults.value ?? {}).some(r => r.error))

async function doRotate() {
  if (!selected.value.length) return
  rotating.value = true
  try {
    const res = await api.admin.system.rotateTables([...selected.value], rotateDays.value)
    rotateResults.value = res.results
    showRotate.value = false
    previewData.value = null
    selected.value = []
    // Refresh the live table sizes/rows against the rotation window.
    tablesDays.value = rotateDays.value
    await refreshTablesRaw().catch((e) => { tablesError.value = e instanceof Error ? e.message : String(e) })
    if (Object.values(res.results).some(r => r.error)) toast.show(t('admin.system.rotatedPartial'), { kind: 'error' })
    else toast.show(t('admin.system.rotated'))
  }
  catch (e) { toast.error(e); showRotate.value = false }
  finally { rotating.value = false }
}
</script>

<template>
  <div class="col gap-6">
    <PageHeader icon="monitor_heart" :title="t('admin.system.title')" :subtitle="t('admin.system.subtitle')">
      <template #action>
        <MdIconButton icon="refresh" :title="t('common.refresh')" :loading="pending || tablesPending" @click="refreshAll()" />
      </template>
    </PageHeader>

    <MdSegmented v-model="view" :options="viewOptions" />

    <div v-if="sys === null" class="col gap-3">
      <SkeletonBlock v-for="i in 4" :key="i" height="90px" radius="12px" />
    </div>

    <!-- ══════════════ STATUS ══════════════ -->
    <template v-else-if="sys && view === 'status'">
      <!-- Build / process -->
      <section class="card card-elevated card-pad col gap-4">
        <div class="row gap-6 flex-wrap">
          <div><div class="md-label-medium txt-variant">{{ t('admin.system.version') }}</div><div class="md-title-medium mono">{{ sys.build.version || t('common.dash') }}</div></div>
          <div>
            <div class="md-label-medium txt-variant">{{ t('admin.system.commit') }}</div>
            <div class="row gap-1" :style="{ alignItems: 'center' }">
              <span class="md-title-medium mono">{{ sys.build.commit_hash.slice(0, 8) || t('common.dash') }}</span>
              <MdCopyButton v-if="sys.build.commit_hash" :value="sys.build.commit_hash" :size="28" silent />
            </div>
          </div>
          <div><div class="md-label-medium txt-variant">{{ t('admin.system.goVersion') }}</div><div class="md-title-medium mono">{{ sys.build.go_version }}</div></div>
          <div><div class="md-label-medium txt-variant">{{ t('admin.system.buildDate') }}</div><div class="md-title-medium">{{ sys.build.build_date || t('common.dash') }}</div></div>
          <div><div class="md-label-medium txt-variant">{{ t('admin.system.uptime') }}</div><div class="md-title-medium">{{ fmtUptime(sys.process.uptime_secs) }}</div></div>
          <div><div class="md-label-medium txt-variant">{{ t('admin.system.connectedAgents') }}</div><div class="md-title-medium">{{ sys.hub.connected_agents }}</div></div>
        </div>
        <div v-if="sys.process.center_public_key" :style="{ borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '12px' }">
          <div class="md-label-medium txt-variant">{{ t('admin.system.centerPubkey') }}</div>
          <div class="row gap-2" :style="{ alignItems: 'center' }">
            <code class="md-body-small mono" :style="{ wordBreak: 'break-all', flex: 1 }">{{ sys.process.center_public_key }}</code>
            <MdCopyButton :value="sys.process.center_public_key" :size="28" />
          </div>
        </div>
      </section>

      <div v-if="redisError" class="card card-outlined card-pad row gap-2" :style="{ alignItems: 'center', color: 'var(--md-sys-color-error)' }">
        <MdSym name="warning" :size="18" /> <span class="md-body-medium">{{ redisError }}</span>
      </div>

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

      <!-- Requests + alerts + hub -->
      <section class="metric-3">
        <div class="card card-elevated metric-tile">
          <div class="metric-label md-label-large"><MdSym name="bar_chart" :size="18" /> {{ t('admin.system.reqs5min') }}</div>
          <div class="metric-value md-headline-medium">{{ sys.request_log.last_5min_count }}</div>
          <div class="metric-sub md-body-small">{{ t('admin.system.p95') }} {{ sys.request_log.p95_duration_ms.toFixed(0) }}ms · {{ t('admin.system.errorRate') }} {{ sys.request_log.error_rate_5xx.toFixed(1) }}%</div>
        </div>
        <div class="card card-elevated metric-tile">
          <div class="metric-label md-label-large"><MdSym name="warning" :size="18" /> {{ t('admin.system.alerts') }}</div>
          <div class="metric-value md-headline-medium" :style="totalAlerts > 0 ? { color: 'var(--md-sys-color-error)' } : undefined">{{ totalAlerts }}</div>
          <div class="metric-sub md-body-small">BGP {{ sys.alerts.bgp_fail }} · {{ t('admin.nodes.offline') }} {{ sys.alerts.node_offline }}</div>
        </div>
        <div class="card card-elevated metric-tile">
          <div class="metric-label md-label-large"><MdSym name="hub" :size="18" /> {{ t('admin.system.hub') }}</div>
          <div class="metric-value md-headline-medium">{{ sys.hub.connected_agents }}</div>
          <div class="metric-sub md-body-small">{{ sys.hub.bot_connected ? t('admin.bot.connected') : t('admin.bot.disconnected') }}<template v-if="sys.hub.pending_auth_count"> · {{ t('admin.system.pendingAuth') }} {{ sys.hub.pending_auth_count }}</template></div>
        </div>
      </section>

      <!-- Database detail / migrations -->
      <section class="card card-elevated card-pad col gap-3">
        <h2 class="md-title-medium" :style="{ margin: 0 }">{{ t('admin.system.database') }}</h2>
        <div class="row gap-6 flex-wrap">
          <div><div class="md-label-medium txt-variant">{{ t('admin.system.conns') }}</div><div class="md-title-medium mono">{{ sys.database.in_use }} / {{ sys.database.max_open_conns || '∞' }}</div></div>
          <div><div class="md-label-medium txt-variant">{{ t('admin.system.idle') }}</div><div class="md-title-medium mono">{{ sys.database.idle }}</div></div>
          <div><div class="md-label-medium txt-variant">{{ t('admin.system.waitCount') }}</div><div class="md-title-medium mono">{{ sys.database.wait_count }}</div></div>
        </div>
        <button v-ripple type="button" class="btn btn-text" :style="{ alignSelf: 'flex-start' }" @click="showMigrations = !showMigrations">
          <MdSym :name="showMigrations ? 'expand_less' : 'expand_more'" :size="18" />
          {{ t('admin.system.migrations') }} ({{ sys.database.migration_count }})
        </button>
        <div v-if="showMigrations && migrations.length" class="table-wrap" :style="{ maxHeight: '260px', overflowY: 'auto' }">
          <table class="data-table">
            <thead><tr><th>{{ t('admin.system.version') }}</th><th>{{ t('admin.system.appliedAt') }}</th></tr></thead>
            <tbody>
              <tr v-for="m in migrations" :key="m.version">
                <td class="mono">{{ m.version }}</td>
                <td>{{ fmtDate(m.applied_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Queue / lock / email -->
      <section class="metric-3">
        <div class="card card-elevated card-pad col gap-3">
          <h2 class="md-title-medium" :style="{ margin: 0 }">{{ t('admin.system.queue') }}</h2>
          <div class="row gap-4 flex-wrap">
            <div><div class="md-label-medium txt-variant">{{ t('admin.system.backend') }}</div><div class="md-body-medium mono">{{ sys.queue.backend }}</div></div>
            <div><div class="md-label-medium txt-variant">{{ t('admin.system.concurrency') }}</div><div class="md-body-medium mono">{{ sys.queue.concurrency }}</div></div>
          </div>
          <div v-if="queueRows.length" class="col gap-1">
            <div v-for="q in queueRows" :key="q.name" class="row space-between md-body-small mono txt-variant"><span>{{ q.name }}</span><span>×{{ q.weight }}</span></div>
          </div>
        </div>
        <div class="card card-elevated card-pad col gap-3">
          <h2 class="md-title-medium" :style="{ margin: 0 }">{{ t('admin.system.lock') }}</h2>
          <div><div class="md-label-medium txt-variant">{{ t('admin.system.backend') }}</div><div class="md-body-medium mono">{{ sys.lock.backend || t('common.disabled') }}</div></div>
          <span class="status" :class="(sys.lock.available || !sys.lock.enabled) ? 'status-success' : 'status-error'" :style="{ alignSelf: 'flex-start' }"><span class="dot" /> {{ sys.lock.enabled ? (sys.lock.available ? t('admin.system.available') : t('admin.system.unavailable')) : t('common.disabled') }}</span>
        </div>
        <div class="card card-elevated card-pad col gap-3">
          <h2 class="md-title-medium" :style="{ margin: 0 }">{{ t('admin.system.email') }}</h2>
          <div><div class="md-label-medium txt-variant">{{ t('admin.system.backend') }}</div><div class="md-body-medium mono">{{ sys.email.backend }}</div></div>
          <div v-if="sys.email.host"><div class="md-label-medium txt-variant">{{ t('admin.system.smtpHost') }}</div><div class="md-body-small mono">{{ sys.email.host }}</div></div>
          <span class="status" :class="sys.email.configured ? 'status-success' : 'status-neutral'" :style="{ alignSelf: 'flex-start' }"><span class="dot" /> {{ sys.email.configured ? t('admin.system.configured') : t('admin.system.notConfigured') }}</span>
        </div>
      </section>

      <!-- Pending agent commands -->
      <section v-if="pendingCommands.length" class="card card-elevated card-pad col gap-2">
        <h2 class="md-title-medium" :style="{ margin: 0 }">{{ t('admin.system.pendingCommands') }}</h2>
        <div v-for="pc in pendingCommands" :key="pc.node" class="row space-between md-body-small mono txt-variant"><span>{{ pc.node }}</span><span>{{ pc.count }}</span></div>
      </section>
    </template>

    <!-- ══════════════ CACHE ══════════════ -->
    <template v-else-if="sys && view === 'cache'">
      <MdSegmented :model-value="cacheTab" :options="cacheTabs" role="tablist" @update:model-value="(v: string) => (cacheTab = v as typeof cacheTab)" />

      <!-- Overview -->
      <template v-if="cacheTab === 'overview'">
        <section class="stats-grid">
          <div class="card card-elevated metric-tile">
            <div class="metric-label md-label-large">{{ t('admin.system.cacheBackend') }}</div>
            <div class="metric-value md-title-large mono">{{ cache?.backend || t('common.dash') }}</div>
          </div>
          <div class="card card-elevated metric-tile">
            <div class="metric-label md-label-large">{{ t('admin.system.redisStatus') }}</div>
            <div class="metric-value md-title-large row gap-2" :style="{ alignItems: 'center', color: redisOk === null ? undefined : (redisOk ? 'var(--md-sys-color-success)' : 'var(--md-sys-color-error)') }">
              <span class="status" :class="redisOk === null ? 'status-neutral' : (redisOk ? 'status-success' : 'status-error')"><span class="dot" /></span>{{ redisLabel }}
            </div>
          </div>
          <div class="card card-elevated metric-tile">
            <div class="metric-label md-label-large">{{ t('admin.system.cacheFallback') }}</div>
            <div class="metric-value md-title-large">{{ cache?.fallback_enabled ? t('common.enabled') : t('common.disabled') }}</div>
          </div>
          <div class="card card-elevated metric-tile">
            <div class="metric-label md-label-large">{{ t('admin.system.cacheFileSize') }}</div>
            <div class="metric-value md-title-large mono">{{ fmtBytes(cache?.file_size_bytes) }}</div>
          </div>
        </section>
        <div v-if="cache?.redis_last_error" class="card card-outlined card-pad row gap-2" :style="{ alignItems: 'center', color: 'var(--md-sys-color-error)' }">
          <MdSym name="warning" :size="18" /> <span class="md-body-medium">{{ cache.redis_last_error }}</span>
        </div>
        <div class="card card-elevated">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>{{ t('admin.system.bucket') }}</th><th>{{ t('admin.system.entries') }}</th></tr></thead>
              <tbody>
                <tr v-for="b in cacheBuckets" :key="b.bucket"><td class="mono">{{ b.bucket }}</td><td class="mono">{{ b.count }}</td></tr>
                <tr v-if="!cacheBuckets.length"><td colspan="2" class="txt-variant">{{ t('admin.system.cacheNoKeys') }}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- Flat bucket key lists (alerts / rate_limit / settings) -->
      <template v-else-if="cacheTab === 'alerts' || cacheTab === 'rate_limit' || cacheTab === 'settings'">
        <div class="card card-elevated">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>{{ t('admin.system.cacheKey') }}</th><th>{{ t('admin.system.cacheExpires') }}</th></tr></thead>
              <tbody>
                <tr v-for="entry in (bucketKeys[cacheTab] ?? [])" :key="entry.key">
                  <td>
                    <span class="row gap-2" :style="{ alignItems: 'center' }">
                      <span :style="{ width: '8px', height: '8px', borderRadius: '50%', background: entry.expired ? 'var(--md-sys-color-outline)' : 'var(--md-sys-color-primary)' }" />
                      <span class="mono">{{ entry.key }}</span>
                    </span>
                  </td>
                  <td class="md-body-small" :style="entry.expired ? { color: 'var(--md-sys-color-on-surface-variant)' } : undefined">
                    {{ entry.expired ? t('admin.system.cacheExpired') : (entry.expires_at ? fmtUnix(entry.expires_at) : t('common.dash')) }}
                  </td>
                </tr>
                <tr v-if="!(bucketKeys[cacheTab] ?? []).length"><td colspan="2" class="txt-variant">{{ t('admin.system.cacheNoKeys') }}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- Registry (classified) -->
      <template v-else>
        <div v-for="grp in [
          { title: t('admin.system.regAsn'), entries: registryGroups.asn, head: t('admin.system.asn') },
          { title: t('admin.system.regGpg'), entries: registryGroups.gpg, head: t('admin.system.asn') },
          { title: t('admin.system.regGpgPubkey'), entries: registryGroups.gpgPubkey, head: t('admin.system.fingerprint') },
        ]" :key="grp.title" class="card card-elevated card-pad col gap-2">
          <div class="row space-between" :style="{ alignItems: 'center' }">
            <h2 class="md-title-medium" :style="{ margin: 0 }">{{ grp.title }}</h2>
            <span class="md-body-small txt-variant">{{ grp.entries.length }}</span>
          </div>
          <div v-if="grp.entries.length" class="table-wrap">
            <table class="data-table">
              <thead><tr><th>{{ grp.head }}</th><th>{{ t('admin.system.cacheExpires') }}</th></tr></thead>
              <tbody>
                <tr v-for="entry in grp.entries" :key="entry.key">
                  <td>
                    <span class="row gap-2" :style="{ alignItems: 'center' }">
                      <span :style="{ width: '8px', height: '8px', borderRadius: '50%', background: entry.expired ? 'var(--md-sys-color-outline)' : entry.dot }" />
                      <span class="mono">{{ entry.suffix }}</span>
                    </span>
                  </td>
                  <td class="md-body-small" :style="entry.expired ? { color: 'var(--md-sys-color-on-surface-variant)' } : undefined">
                    {{ entry.expired ? t('admin.system.cacheExpired') : (entry.expires_at ? fmtUnix(entry.expires_at) : t('common.dash')) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="md-body-small txt-variant" :style="{ margin: 0 }">{{ t('admin.system.cacheNoKeys') }}</p>
        </div>
      </template>
    </template>

    <!-- ══════════════ DB TABLES ══════════════ -->
    <template v-else-if="view === 'tables'">
      <div v-if="tablesError" class="card card-outlined card-pad row gap-2" :style="{ alignItems: 'center', color: 'var(--md-sys-color-error)' }">
        <MdSym name="warning" :size="18" /> <span class="md-body-medium">{{ tablesError }}</span>
      </div>

      <!-- Per-table rotate results -->
      <div v-if="rotateResults" class="card card-outlined card-pad col gap-2" :style="{ borderColor: hadRotateError ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-outline-variant)' }">
        <div class="row gap-2" :style="{ alignItems: 'center' }">
          <MdSym :name="hadRotateError ? 'warning' : 'check_circle'" :size="18" :style="{ color: hadRotateError ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-success)' }" />
          <span class="md-title-small">{{ t('admin.system.rotateResults') }}</span>
        </div>
        <div v-for="(res, tbl) in rotateResults" :key="tbl" class="md-body-small mono">
          <span class="txt-variant">{{ tbl }}</span>:
          <span v-if="res.error" :style="{ color: 'var(--md-sys-color-error)' }">{{ res.error }}</span>
          <span v-else-if="res.deleted_count !== undefined">{{ t('admin.system.rotateSuccess', { count: res.deleted_count.toLocaleString() }) }}</span>
          <span v-else-if="res.dropped_chunks !== undefined">{{ t('admin.system.droppedChunks', { n: res.dropped_chunks }) }}</span>
        </div>
      </div>

      <div v-if="tablesPending && !tables" class="col gap-3"><SkeletonBlock v-for="i in 2" :key="i" height="160px" radius="12px" /></div>

      <template v-else-if="tables">
        <!-- Current sizes -->
        <section class="col gap-3">
          <h2 class="md-title-large" :style="{ margin: 0 }">{{ t('admin.system.dbTables') }}</h2>
          <div class="card card-elevated">
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>{{ t('admin.system.table') }}</th><th>{{ t('admin.system.size') }}</th><th>{{ t('admin.system.rows') }}</th><th>{{ t('admin.system.compression') }}</th></tr></thead>
                <tbody>
                  <tr v-for="r in tableRows" :key="r.key">
                    <td class="mono">{{ r.key }}</td>
                    <td class="mono">{{ fmtBytes(r.size) }}</td>
                    <td class="mono">{{ r.rows.toLocaleString() }}</td>
                    <td class="mono txt-variant">
                      <template v-if="r.key === 'peer_metrics' && tables.peer_metrics.total_chunks > 0">
                        {{ tables.peer_metrics.number_compressed_chunks }}/{{ tables.peer_metrics.total_chunks }}<span v-if="compressionRatio"> ({{ compressionRatio }})</span>
                      </template>
                      <template v-else>{{ t('common.dash') }}</template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- Rotation preview -->
        <section class="card card-elevated card-pad col gap-4">
          <h2 class="md-title-large" :style="{ margin: 0 }">{{ t('admin.system.rotation') }}</h2>
          <p class="md-body-medium txt-variant" :style="{ margin: 0 }">{{ t('admin.system.rotateBody') }}</p>
          <div class="row gap-3 flex-wrap" :style="{ alignItems: 'flex-end' }">
            <MdTextField
              :label="t('admin.system.retentionDays')" :model-value="String(rotateDays)" inputmode="numeric" mono
              tf-bg="var(--md-sys-color-surface-container-high)" :style="{ maxWidth: '160px' }"
              @update:model-value="(v: string) => (rotateDays = Number(v.replace(/\D/g, '')) || 0)"
            />
            <MdButton variant="tonal" icon="search" :loading="previewing" :disabled="!rotateDays || rotateDays < 1" @click="previewRotation">{{ t('admin.system.previewBtn') }}</MdButton>
          </div>

          <div v-if="previewData" class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th :style="{ width: '44px' }">
                    <input type="checkbox" :checked="allSelected" :indeterminate.prop="someSelected" :disabled="!selectableCount" :style="{ accentColor: 'var(--md-sys-color-primary)' }" @change="toggleAll">
                  </th>
                  <th>{{ t('admin.system.table') }}</th>
                  <th>{{ t('admin.system.pendingRotation') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="name in TABLE_NAMES" :key="name">
                  <td>
                    <input
                      type="checkbox" :checked="selected.includes(name)" :disabled="previewData[name].pending_count === 0"
                      :style="{ accentColor: 'var(--md-sys-color-primary)' }" @change="toggleTable(name, previewData[name].pending_count)"
                    >
                  </td>
                  <td class="mono">{{ name }}</td>
                  <td class="mono">{{ pendingLabel(name, previewData[name].pending_count) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="md-body-small txt-variant" :style="{ margin: 0 }">{{ t('admin.system.pendingUnknown') }}</p>

          <div class="row gap-2">
            <MdButton variant="filled" icon="cleaning_services" :disabled="!selected.length || rotating" @click="showRotate = true">
              {{ t('admin.system.rotateSelected', { n: selected.length }) }}
            </MdButton>
          </div>
        </section>
      </template>

      <div v-else class="card card-outlined card-pad text-center txt-variant">{{ t('admin.system.refreshToLoad') }}</div>
    </template>

    <!-- Rotate confirm dialog -->
    <MdDialog :open="showRotate" :title="t('admin.system.rotateTitle')" :submitting="rotating" @update:open="showRotate = false">
      <p :style="{ margin: 0 }">{{ t('admin.system.rotateConfirm', { days: rotateDays, tables: selected.join(', ') }) }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="rotating" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="rotating" @click="doRotate">{{ t('admin.system.forceRotate') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
