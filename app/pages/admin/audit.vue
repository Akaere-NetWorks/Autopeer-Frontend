<script setup lang="ts">
definePageMeta({ middleware: 'admin', title: 'nav.admin.audit' })

const { t } = useI18n()
const api = useApi()
const { relTime, fmtDate } = useFormat()

const PER_PAGE = 30
const page = ref(1)

// Draft inputs (what the admin is typing) vs applied filters (what actually drives
// the fetch). Keeping them separate means typing never fires a request — only an
// explicit Apply / Clear / Enter does, mirroring the closed admin audit page.
const actionInput = ref('')
const operatorInput = ref('')
const appliedAction = ref('')
const appliedOperator = ref('')

const { data, pending } = await useAsyncData(
  'admin-audit',
  () => api.admin.audit({
    action: appliedAction.value || undefined,
    operator: appliedOperator.value || undefined,
    page: page.value,
    per_page: PER_PAGE,
  }),
  { watch: [page, appliedAction, appliedOperator], lazy: true, server: false },
)

const logs = computed(() => data.value?.logs ?? [])
const total = computed(() => data.value?.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PER_PAGE)))

// Windowed numbered page buttons (max 7 visible, centred on the current page).
const pageNumbers = computed<number[]>(() => {
  const tp = totalPages.value
  if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1)
  const start = Math.max(1, Math.min(page.value - 3, tp - 6))
  return Array.from({ length: 7 }, (_, i) => start + i)
})

const expandedId = ref('')
function toggleDetails(id: string) {
  expandedId.value = expandedId.value === id ? '' : id
}

// Apply both filters and reset to page 1 in a single synchronous batch so the
// watched fetch fires exactly once (no double request / wrong-page flash).
function applyFilters() {
  expandedId.value = ''
  appliedAction.value = actionInput.value.trim()
  appliedOperator.value = operatorInput.value.trim()
  page.value = 1
}

function clearFilters() {
  expandedId.value = ''
  actionInput.value = ''
  operatorInput.value = ''
  appliedAction.value = ''
  appliedOperator.value = ''
  page.value = 1
}

const hasActiveFilter = computed(() => !!appliedAction.value || !!appliedOperator.value)

function goToPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  expandedId.value = ''
  page.value = p
}

function isPeer(action: string) { return action.includes('peer') }

// Localized labels shared with the user audit page (falls back to title-case).
const { label: actionLabel } = useAuditActions()

// One-line scalar summary kept from the original page; the full structured detail
// (including nested objects) is reachable via the per-row Expand toggle below.
function detailSummary(log: { target_id?: string | null, detail?: Record<string, unknown> | null }) {
  const parts: string[] = []
  if (log.target_id) parts.push(log.target_id)
  if (log.detail && typeof log.detail === 'object') {
    for (const [k, v] of Object.entries(log.detail)) {
      if (v != null && typeof v !== 'object') parts.push(`${k}=${v}`)
    }
  }
  return parts.join(' · ')
}

function hasDetail(log: { detail?: Record<string, unknown> | null }) {
  return !!log.detail && typeof log.detail === 'object' && Object.keys(log.detail).length > 0
}
function detailJson(log: { detail?: Record<string, unknown> | null }) {
  return log.detail ? JSON.stringify(log.detail, null, 2) : ''
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="receipt_long" :title="t('admin.audit.title')" :subtitle="t('admin.audit.subtitle')" />

    <div class="card card-outlined card-pad col gap-3">
      <div class="row gap-3 flex-wrap" :style="{ alignItems: 'flex-end' }">
        <MdTextField
          :model-value="actionInput"
          icon="search"
          :label="t('admin.audit.filterAction')"
          :placeholder="t('admin.audit.filterAction')"
          :style="{ flex: 1, minWidth: '200px' }"
          @update:model-value="(v: string) => (actionInput = v)"
          @keydown.enter="applyFilters"
        />
        <MdTextField
          :model-value="operatorInput"
          icon="person"
          :label="t('admin.audit.operatorFilter')"
          :placeholder="t('admin.audit.operatorFilter')"
          :style="{ flex: 1, minWidth: '200px' }"
          @update:model-value="(v: string) => (operatorInput = v)"
          @keydown.enter="applyFilters"
        />
        <div class="row gap-2">
          <MdButton variant="filled" icon="filter_alt" @click="applyFilters">{{ t('admin.audit.applyFilters') }}</MdButton>
          <MdButton variant="text" :disabled="!actionInput && !operatorInput && !hasActiveFilter" @click="clearFilters">{{ t('admin.audit.clearFilters') }}</MdButton>
        </div>
      </div>
    </div>

    <div v-if="data === null" class="col gap-3">
      <SkeletonBlock v-for="i in 6" :key="i" height="56px" radius="12px" />
    </div>
    <!-- Distinguish "no results for these filters" (offer to clear) from a
         genuinely empty log. -->
    <EmptyState v-else-if="!logs.length && hasActiveFilter" icon="filter_alt_off" :body="t('admin.audit.emptyFiltered')">
      <MdButton variant="tonal" icon="filter_alt_off" @click="clearFilters">{{ t('admin.audit.clearFilters') }}</MdButton>
    </EmptyState>
    <EmptyState v-else-if="!logs.length" icon="receipt_long" :body="t('admin.audit.empty')" />

    <template v-else>
      <div class="card card-elevated">
        <div
          v-for="(log, i) in logs"
          :key="log.id"
          :style="{ borderBottom: i < logs.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none', padding: '14px 20px' }"
        >
          <div class="row gap-3" :style="{ alignItems: 'flex-start' }">
            <span :style="{
              display: 'inline-flex', width: '40px', height: '40px', borderRadius: '12px', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: isPeer(log.action) ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-secondary-container)',
              color: isPeer(log.action) ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-secondary-container)',
            }">
              <MdSym :name="isPeer(log.action) ? 'hub' : 'shield_person'" :size="20" fill />
            </span>
            <div :style="{ flex: 1, minWidth: 0 }">
              <div class="md-title-small row gap-2" :style="{ flexWrap: 'wrap', alignItems: 'center', rowGap: '4px' }">
                <span>{{ actionLabel(log.action) }}</span>
                <code class="md-body-small mono txt-variant" :style="{ background: 'var(--md-sys-color-surface-container-highest)', padding: '1px 6px', borderRadius: '6px' }">{{ log.action }}</code>
                <span class="md-body-small txt-variant mono">· {{ log.operator }}</span>
              </div>
              <div v-if="detailSummary(log)" class="md-body-small mono txt-variant" :style="{ wordBreak: 'break-word' }">{{ detailSummary(log) }}</div>
              <button
                v-if="hasDetail(log)"
                type="button"
                class="btn btn-text"
                :style="{ marginTop: '4px', marginLeft: '-8px', height: '32px' }"
                @click="toggleDetails(log.id)"
              >
                <MdSym :name="expandedId === log.id ? 'expand_less' : 'expand_more'" :size="18" />
                <span>{{ expandedId === log.id ? t('admin.audit.collapse') : t('admin.audit.expand') }}</span>
              </button>
            </div>
            <span class="md-body-small txt-variant" :style="{ whiteSpace: 'nowrap' }" :title="fmtDate(log.created_at)">{{ relTime(log.created_at) }}</span>
          </div>

          <div
            v-if="expandedId === log.id && hasDetail(log)"
            :style="{ position: 'relative', marginTop: '10px', marginLeft: '52px', borderRadius: '12px', background: 'var(--md-sys-color-surface-container-high)', padding: '12px 14px' }"
          >
            <MdCopyButton
              :value="detailJson(log)"
              :title="t('common.copy')"
              :style="{ position: 'absolute', top: '6px', right: '6px' }"
            />
            <pre class="md-body-small mono" :style="{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', paddingRight: '32px' }">{{ detailJson(log) }}</pre>
          </div>
        </div>
      </div>

      <div class="row space-between flex-wrap gap-3" :style="{ alignItems: 'center' }">
        <span class="md-body-small txt-variant">{{ t('admin.audit.entries', { count: total }) }}</span>
        <div v-if="totalPages > 1" class="row gap-1" :style="{ alignItems: 'center' }">
          <MdIconButton icon="chevron_left" :disabled="page <= 1" :title="t('common.back')" @click="goToPage(page - 1)" />
          <button
            v-for="p in pageNumbers"
            :key="p"
            v-ripple
            type="button"
            :class="p === page ? 'btn btn-filled' : 'btn btn-text'"
            :style="{ minWidth: '40px', height: '40px', padding: '0 10px' }"
            @click="goToPage(p)"
          >{{ p }}</button>
          <MdIconButton icon="chevron_right" :disabled="page >= totalPages" :title="t('common.next')" @click="goToPage(page + 1)" />
        </div>
      </div>
    </template>
  </div>
</template>
