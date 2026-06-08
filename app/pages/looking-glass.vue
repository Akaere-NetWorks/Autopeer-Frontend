<script setup lang="ts">
import type { LookingGlassType } from '~/types/api'

definePageMeta({ middleware: 'auth', title: 'nav.lookingGlass' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const tfBg = 'var(--md-sys-color-surface-container-low)'

const { data: nodes } = await useAsyncData('lg-nodes', () => api.nodes.listPublic().catch(() => []), { server: false })
const onlineNodes = computed(() => (nodes.value ?? []).filter((n) => n.online))

const nodeId = ref('')
watchEffect(() => {
  if (!nodeId.value && onlineNodes.value.length) nodeId.value = onlineNodes.value[0]!.id
})

const type = ref<LookingGlassType>('ping')
const target = ref('')
const output = ref<string | null>(null)
const running = ref(false)
const ranNode = ref('')

const typeOptions = computed(() => [
  { value: 'ping', label: t('lookingGlass.types.ping') },
  { value: 'traceroute', label: t('lookingGlass.types.traceroute') },
  { value: 'mtr', label: t('lookingGlass.types.mtr') },
  { value: 'bgp_route', label: t('lookingGlass.types.bgp_route') },
])
const nodeOptions = computed(() => onlineNodes.value.map((n) => ({ value: n.id, label: `${n.name} · ${n.location}` })))

async function run() {
  if (!nodeId.value || !target.value.trim()) return
  running.value = true
  output.value = null
  try {
    const res = await api.lookingGlass.run({ node_id: nodeId.value, type: type.value, target: target.value.trim() })
    output.value = res.result?.output ?? JSON.stringify(res.result, null, 2)
    ranNode.value = res.node_name || nodeId.value
  } catch (e) {
    toast.error(e)
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="travel_explore" :title="t('lookingGlass.title')" :subtitle="t('lookingGlass.subtitle')" />

    <div class="card card-elevated card-pad">
      <div v-if="!onlineNodes.length" class="md-body-medium txt-variant">{{ t('lookingGlass.noNodes') }}</div>
      <template v-else>
        <div class="params-2" :style="{ marginBottom: '18px' }">
          <MdSelect v-model="nodeId" :label="t('lookingGlass.node')" :options="nodeOptions" :tf-bg="tfBg" />
          <MdTextField
            v-model="target"
            :label="t('lookingGlass.target')"
            mono
            icon="my_location"
            :tf-bg="tfBg"
            :supporting="type === 'bgp_route' ? t('lookingGlass.targetSupportBgp') : t('lookingGlass.targetSupport')"
          />
        </div>
        <div class="row space-between flex-wrap gap-4">
          <MdSegmented v-model="type" :options="typeOptions" />
          <MdButton variant="filled" :icon="running ? 'progress_activity' : 'play_arrow'" :loading="running" :disabled="!target.trim()" @click="run">
            {{ running ? t('common.running') : t('common.run') }}
          </MdButton>
        </div>
      </template>
    </div>

    <div v-if="output || running" class="card card-elevated">
      <div class="row gap-3" :style="{ padding: '14px 20px', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }">
        <MdSym name="terminal" class="txt-variant" />
        <span class="md-title-small">{{ t('lookingGlass.results') }}</span>
        <span class="md-body-small mono ml-auto txt-variant">{{ ranNode }} · {{ type }}</span>
      </div>
      <pre class="code-block" :style="{ margin: 0, borderRadius: 0, background: 'transparent', maxHeight: '420px' }">{{ running ? t('common.running') : output }}</pre>
    </div>
  </div>
</template>
