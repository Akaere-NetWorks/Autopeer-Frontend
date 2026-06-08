<script setup lang="ts">
import type { QueueSnapshot, SchedulerEntrySnapshot, TaskSnapshot, TaskState } from '~/types/admin'

definePageMeta({ middleware: 'admin', title: 'nav.admin.queue' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const { fmtBytes, relTime, fmtDate } = useFormat()

const ZERO_TIME = '0001-01-01T00:00:00Z'

const view = ref<'queues' | 'servers' | 'scheduler'>('queues')
const viewOptions = computed(() => [
  { value: 'queues', label: t('admin.queue.queues'), icon: 'lists' },
  { value: 'servers', label: t('admin.queue.servers'), icon: 'dns' },
  { value: 'scheduler', label: t('admin.queue.scheduler'), icon: 'schedule' },
])

const { data: overview, pending, refresh } = await useAsyncData('admin-queue', () => api.admin.queue.overview(), { lazy: true, server: false })
// Degrade gracefully: still render whatever snapshots came back, surface a banner.
const available = computed(() => overview.value?.available !== false && overview.value?.enabled !== false)
const queues = computed(() => overview.value?.queues ?? [])
const servers = computed(() => overview.value?.servers ?? [])
const scheduler = computed(() => overview.value?.scheduler_entries ?? [])

// Overview summary stats.
const totalTasks = computed(() => queues.value.reduce((s, q) => s + (q.size ?? 0), 0))
const totalWorkers = computed(() => servers.value.reduce((s, sv) => s + (sv.active_workers?.length ?? 0), 0))

function fmtTime(v: string | null | undefined): string {
  if (!v || v === ZERO_TIME) return t('common.dash')
  return fmtDate(v)
}

// ── Auto-refresh polling ──────────────────────────────────────────────────────
const autoRefresh = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null
function stopTimer() { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null } }
async function refreshAll() {
  await refresh()
  if (selected.value) await refreshTasks()
}
watch(autoRefresh, (on) => {
  stopTimer()
  if (on) refreshTimer = setInterval(refreshAll, 10_000)
})
onUnmounted(stopTimer)

// ── Pause / resume ────────────────────────────────────────────────────────────
const busy = ref<string | null>(null)
async function togglePause(q: QueueSnapshot) {
  busy.value = q.name
  try {
    await (q.paused ? api.admin.queue.resume(q.name) : api.admin.queue.pause(q.name))
    toast.show(t(q.paused ? 'admin.queue.resumed' : 'admin.queue.wasPaused'))
    await refresh()
  } catch (e) { toast.error(e) } finally { busy.value = null }
}

// ── Task drill-down ───────────────────────────────────────────────────────────
const selected = ref<string | null>(null)
const taskState = ref<TaskState>('pending')
const taskPage = ref(1)
const TASK_SIZE = 20

const { data: taskList, pending: loadingTasks, refresh: refreshTasks } = await useAsyncData(
  'admin-queue-tasks',
  () => selected.value
    ? api.admin.queue.tasks(selected.value, taskState.value, taskPage.value, TASK_SIZE)
    : Promise.resolve(null),
  { watch: [selected, taskState, taskPage], lazy: true, server: false },
)
const tasks = computed(() => taskList.value?.tasks ?? [])
const taskTotal = computed(() => taskList.value?.total_count ?? 0)
const taskPages = computed(() => Math.max(1, Math.ceil(taskTotal.value / TASK_SIZE)))

// Switching state (tab/stat-card) resets to page 1; switching queue too.
function openTasks(name: string) {
  if (selected.value === name) { selected.value = null; return }
  selected.value = name
  taskState.value = 'pending'
  taskPage.value = 1
  scheduleSelected.value = null
}
function switchState(s: TaskState) {
  if (taskState.value === s && taskPage.value === 1) return
  taskState.value = s
  taskPage.value = 1
}

const stateOptions = computed(() => (['pending', 'active', 'scheduled', 'retry', 'archived', 'completed'] as TaskState[]).map(s => ({ value: s, label: t(`admin.queue.${s}`) })))

const stateChips = computed(() => (['pending', 'active', 'scheduled', 'retry', 'archived'] as TaskState[]))
function chipValue(q: QueueSnapshot, s: TaskState): number {
  return (q as unknown as Record<string, number>)[s] ?? 0
}
// Clicking a stat chip expands the queue (if needed) and jumps to that state's tab.
function chipClick(name: string, s: TaskState) {
  if (selected.value !== name) { openTasks(name); switchState(s) } else { switchState(s) }
}

// Generic immediate action (non-destructive: run/archive).
const acting = ref<string | null>(null)
async function taskAction(key: string, fn: () => Promise<unknown>, msg: string) {
  acting.value = key
  try { await fn(); toast.show(t(msg)); await refreshTasks() } catch (e) { toast.error(e) } finally { acting.value = null }
}

// ── Destructive confirmations ─────────────────────────────────────────────────
type Confirm =
  | { kind: 'deleteTask', queue: string, task: TaskSnapshot }
  | { kind: 'cancel', task: TaskSnapshot }
  | { kind: 'deleteAll', queue: string, state: TaskState, count: number }

const confirm = ref<Confirm | null>(null)
const submitting = ref(false)

const confirmTitle = computed(() => {
  switch (confirm.value?.kind) {
    case 'deleteTask': return t('admin.queue.deleteTaskTitle')
    case 'cancel': return t('admin.queue.cancelTitle')
    case 'deleteAll': return t('admin.queue.deleteAllTitle')
    default: return ''
  }
})

async function runConfirm() {
  const c = confirm.value
  if (!c) return
  submitting.value = true
  try {
    if (c.kind === 'deleteTask') {
      await api.admin.queue.deleteTask(c.queue, c.task.id)
      toast.show(t('admin.queue.taskDeleted'))
    } else if (c.kind === 'cancel') {
      await api.admin.queue.cancelActive(c.task.id)
      toast.show(t('admin.queue.taskCancelled'))
    } else if (c.kind === 'deleteAll') {
      await api.admin.queue.deleteAll(c.queue, c.state)
      toast.show(t('admin.queue.taskDeleted'))
    }
    confirm.value = null
    await refreshTasks()
  } catch (e) { toast.error(e) } finally { submitting.value = false }
}

// ── Scheduler entry drill-down + enqueue events ───────────────────────────────
const scheduleSelected = ref<string | null>(null)
const selectedEntry = computed<SchedulerEntrySnapshot | null>(() =>
  scheduler.value.find(e => e.id === scheduleSelected.value) ?? null)

const eventPage = ref(1)
const EVENT_SIZE = 20
const { data: events, pending: loadingEvents } = await useAsyncData(
  'admin-queue-sched-events',
  () => scheduleSelected.value
    ? api.admin.queue.schedulerEvents(scheduleSelected.value, eventPage.value, EVENT_SIZE)
    : Promise.resolve([]),
  { watch: [scheduleSelected, eventPage], lazy: true, server: false },
)
const eventList = computed(() => events.value ?? [])
// Backend returns a bare array with no total_count → next-page heuristic.
const eventsHasNext = computed(() => eventList.value.length >= EVENT_SIZE)

function openSchedule(id: string) {
  if (scheduleSelected.value === id) { scheduleSelected.value = null; return }
  scheduleSelected.value = id
  eventPage.value = 1
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="lists" :title="t('admin.queue.title')" :subtitle="t('admin.queue.subtitle')">
      <template #action>
        <label class="row gap-2 md-body-medium txt-variant" :style="{ alignItems: 'center', cursor: 'pointer' }">
          <input v-model="autoRefresh" type="checkbox">
          {{ t('admin.queue.autoRefresh') }}
        </label>
        <MdIconButton icon="refresh" :title="t('common.refresh')" @click="refreshAll()" />
      </template>
    </PageHeader>

    <div v-if="overview === null" class="col gap-3"><SkeletonBlock v-for="i in 3" :key="i" height="100px" radius="12px" /></div>

    <template v-else>
      <!-- Degrade gracefully: warn but keep rendering whatever data exists. -->
      <MdStatus v-if="!available" kind="error" :style="{ alignSelf: 'flex-start' }">{{ t('admin.queue.unavailable') }}</MdStatus>

      <!-- Overview summary stats -->
      <div class="stat-grid">
        <div class="card card-outlined card-pad">
          <div class="md-label-medium txt-variant">{{ t('admin.queue.totalQueues') }}</div>
          <div class="md-headline-small">{{ queues.length }}</div>
        </div>
        <div class="card card-outlined card-pad">
          <div class="md-label-medium txt-variant">{{ t('admin.queue.totalTasks') }}</div>
          <div class="md-headline-small">{{ totalTasks }}</div>
        </div>
        <div class="card card-outlined card-pad">
          <div class="md-label-medium txt-variant">{{ t('admin.queue.activeWorkers') }}</div>
          <div class="md-headline-small">{{ totalWorkers }}</div>
        </div>
        <div class="card card-outlined card-pad">
          <div class="md-label-medium txt-variant">{{ t('admin.queue.schedulerEntries') }}</div>
          <div class="md-headline-small">{{ scheduler.length }}</div>
        </div>
      </div>

      <MdSegmented v-model="view" :options="viewOptions" />

      <!-- Queues -->
      <template v-if="view === 'queues'">
        <div v-if="!queues.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.queue.empty') }}</div>
        <div v-else class="col gap-3">
          <div v-for="q in queues" :key="q.name" class="card card-elevated card-pad">
            <div class="row space-between flex-wrap gap-3" :style="{ alignItems: 'center' }">
              <div class="row gap-3" :style="{ alignItems: 'center' }">
                <span class="md-title-medium mono">{{ q.name }}</span>
                <MdStatus :kind="q.paused ? 'warning' : 'success'">{{ q.paused ? t('admin.queue.paused') : t('admin.queue.running') }}</MdStatus>
              </div>
              <div class="row gap-2">
                <MdButton variant="text" :icon="q.paused ? 'play_arrow' : 'pause'" :loading="busy === q.name" @click="togglePause(q)">{{ q.paused ? t('admin.queue.resume') : t('admin.queue.pause') }}</MdButton>
                <MdButton variant="tonal" :icon="selected === q.name ? 'expand_less' : 'list'" @click="openTasks(q.name)">{{ t('admin.queue.tasks') }}</MdButton>
              </div>
            </div>

            <div class="row gap-4 flex-wrap" :style="{ marginTop: '14px' }">
              <!-- Clickable stat chips that jump to the matching task tab. -->
              <button
                v-for="s in stateChips" :key="s" v-ripple type="button"
                class="state-layer stat-chip"
                :class="{ 'stat-chip-on': selected === q.name && taskState === s }"
                :style="{ '--slc': 'var(--md-sys-color-primary)' }"
                @click="chipClick(q.name, s)"
              >
                <div class="md-label-medium txt-variant">{{ t(`admin.queue.${s}`) }}</div>
                <div class="md-title-medium">{{ chipValue(q, s) }}</div>
              </button>
              <div class="stat-chip-static">
                <div class="md-label-medium txt-variant">{{ t('admin.queue.processed') }} / {{ t('admin.queue.failed') }}</div>
                <div class="md-title-medium mono">{{ q.processed }} / <span :class="{ 'txt-error': q.failed > 0 }">{{ q.failed }}</span></div>
              </div>
              <div class="stat-chip-static">
                <div class="md-label-medium txt-variant">{{ t('admin.queue.latency') }}</div>
                <div class="md-title-medium mono">{{ q.latency_ms }} {{ t('common.ms') }}</div>
              </div>
              <div class="stat-chip-static">
                <div class="md-label-medium txt-variant">{{ t('admin.queue.memory') }}</div>
                <div class="md-title-medium mono">{{ fmtBytes(q.memory_usage_bytes) }}</div>
              </div>
            </div>

            <!-- Tasks panel -->
            <div v-if="selected === q.name" :style="{ marginTop: '16px', borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '16px' }">
              <div class="row space-between flex-wrap gap-3" :style="{ marginBottom: '12px' }">
                <MdSegmented :model-value="taskState" :options="stateOptions" role="tablist" @update:model-value="(v: string) => switchState(v as TaskState)" />
                <MdButton variant="text" icon="delete_sweep" :disabled="!tasks.length" @click="confirm = { kind: 'deleteAll', queue: q.name, state: taskState, count: taskTotal }">{{ t('admin.queue.deleteAll') }}</MdButton>
              </div>

              <div v-if="loadingTasks" class="col gap-2"><SkeletonBlock v-for="i in 3" :key="i" height="40px" /></div>
              <div v-else-if="!tasks.length" class="md-body-medium txt-variant text-center" :style="{ padding: '16px' }">{{ t('admin.queue.empty') }}</div>
              <template v-else>
                <div class="table-wrap">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>{{ t('admin.queue.taskId') }}</th>
                        <th>{{ t('admin.queue.type') }}</th>
                        <th>{{ t('admin.queue.payload') }}</th>
                        <th>{{ t('admin.queue.state') }}</th>
                        <th>{{ t('admin.queue.retryCount') }}</th>
                        <th>{{ t('admin.queue.error') }}</th>
                        <th>{{ t('admin.queue.nextProcessAt') }}</th>
                        <th :style="{ textAlign: 'right' }">{{ t('admin.queue.actions') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="tk in tasks" :key="tk.id">
                        <td class="mono md-body-small">{{ tk.id.slice(0, 8) }}…</td>
                        <td class="mono">{{ tk.type }}</td>
                        <td class="md-body-small txt-variant" :style="{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }" :title="tk.payload">{{ (tk.payload || '').slice(0, 50) || t('common.dash') }}</td>
                        <td><span class="chip">{{ tk.state }}</span></td>
                        <td class="mono md-body-small">{{ tk.retry_count }}/{{ tk.max_retry }}</td>
                        <td class="md-body-small txt-error" :style="{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }" :title="tk.last_error">{{ tk.last_error || t('common.dash') }}</td>
                        <td class="md-body-small" :style="{ whiteSpace: 'nowrap' }">{{ fmtTime(tk.next_process_at) }}</td>
                        <td>
                          <!-- Always render run/archive/delete; backend rejects invalid transitions. Cancel only for active. -->
                          <div class="row gap-1" :style="{ justifyContent: 'flex-end' }">
                            <MdIconButton icon="play_arrow" :title="t('admin.queue.run')" :loading="acting === `run-${tk.id}`" @click="taskAction(`run-${tk.id}`, () => api.admin.queue.runTask(q.name, tk.id), 'admin.queue.taskRun')" />
                            <MdIconButton icon="archive" :title="t('admin.queue.archive')" :loading="acting === `arc-${tk.id}`" @click="taskAction(`arc-${tk.id}`, () => api.admin.queue.archiveTask(q.name, tk.id), 'admin.queue.taskArchived')" />
                            <MdIconButton v-if="tk.state === 'active'" icon="cancel" :title="t('admin.queue.cancel')" @click="confirm = { kind: 'cancel', task: tk }" />
                            <MdIconButton icon="delete" :title="t('admin.queue.deleteTask')" @click="confirm = { kind: 'deleteTask', queue: q.name, task: tk }" />
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div v-if="taskPages > 1" class="row gap-2 space-between" :style="{ marginTop: '12px', alignItems: 'center' }">
                  <span class="md-body-small txt-variant">{{ t('admin.queue.pageOf', { page: taskPage, pages: taskPages }) }}</span>
                  <div class="row gap-1">
                    <MdIconButton icon="chevron_left" :disabled="taskPage <= 1" :title="t('common.back')" @click="taskPage--" />
                    <MdIconButton icon="chevron_right" :disabled="taskPage >= taskPages" :title="t('common.next')" @click="taskPage++" />
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </template>

      <!-- Servers -->
      <template v-else-if="view === 'servers'">
        <div v-if="!servers.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.queue.empty') }}</div>
        <div v-else class="card card-elevated">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>{{ t('admin.queue.serverId') }}</th>
                  <th>{{ t('admin.queue.host') }}</th>
                  <th>{{ t('admin.queue.pid') }}</th>
                  <th>{{ t('admin.queue.workers') }}</th>
                  <th>{{ t('admin.queue.status') }}</th>
                  <th>{{ t('admin.queue.activeWorkers') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="sv in servers" :key="sv.id">
                  <td class="mono md-body-small">{{ sv.id.slice(0, 8) }}…</td>
                  <td class="mono">{{ sv.host }}</td>
                  <td class="mono">{{ sv.pid }}</td>
                  <td class="mono">{{ sv.active_workers?.length ?? 0 }}/{{ sv.concurrency }}</td>
                  <td><MdStatus :kind="sv.status === 'active' ? 'success' : 'neutral'">{{ sv.status }}</MdStatus></td>
                  <td class="mono">{{ sv.active_workers?.length ?? 0 }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- Scheduler -->
      <template v-else>
        <div v-if="!scheduler.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.queue.empty') }}</div>
        <div v-else class="card card-elevated">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>{{ t('admin.queue.entryId') }}</th>
                  <th>{{ t('admin.queue.spec') }}</th>
                  <th>{{ t('admin.queue.type') }}</th>
                  <th>{{ t('admin.queue.nextRun') }}</th>
                  <th>{{ t('admin.queue.prevRun') }}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <template v-for="e in scheduler" :key="e.id">
                  <tr class="row-clickable" @click="openSchedule(e.id)">
                    <td class="mono md-body-small">{{ e.id.slice(0, 8) }}…</td>
                    <td><span class="code-inline">{{ e.spec }}</span></td>
                    <td class="mono">{{ e.task_type }}</td>
                    <td class="md-body-small">{{ fmtTime(e.next) }}</td>
                    <td class="md-body-small">{{ fmtTime(e.prev) }}</td>
                    <td :style="{ textAlign: 'right' }"><MdSym :name="scheduleSelected === e.id ? 'expand_less' : 'expand_more'" :size="20" /></td>
                  </tr>
                  <tr v-if="scheduleSelected === e.id">
                    <td colspan="6" :style="{ background: 'var(--md-sys-color-surface-container-low)' }">
                      <div class="col gap-4" :style="{ padding: '8px 4px' }">
                        <!-- Entry details -->
                        <div class="col gap-2">
                          <div class="md-title-small">{{ t('admin.queue.taskDetails') }}</div>
                          <div class="kv-grid">
                            <div class="md-label-medium txt-variant">{{ t('admin.queue.entryId') }}</div>
                            <div class="mono md-body-small">{{ e.id }}</div>
                            <div class="md-label-medium txt-variant">{{ t('admin.queue.spec') }}</div>
                            <div><span class="code-inline">{{ e.spec }}</span></div>
                            <div class="md-label-medium txt-variant">{{ t('admin.queue.type') }}</div>
                            <div class="mono md-body-small">{{ e.task_type }}</div>
                            <div class="md-label-medium txt-variant">{{ t('admin.queue.payload') }}</div>
                            <div class="mono md-body-small" :style="{ wordBreak: 'break-all' }">{{ e.task_payload || t('common.dash') }}</div>
                            <div class="md-label-medium txt-variant">{{ t('admin.queue.nextRun') }}</div>
                            <div class="md-body-small">{{ fmtTime(e.next) }}</div>
                            <div class="md-label-medium txt-variant">{{ t('admin.queue.prevRun') }}</div>
                            <div class="md-body-small">{{ fmtTime(e.prev) }}</div>
                          </div>
                        </div>

                        <!-- Enqueue events -->
                        <div class="col gap-2">
                          <div class="md-title-small">{{ t('admin.queue.enqueueEvents') }}</div>
                          <div v-if="loadingEvents" class="col gap-2"><SkeletonBlock v-for="i in 3" :key="i" height="32px" /></div>
                          <div v-else-if="!eventList.length" class="md-body-medium txt-variant text-center" :style="{ padding: '12px' }">{{ t('admin.queue.noEvents') }}</div>
                          <template v-else>
                            <div class="table-wrap">
                              <table class="data-table">
                                <thead><tr><th>{{ t('admin.queue.taskId') }}</th><th>{{ t('admin.queue.enqueuedAt') }}</th></tr></thead>
                                <tbody>
                                  <tr v-for="ev in eventList" :key="ev.task_id + ev.enqueued_at">
                                    <td class="mono md-body-small">{{ ev.task_id.slice(0, 8) }}…</td>
                                    <td class="md-body-small">{{ fmtTime(ev.enqueued_at) }}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <div class="row gap-2 space-between" :style="{ marginTop: '8px', alignItems: 'center' }">
                              <span class="md-body-small txt-variant">{{ t('admin.queue.page', { page: eventPage }) }}</span>
                              <div class="row gap-1">
                                <MdIconButton icon="chevron_left" :disabled="eventPage <= 1" :title="t('common.back')" @click="eventPage--" />
                                <MdIconButton icon="chevron_right" :disabled="!eventsHasNext" :title="t('common.next')" @click="eventPage++" />
                              </div>
                            </div>
                          </template>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>

    <!-- Destructive confirmation -->
    <MdDialog :open="!!confirm" :title="confirmTitle" :submitting="submitting" @update:open="(v: boolean) => { if (!v) confirm = null }">
      <p v-if="confirm?.kind === 'deleteAll'" :style="{ margin: 0 }">{{ t('admin.queue.deleteAllBody', { queue: confirm.queue, state: t(`admin.queue.${confirm.state}`), count: confirm.count }) }}</p>
      <p v-else-if="confirm?.kind === 'cancel'" :style="{ margin: 0 }">{{ t('admin.queue.cancelBody') }}</p>
      <p v-else-if="confirm?.kind === 'deleteTask'" :style="{ margin: 0 }">{{ t('admin.queue.confirmDeleteTask') }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="submitting" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" @click="runConfirm">{{ t('common.confirm') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}
.stat-chip {
  border: none;
  background: transparent;
  border-radius: 12px;
  padding: 6px 10px;
  text-align: left;
  cursor: pointer;
  --slc: var(--md-sys-color-primary);
}
.stat-chip-on {
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
}
.stat-chip-static {
  padding: 6px 10px;
}
.txt-error { color: var(--md-sys-color-error); }
.row-clickable { cursor: pointer; }
.kv-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  align-items: baseline;
}
</style>
