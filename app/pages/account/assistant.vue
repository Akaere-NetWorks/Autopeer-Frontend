<script setup lang="ts">
import type { AssistantTool } from '~/types/admin'

definePageMeta({ middleware: 'auth', title: 'nav.assistant' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()

const { data: auth, error: authError } = await useAsyncData('assistant-auth', () => api.assistant.auth(), { server: false })
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
const result = ref<unknown>(null)

// Stable conversation id for the approve→call pair (client-only).
const convId = ref('')
onMounted(() => { convId.value = `assistant-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}` })

function buildArgs(): Record<string, unknown> {
  if (current.value.needsId && current.value.needsHours) return { id: peerId.value, hours: Number(hours.value) || 24 }
  if (current.value.needsId) return { id: peerId.value }
  return {}
}

async function run() {
  running.value = true
  result.value = null
  try {
    const args = buildArgs()
    const cid = convId.value
    const { approval_token } = await api.assistant.approve(tool.value, args, cid)
    const res = await api.assistant.call(tool.value, args, cid, approval_token)
    result.value = res.result
  } catch (e) {
    toast.error(e)
  } finally {
    running.value = false
  }
}

const prettyResult = computed(() => (result.value == null ? '' : JSON.stringify(result.value, null, 2)))
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="smart_toy" :title="t('admin.assistant.title')" :subtitle="t('admin.assistant.subtitle')" />

    <div v-if="!available" class="card card-outlined card-pad text-center txt-variant col gap-3" :style="{ alignItems: 'center', padding: '48px 24px' }">
      <MdSym name="block" :size="40" />
      <p :style="{ margin: 0, maxWidth: '420px' }">{{ t('admin.assistant.unauthorized') }}</p>
    </div>

    <template v-else>
      <div class="card card-elevated card-pad col gap-4">
        <p class="md-body-medium txt-variant" :style="{ margin: 0 }">{{ t('admin.assistant.intro') }}</p>
        <MdSelect
          :label="t('admin.assistant.tool')"
          :model-value="tool"
          :options="tools.map((x) => ({ value: x.value, label: x.label }))"
          tf-bg="var(--md-sys-color-surface-container-low)"
          @update:model-value="(v: string) => (tool = v as AssistantTool)"
        />
        <MdTextField v-if="current.needsId" :label="t('admin.assistant.peerId')" :model-value="peerId" mono tf-bg="var(--md-sys-color-surface-container-low)" @update:model-value="(v: string) => (peerId = v)" />
        <MdTextField v-if="current.needsHours" :label="t('admin.assistant.hours')" :model-value="hours" inputmode="numeric" mono tf-bg="var(--md-sys-color-surface-container-low)" @update:model-value="(v: string) => (hours = v.replace(/\\D/g, ''))" />
        <MdButton variant="filled" icon="play_arrow" :loading="running" :disabled="current.needsId && !peerId" block @click="run">{{ running ? t('admin.assistant.running') : t('admin.assistant.runTool') }}</MdButton>
      </div>

      <div v-if="prettyResult" class="col gap-2">
        <h2 class="md-title-medium" :style="{ margin: 0 }">{{ t('admin.assistant.result') }}</h2>
        <pre class="code-block">{{ prettyResult }}</pre>
      </div>
    </template>
  </div>
</template>
