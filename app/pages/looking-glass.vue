<script setup lang="ts">
import type { LookingGlassType, LookingGlassResult } from '~/types/api'

definePageMeta({ middleware: 'auth', title: 'nav.lookingGlass' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const tfBg = 'var(--md-sys-color-surface-container-low)'

// Type-specific shapes of the polymorphic agent payload (LookingGlassResult.result).
// The backend passes the agent payload through verbatim; these mirror the
// per-type contracts (ping / traceroute / mtr / bgp_route) so the template can
// render each diagnostic richly instead of dumping raw JSON.
interface LgPing {
  resolved_ip?: string
  sent?: number
  received?: number
  loss_percent?: number
  min_rtt_ms?: number
  avg_rtt_ms?: number
  max_rtt_ms?: number
  rtts?: number[]
}
interface LgTraceHop { ttl: number, ip?: string, rtts?: number[] }
interface LgTrace { resolved_ip?: string, hops?: LgTraceHop[] }
interface LgMtr { resolved_ip?: string, report?: unknown, raw?: string }
interface LgBgp { output?: string }

const { data: nodes, pending: nodesPending } = await useAsyncData(
  'lg-nodes',
  () => api.nodes.listPublic().catch(() => []),
  { lazy: true, server: false },
)
const allNodes = computed(() => nodes.value ?? [])
const onlineNodes = computed(() => allNodes.value.filter(n => n.online))

const nodeId = ref('')
// Auto-select the first ONLINE node once the list resolves.
watchEffect(() => {
  if (!nodeId.value && onlineNodes.value.length) nodeId.value = onlineNodes.value[0]!.id
})

const type = ref<LookingGlassType>('ping')
const target = ref('')
const running = ref(false)
const error = ref('')
// Full response snapshot — the results header/body always reflect the query
// that produced them, regardless of later control changes.
const result = ref<LookingGlassResult | null>(null)

const typeOptions = computed(() => [
  { value: 'ping', label: t('lookingGlass.types.ping') },
  { value: 'traceroute', label: t('lookingGlass.types.traceroute') },
  { value: 'mtr', label: t('lookingGlass.types.mtr') },
  { value: 'bgp_route', label: t('lookingGlass.types.bgp_route') },
])
// List ALL nodes so offline ones stay visible; suffix offline labels. MdSelect
// cannot disable individual options, so selecting an offline node is allowed but
// surfaces the backend's node_offline error inline on run.
const nodeOptions = computed(() =>
  allNodes.value.map(n => ({
    value: n.id,
    label: n.online ? `${n.name} · ${n.location}` : `${n.name} · ${n.location} (${t('lookingGlass.offline')})`,
  })),
)

const targetSupport = computed(() =>
  type.value === 'bgp_route' ? t('lookingGlass.targetSupportBgp') : t('lookingGlass.targetSupport'),
)

const canRun = computed(() => !!nodeId.value && target.value.trim().length > 0)

// Typed views over the polymorphic result payload (empty until a run completes).
const ping = computed(() => (result.value?.result ?? {}) as LgPing)
const trace = computed(() => ((result.value?.result ?? {}) as LgTrace).hops ?? [])
const bgp = computed(() => (result.value?.result ?? {}) as LgBgp)
const mtrText = computed(() => {
  const r = (result.value?.result ?? {}) as LgMtr
  if (r.raw) return r.raw
  if (r.report != null) return JSON.stringify(r.report, null, 2)
  return t('lookingGlass.noOutput')
})
const resolvedIp = computed(() => {
  const r = (result.value?.result ?? {}) as { resolved_ip?: string }
  return r.resolved_ip || ''
})

// Plain-text rendering of the current result for the copy button.
const rawText = computed(() => {
  const r = result.value
  if (!r) return ''
  switch (r.type) {
    case 'ping':
      return (ping.value.rtts ?? []).map((v, i) => `seq ${i + 1}: ${v} ms`).join('\n')
    case 'traceroute':
      return trace.value
        .map(h => `${h.ttl}\t${h.ip || '*'}\t${(h.rtts?.length ? h.rtts.map(v => `${v} ms`).join('  ') : '*')}`)
        .join('\n')
    case 'mtr':
      return mtrText.value
    case 'bgp_route':
      return bgp.value.output || ''
    default:
      return JSON.stringify(r.result, null, 2)
  }
})

async function run() {
  if (!canRun.value || running.value) return
  // MdSelect can't disable individual options, so an offline node can be
  // selected — fail fast with a clear message instead of a backend round-trip.
  const selected = allNodes.value.find(n => n.id === nodeId.value)
  if (selected && !selected.online) {
    error.value = t('lookingGlass.nodeOffline')
    return
  }
  running.value = true
  error.value = ''
  result.value = null
  try {
    result.value = await api.lookingGlass.run({
      node_id: nodeId.value,
      type: type.value,
      target: target.value.trim(),
    })
  }
  catch (e) {
    const msg = (e as { message?: string })?.message || t('lookingGlass.failed')
    error.value = msg
    toast.error(e, t('lookingGlass.failed'))
  }
  finally {
    running.value = false
  }
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="travel_explore" :title="t('lookingGlass.title')" :subtitle="t('lookingGlass.subtitle')" />

    <div class="card card-elevated card-pad">
      <EmptyState v-if="!nodesPending && !allNodes.length" bare icon="dns" :body="t('lookingGlass.noNodes')" />
      <template v-else>
        <div class="params-2" :style="{ marginBottom: '18px' }">
          <MdSelect
            v-model="nodeId"
            :label="t('lookingGlass.node')"
            :options="nodeOptions"
            :tf-bg="tfBg"
          />
          <!-- keyup.enter bubbles from MdTextField's inner <input>; run() is
               re-entrancy-guarded so Enter can't double-submit. -->
          <div @keyup.enter="run">
            <MdTextField
              v-model="target"
              :label="t('lookingGlass.target')"
              mono
              icon="my_location"
              :tf-bg="tfBg"
              :supporting="targetSupport"
            />
          </div>
        </div>

        <div class="row space-between flex-wrap gap-4">
          <MdSegmented v-model="type" :options="typeOptions" />
          <MdButton
            variant="filled"
            :icon="running ? 'progress_activity' : 'play_arrow'"
            :loading="running"
            :disabled="!canRun"
            @click="run"
          >
            {{ running ? t('common.running') : t('common.run') }}
          </MdButton>
        </div>

        <div
          v-if="error"
          class="row gap-2 md-body-small"
          :style="{
            marginTop: '16px', padding: '10px 14px', borderRadius: 'var(--md-shape-md)',
            background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)',
            alignItems: 'flex-start',
          }"
        >
          <MdSym name="error" :size="18" :style="{ flexShrink: 0, marginTop: '1px' }" />
          <span>{{ error }}</span>
        </div>
      </template>
    </div>

    <!-- Results: shown while running and after a result arrives. -->
    <div v-if="running || result" class="card card-elevated">
      <div
        class="row gap-3 flex-wrap"
        :style="{ padding: '14px 20px', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }"
      >
        <MdSym name="terminal" class="txt-variant" />
        <span class="md-title-small">{{ t('lookingGlass.results') }}</span>
        <span v-if="result" class="md-body-small mono ml-auto txt-variant">
          {{ result.type }} · {{ result.node_name }} &rarr; {{ result.target }}<template v-if="resolvedIp && resolvedIp !== result.target"> ({{ resolvedIp }})</template>
        </span>
        <MdCopyButton v-if="result" :value="rawText" />
      </div>

      <!-- Running placeholder -->
      <div v-if="running" class="md-body-medium txt-variant text-center" :style="{ padding: '40px 0' }">
        {{ t('common.running') }}
      </div>

      <template v-else-if="result">
        <!-- Ping -->
        <template v-if="result.type === 'ping'">
          <div class="card-pad" :style="{ paddingBottom: '0' }">
            <div class="stats-grid">
              <div class="card metric-tile" :style="{ background: 'var(--md-sys-color-surface-container-low)' }">
                <div class="metric-label md-label-large">{{ t('lookingGlass.packets') }}</div>
                <div class="metric-value md-headline-small" :style="{ marginTop: '8px' }">{{ ping.received ?? 0 }}/{{ ping.sent ?? 0 }}</div>
              </div>
              <div class="card metric-tile" :style="{ background: 'var(--md-sys-color-surface-container-low)' }">
                <div class="metric-label md-label-large">{{ t('lookingGlass.loss') }}</div>
                <div class="metric-value md-headline-small" :style="{ marginTop: '8px' }">{{ ping.loss_percent ?? 0 }}%</div>
              </div>
              <div class="card metric-tile" :style="{ background: 'var(--md-sys-color-surface-container-low)' }">
                <div class="metric-label md-label-large">{{ t('lookingGlass.avgRtt') }}</div>
                <div class="metric-value md-headline-small" :style="{ marginTop: '8px' }">{{ ping.avg_rtt_ms ?? 0 }} {{ t('common.ms') }}</div>
              </div>
              <div class="card metric-tile" :style="{ background: 'var(--md-sys-color-surface-container-low)' }">
                <div class="metric-label md-label-large">{{ t('lookingGlass.minMaxRtt') }}</div>
                <div class="metric-value md-headline-small" :style="{ marginTop: '8px' }">{{ ping.min_rtt_ms ?? 0 }} / {{ ping.max_rtt_ms ?? 0 }}</div>
              </div>
            </div>
          </div>
          <pre class="code-block" :style="{ margin: '20px', maxHeight: '360px' }">{{ (ping.rtts ?? []).map((v, i) => `seq ${i + 1}: ${v} ms`).join('\n') || t('lookingGlass.noReplies') }}</pre>
        </template>

        <!-- Traceroute -->
        <template v-else-if="result.type === 'traceroute'">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>{{ t('lookingGlass.hop') }}</th>
                  <th>{{ t('lookingGlass.address') }}</th>
                  <th>{{ t('lookingGlass.rttMs') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="h in trace" :key="h.ttl">
                  <td>{{ h.ttl }}</td>
                  <td class="mono">{{ h.ip || '*' }}</td>
                  <td class="mono">{{ h.rtts && h.rtts.length ? h.rtts.map(v => `${v} ms`).join('  ') : '*' }}</td>
                </tr>
                <tr v-if="!trace.length">
                  <td colspan="3" class="txt-variant text-center">{{ t('lookingGlass.noOutput') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <!-- MTR -->
        <template v-else-if="result.type === 'mtr'">
          <pre class="code-block" :style="{ margin: '20px', maxHeight: '420px' }">{{ mtrText }}</pre>
        </template>

        <!-- BGP route -->
        <template v-else-if="result.type === 'bgp_route'">
          <pre class="code-block" :style="{ margin: '20px', maxHeight: '420px' }">{{ bgp.output || t('lookingGlass.noRoutes') }}</pre>
        </template>
      </template>
    </div>
  </div>
</template>
