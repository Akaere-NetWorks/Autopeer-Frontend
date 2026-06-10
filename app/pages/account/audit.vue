<script setup lang="ts">
import type { AuditLog } from '~/types/api'

definePageMeta({ middleware: 'auth', title: 'nav.auditLog' })

const { t } = useI18n()
const api = useApi()
const { relTime, fmtDate } = useFormat()

const PER_PAGE = 25
const page = ref(1)
const actionFilter = ref('')

// First page lives inside the asyncData payload so SSR and client hydration agree.
// Re-fetches automatically whenever the page number or the applied action filter
// changes; { lazy: true, server: false } keeps it client-only (SSR-safe, matches neighbours).
const { data, pending } = await useAsyncData(
  'audit',
  () => api.account.audit({ action: actionFilter.value || undefined, page: page.value, per_page: PER_PAGE }),
  { watch: [page, actionFilter], lazy: true, server: false },
)

const logs = computed<AuditLog[]>(() => data.value?.logs ?? [])
const total = computed(() => data.value?.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PER_PAGE)))

// Debounce the action filter input (and reset to page 1 on a new query) so each
// keystroke doesn't fire a request. The backend's /user/audit takes only `action`.
const actionInput = ref('')
let debounce: ReturnType<typeof setTimeout> | undefined
watch(actionInput, (v) => {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    const next = v.trim()
    if (next !== actionFilter.value) {
      page.value = 1
      actionFilter.value = next
    }
  }, 350)
})
function clearFilter() {
  actionInput.value = ''
  if (debounce) clearTimeout(debounce)
  page.value = 1
  actionFilter.value = ''
}

// Expand/collapse the raw detail JSON for a single row.
const expandedId = ref('')
function toggleDetails(id: string) {
  expandedId.value = expandedId.value === id ? '' : id
}
function detailJSON(detail?: AuditLog['detail']) {
  return detail && Object.keys(detail).length ? JSON.stringify(detail, null, 2) : '{}'
}

function isPeer(action: string) {
  return action.includes('peer')
}

// Localized labels / tones shared with the admin audit page.
const { label: actionLabel, kind: actionKind } = useAuditActions()

function detailValue(detail: AuditLog['detail'], key: string): string {
  const value = detail?.[key]
  return value === undefined || value === null || value === '' ? '' : String(value)
}
function actionDescription(log: AuditLog) {
  const asn = detailValue(log.detail, 'asn')
  if (asn) return t('userAudit.asnRelated', { asn })
  if (log.target_id) return t('userAudit.peerRelated')
  return t('userAudit.accountRelated')
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="receipt_long" :title="t('audit.title')" :subtitle="t('audit.subtitle')" />

    <div class="row gap-2" :style="{ maxWidth: '420px' }">
      <MdTextField
        :model-value="actionInput"
        icon="search"
        :placeholder="t('userAudit.actionPlaceholder')"
        :style="{ flex: 1, minWidth: 0 }"
        @update:model-value="(v: string) => (actionInput = v)"
      />
      <MdIconButton
        v-if="actionInput"
        icon="close"
        :title="t('audit.clearFilters')"
        @click="clearFilter"
      />
    </div>

    <div v-if="data === null" class="col gap-3">
      <SkeletonBlock v-for="i in 6" :key="i" height="64px" radius="12px" />
    </div>

    <!-- Distinguish "no results for this filter" (offer to clear) from a
         genuinely empty log. -->
    <EmptyState v-else-if="!logs.length && actionFilter" icon="filter_alt_off" :body="t('audit.emptyFiltered')">
      <MdButton variant="tonal" icon="filter_alt_off" @click="clearFilter">{{ t('audit.clearFilters') }}</MdButton>
    </EmptyState>
    <EmptyState v-else-if="!logs.length" icon="receipt_long" :body="t('audit.empty')" />

    <template v-else>
      <div class="card card-elevated">
        <div
          v-for="(log, i) in logs"
          :key="log.id"
          :style="{ borderBottom: i < logs.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none' }"
        >
          <div class="list-item" :style="{ padding: '14px 20px' }">
            <span :style="{
              display: 'inline-flex', width: '40px', height: '40px', borderRadius: '12px', alignItems: 'center', justifyContent: 'center',
              background: isPeer(log.action) ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-secondary-container)',
              color: isPeer(log.action) ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-secondary-container)',
            }">
              <MdSym :name="isPeer(log.action) ? 'hub' : 'person'" :size="20" fill />
            </span>
            <div :style="{ flex: 1, minWidth: 0 }">
              <div class="row gap-2" :style="{ flexWrap: 'wrap', rowGap: '4px' }">
                <MdStatus :kind="actionKind(log.action)">{{ actionLabel(log.action) }}</MdStatus>
                <code class="md-body-small mono txt-variant" :style="{ background: 'var(--md-sys-color-surface-container-highest)', padding: '1px 6px', borderRadius: '6px' }">{{ log.action }}</code>
              </div>
              <div class="md-body-small txt-variant" :style="{ marginTop: '4px' }">{{ actionDescription(log) }}</div>
            </div>
            <span class="md-body-small txt-variant" :style="{ whiteSpace: 'nowrap' }" :title="fmtDate(log.created_at)">{{ relTime(log.created_at) }}</span>
          </div>

          <div :style="{ padding: '0 20px 14px', marginLeft: '52px' }">
            <div class="row gap-3" :style="{ flexWrap: 'wrap', rowGap: '4px' }">
              <span class="md-body-small txt-variant">{{ t('audit.operator') }}: <span class="mono">{{ log.operator }}</span></span>
              <span class="md-body-small txt-variant">{{ t('audit.target') }}: <span class="mono">{{ log.target_id || t('common.dash') }}</span></span>
            </div>
            <MdButton
              variant="text"
              :icon="expandedId === log.id ? 'expand_less' : 'expand_more'"
              :style="{ marginTop: '4px', marginLeft: '-8px' }"
              @click="toggleDetails(log.id)"
            >
              {{ expandedId === log.id ? t('audit.collapse') : t('audit.expand') }}
            </MdButton>
            <pre
              v-if="expandedId === log.id"
              class="md-body-small mono"
              :style="{
                margin: '8px 0 0', padding: '12px', borderRadius: '12px', overflowX: 'auto',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface-variant)',
              }"
            >{{ detailJSON(log.detail) }}</pre>
          </div>
        </div>
      </div>

      <div class="row space-between" :style="{ alignItems: 'center' }">
        <span class="md-body-small txt-variant">{{ t('audit.totalCount', { count: total }) }}</span>
        <div class="row gap-2">
          <MdIconButton icon="chevron_left" :disabled="page <= 1" :title="t('common.back')" @click="page--" />
          <span class="md-label-large" :style="{ alignSelf: 'center' }">{{ page }} / {{ totalPages }}</span>
          <MdIconButton icon="chevron_right" :disabled="page >= totalPages" :title="t('common.next')" @click="page++" />
        </div>
      </div>
    </template>
  </div>
</template>
