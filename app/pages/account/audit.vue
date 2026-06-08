<script setup lang="ts">
import type { AuditLog } from '~/types/api'

definePageMeta({ middleware: 'auth', title: 'nav.auditLog' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const { relTime } = useFormat()

const PER_PAGE = 25
const page = ref(1)
const extra = ref<AuditLog[]>([]) // pages loaded beyond the first
const loadingMore = ref(false)

// First page lives inside the asyncData payload so SSR and client hydration agree.
const { data, pending } = await useAsyncData('audit', () => api.account.audit({ page: 1, per_page: PER_PAGE }), { server: false })

const logs = computed<AuditLog[]>(() => [...(data.value?.logs ?? []), ...extra.value])
const total = computed(() => data.value?.total ?? 0)
const hasMore = computed(() => logs.value.length < total.value)

async function loadMore() {
  loadingMore.value = true
  try {
    page.value += 1
    const res = await api.account.audit({ page: page.value, per_page: PER_PAGE })
    extra.value.push(...res.logs)
  } catch (e) {
    toast.error(e)
    page.value -= 1
  } finally {
    loadingMore.value = false
  }
}

function isPeer(action: string) {
  return action.includes('peer')
}
function pretty(action: string) {
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
function detailText(log: AuditLog) {
  const parts: string[] = []
  if (log.target_id) parts.push(log.target_id)
  if (log.detail && typeof log.detail === 'object') {
    for (const [k, v] of Object.entries(log.detail)) {
      if (v != null && typeof v !== 'object') parts.push(`${k}=${v}`)
    }
  }
  return parts.join(' · ') || log.operator
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="receipt_long" :title="t('audit.title')" :subtitle="t('audit.subtitle')" />

    <div v-if="pending && !logs.length" class="col gap-3">
      <SkeletonBlock v-for="i in 5" :key="i" height="56px" radius="12px" />
    </div>

    <div v-else-if="!logs.length" class="card card-outlined card-pad text-center txt-variant">{{ t('audit.empty') }}</div>

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
            <MdSym :name="isPeer(log.action) ? 'hub' : 'person'" :size="20" fill />
          </span>
          <div :style="{ flex: 1, minWidth: 0 }">
            <div class="md-title-small">{{ pretty(log.action) }}</div>
            <div class="md-body-small mono txt-variant">{{ detailText(log) }}</div>
          </div>
          <span class="md-body-small txt-variant" :style="{ whiteSpace: 'nowrap' }">{{ relTime(log.created_at) }}</span>
        </div>
      </div>
      <div v-if="hasMore" class="text-center">
        <MdButton variant="text" icon="expand_more" :loading="loadingMore" @click="loadMore">{{ t('audit.loadMore') }}</MdButton>
      </div>
    </template>
  </div>
</template>
