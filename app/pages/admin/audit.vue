<script setup lang="ts">
definePageMeta({ middleware: 'admin', title: 'nav.admin.audit' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const { relTime } = useFormat()

const PER_PAGE = 30
const page = ref(1)
const actionFilter = ref('')

const { data, pending } = await useAsyncData(
  'admin-audit',
  () => api.admin.audit({ action: actionFilter.value || undefined, page: page.value, per_page: PER_PAGE }),
  { watch: [page, actionFilter], server: false },
)
watch(actionFilter, () => { page.value = 1 })

const logs = computed(() => data.value?.logs ?? [])
const total = computed(() => data.value?.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PER_PAGE)))

let debounce: ReturnType<typeof setTimeout> | undefined
const actionInput = ref('')
watch(actionInput, (v) => {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => { actionFilter.value = v.trim() }, 350)
})

function isPeer(action: string) { return action.includes('peer') }
function pretty(action: string) { return action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }
function detailText(log: { target_id?: string | null, detail?: Record<string, unknown> | null, operator: string }) {
  const parts: string[] = []
  if (log.target_id) parts.push(log.target_id)
  if (log.detail && typeof log.detail === 'object') {
    for (const [k, v] of Object.entries(log.detail)) if (v != null && typeof v !== 'object') parts.push(`${k}=${v}`)
  }
  return parts.join(' · ') || log.operator
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="receipt_long" :title="t('admin.audit.title')" :subtitle="t('admin.audit.subtitle')" />

    <div class="row" :style="{ maxWidth: '360px' }">
      <MdTextField :model-value="actionInput" icon="search" :placeholder="t('admin.audit.filterAction')" :style="{ width: '100%' }" @update:model-value="(v: string) => (actionInput = v)" />
    </div>

    <div v-if="pending && !logs.length" class="col gap-3">
      <SkeletonBlock v-for="i in 6" :key="i" height="56px" radius="12px" />
    </div>
    <div v-else-if="!logs.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.audit.empty') }}</div>

    <template v-else>
      <div class="card card-elevated">
        <div
          v-for="(log, i) in logs"
          :key="log.id"
          class="list-item"
          :style="{ borderBottom: i < logs.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none', padding: '14px 20px' }"
        >
          <span :style="{
            display: 'inline-flex', width: '40px', height: '40px', borderRadius: '12px', alignItems: 'center', justifyContent: 'center',
            background: isPeer(log.action) ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-secondary-container)',
            color: isPeer(log.action) ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-secondary-container)',
          }">
            <MdSym :name="isPeer(log.action) ? 'hub' : 'shield_person'" :size="20" fill />
          </span>
          <div :style="{ flex: 1, minWidth: 0 }">
            <div class="md-title-small">{{ pretty(log.action) }} <span class="md-body-small txt-variant mono">· {{ log.operator }}</span></div>
            <div class="md-body-small mono txt-variant">{{ detailText(log) }}</div>
          </div>
          <span class="md-body-small txt-variant" :style="{ whiteSpace: 'nowrap' }">{{ relTime(log.created_at) }}</span>
        </div>
      </div>
      <div class="row space-between" :style="{ alignItems: 'center' }">
        <span class="md-body-small txt-variant">{{ total }}</span>
        <div class="row gap-2">
          <MdIconButton icon="chevron_left" :disabled="page <= 1" :title="t('common.back')" @click="page--" />
          <span class="md-label-large" :style="{ alignSelf: 'center' }">{{ page }} / {{ totalPages }}</span>
          <MdIconButton icon="chevron_right" :disabled="page >= totalPages" :title="t('common.next')" @click="page++" />
        </div>
      </div>
    </template>
  </div>
</template>
