<script setup lang="ts">
import type { AssistantTool } from '~/types/admin'

definePageMeta({ middleware: 'auth', title: 'nav.assistant' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()

const { data: auth, error: authError } = await useAsyncData('assistant-auth', () => api.assistant.auth(), { lazy: true, server: false })
const available = computed(() => !authError.value && auth.value?.ok)

const tools: { value: AssistantTool, label: string, needsId?: boolean, needsHours?: boolean }[] = [
  { value: 'nodes_list', label: 'nodes_list' },
  { value: 'peer_creation_status', label: 'peer_creation_status' },
  { value: 'peer_list', label: 'peer_list' },
  { value: 'peer_summary', label: 'peer_summary' },
  { value: 'peer_get', label: 'peer_get', needsId: true },
  { value: 'peer_get_metrics', label: 'peer_get_metrics', needsId: true, needsHours: true },
]
const tool = ref<AssistantTool>('nodes_list')
const current = computed(() => tools.find((x) => x.value === tool.value)!)
const peerId = ref('')
const hours = ref('24')
const running = ref(false)

// `hasResult` tracks whether a call COMPLETED (so an empty/null payload still
// renders the result panel), independent of the truthiness of the payload.
const result = ref<unknown>(null)
const hasResult = ref(false)
// The tool + args that produced the currently-shown result, for the caption.
const resultLabel = ref('')
// Persistent inline error bound to the run (survives the auto-dismissing toast).
const errorMsg = ref('')

// Stable, client-controlled conversation id minted synchronously so the
// approve→call pair always shares one non-empty id (the call endpoint validates
// the conversation id matches the approval). Rotated on Clear, like the closed
// composable rotates conversationId in clear().
function newConvId() {
  return `assistant-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
}
const convId = useState<string>('assistant-conv-id', newConvId)

// Parsed hours value (NaN-safe). The backend enforces 1..720 for peer_get_metrics.
const HOURS_MIN = 1
const HOURS_MAX = 720
const hoursNum = computed(() => Number(hours.value))
const hoursValid = computed(() => Number.isFinite(hoursNum.value) && hoursNum.value >= HOURS_MIN && hoursNum.value <= HOURS_MAX)
const idValid = computed(() => peerId.value.trim().length > 0)

const canRun = computed(() => {
  if (running.value) return false
  if (current.value.needsId && !idValid.value) return false
  if (current.value.needsHours && !hoursValid.value) return false
  return true
})

// Build the EXACT argument object sent to BOTH approve and call. The backend
// compares arguments byte-for-byte (after JSON compaction) and rejects unknown
// fields, so this must contain only the fields each tool declares. Trim the id
// and clamp hours to the documented 1..720 range up front.
function buildArgs(): Record<string, unknown> {
  if (current.value.needsId && current.value.needsHours) {
    const h = Number.isFinite(hoursNum.value) ? Math.min(HOURS_MAX, Math.max(HOURS_MIN, Math.trunc(hoursNum.value))) : 24
    return { id: peerId.value.trim(), hours: h }
  }
  if (current.value.needsId) return { id: peerId.value.trim() }
  return {}
}

// Monotonic run sequence — a cancelled or superseded run never overwrites
// state when its promise later resolves/rejects.
let runSeq = 0

async function run() {
  if (!canRun.value) return
  const seq = ++runSeq
  running.value = true
  errorMsg.value = ''
  try {
    const args = buildArgs()
    const cid = convId.value
    const label = `${tool.value}(${JSON.stringify(args)})`
    const { approval_token } = await api.assistant.approve(tool.value, args, cid)
    if (seq !== runSeq) return // cancelled / superseded
    const res = await api.assistant.call(tool.value, args, cid, approval_token)
    if (seq !== runSeq) return // cancelled / superseded
    result.value = res.result
    resultLabel.value = label
    hasResult.value = true
  } catch (e) {
    if (seq !== runSeq) return // cancelled / superseded — ignore stale rejection
    errorMsg.value = e instanceof Error ? e.message : String(e)
    toast.error(e)
  } finally {
    if (seq === runSeq) running.value = false
  }
}

// Cancel an in-flight run: bump the sequence so the pending promise is ignored,
// and free the UI immediately (the single-use approval token is abandoned).
function cancel() {
  if (!running.value) return
  runSeq += 1
  running.value = false
}

// Clear the current output and rotate the conversation id, mirroring the closed
// composable's new-chat reset so a stale result/token never bleeds into the next
// tool.
function clearResult() {
  runSeq += 1
  running.value = false
  result.value = null
  hasResult.value = false
  resultLabel.value = ''
  errorMsg.value = ''
  convId.value = newConvId()
}

// Changing the tool or its arguments invalidates a previously-shown result so it
// is never ambiguously attached to a different tool/arg set.
watch([tool, peerId, hours], () => {
  result.value = null
  hasResult.value = false
  resultLabel.value = ''
  errorMsg.value = ''
})

const prettyResult = computed(() => (result.value === null || result.value === undefined ? 'null' : JSON.stringify(result.value, null, 2)))
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="smart_toy" :title="t('assistant.title')" :subtitle="t('assistant.subtitle')" />

    <div v-if="!available" class="card card-outlined card-pad text-center txt-variant col gap-3" :style="{ alignItems: 'center', padding: '48px 24px' }">
      <MdSym name="block" :size="40" />
      <p :style="{ margin: 0, maxWidth: '420px' }">{{ t('assistant.unauthorized') }}</p>
    </div>

    <template v-else>
      <div class="card card-elevated card-pad col gap-4">
        <p class="md-body-medium txt-variant" :style="{ margin: 0 }">{{ t('assistant.intro') }}</p>

        <div class="row gap-2" :style="{ alignItems: 'flex-start', background: 'var(--md-sys-color-surface-container-low)', padding: '12px 14px', borderRadius: '12px' }">
          <MdSym name="verified_user" :size="20" :style="{ color: 'var(--md-sys-color-primary)', flexShrink: 0 }" />
          <p class="md-body-small txt-variant" :style="{ margin: 0 }">{{ t('assistant.readOnlyNotice') }}</p>
        </div>

        <MdSelect
          :label="t('assistant.tool')"
          :model-value="tool"
          :options="tools.map((x) => ({ value: x.value, label: x.label }))"
          tf-bg="var(--md-sys-color-surface-container-low)"
          @update:model-value="(v: string) => (tool = v as AssistantTool)"
        />
        <div v-if="current.needsId" class="col gap-1">
          <MdTextField :label="t('assistant.peerId')" :model-value="peerId" mono tf-bg="var(--md-sys-color-surface-container-low)" @update:model-value="(v: string) => (peerId = v)" />
          <p v-if="peerId.length > 0 && !idValid" class="md-body-small" :style="{ margin: '0 4px', color: 'var(--md-sys-color-error)' }">{{ t('assistant.peerIdRequired') }}</p>
        </div>
        <div v-if="current.needsHours" class="col gap-1">
          <MdTextField :label="t('assistant.hours')" :model-value="hours" inputmode="numeric" mono tf-bg="var(--md-sys-color-surface-container-low)" @update:model-value="(v: string) => (hours = v.replace(/\D/g, ''))" />
          <p v-if="hours.length > 0 && !hoursValid" class="md-body-small" :style="{ margin: '0 4px', color: 'var(--md-sys-color-error)' }">{{ t('assistant.hoursRange') }}</p>
        </div>

        <div class="row gap-2">
          <MdButton variant="filled" icon="play_arrow" :loading="running" :disabled="!canRun" block @click="run">{{ running ? t('assistant.running') : t('assistant.runTool') }}</MdButton>
          <MdButton v-if="running" variant="outlined" icon="stop" @click="cancel">{{ t('common.cancel') }}</MdButton>
        </div>
      </div>

      <!-- Persistent inline error, distinct from the transient toast. -->
      <div v-if="errorMsg" class="card card-outlined card-pad row gap-3" :style="{ alignItems: 'flex-start', borderColor: 'var(--md-sys-color-error)', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }">
        <MdSym name="error" :size="22" fill :style="{ flexShrink: 0 }" />
        <div class="col gap-1 min-w-0" :style="{ flex: 1 }">
          <div class="md-title-small">{{ t('assistant.runFailed') }}</div>
          <div class="md-body-medium" :style="{ margin: 0, wordBreak: 'break-word' }">{{ errorMsg }}</div>
        </div>
        <button v-ripple type="button" class="icon-btn" :aria-label="t('common.close')" @click="errorMsg = ''"><MdSym name="close" :size="20" /></button>
      </div>

      <!-- Result panel renders whenever a call COMPLETED, even for null/empty payloads. -->
      <div v-if="hasResult" class="col gap-2">
        <div class="row gap-2" :style="{ justifyContent: 'space-between', alignItems: 'center' }">
          <h2 class="md-title-medium" :style="{ margin: 0 }">{{ t('assistant.result') }}</h2>
          <div class="row gap-1" :style="{ alignItems: 'center' }">
            <MdCopyButton :value="prettyResult" />
            <MdButton variant="text" icon="restart_alt" @click="clearResult">{{ t('assistant.clear') }}</MdButton>
          </div>
        </div>
        <p v-if="resultLabel" class="md-body-small txt-variant mono" :style="{ margin: 0, wordBreak: 'break-all' }">{{ resultLabel }}</p>
        <pre class="code-block">{{ prettyResult }}</pre>
      </div>
    </template>
  </div>
</template>
