<script setup lang="ts">
import type { QueueSnapshot, TaskState } from '~/types/admin'

definePageMeta({ middleware: 'admin', title: 'nav.admin.queue' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const { fmtBytes, relTime } = useFormat()

const view = ref<'queues' | 'servers' | 'scheduler'>('queues')
const viewOptions = computed(() => [
  { value: 'queues', label: t('admin.queue.queues'), icon: 'lists' },
  { value: 'servers', label: t('admin.queue.servers'), icon: 'dns' },
  { value: 'scheduler', label: t('admin.queue.scheduler'), icon: 'schedule' },
])

const { data: overview, pending, refresh } = await useAsyncData('admin-queue', () => api.admin.queue.overview())
const available = computed(() => overview.value?.available !== false && overview.value?.enabled !== false)
const queues = computed(() => overview.value?.queues ?? [])
const servers = computed(() => overview.value?.servers ?? [])
const scheduler = computed(() => overview.value?.scheduler_entries ?? [])

const busy = ref<string | null>(null)
async function togglePause(q: QueueSnapshot) {
  busy.value = q.name
  try {
    await (q.paused ? api.admin.queue.resume(q.name) : api.admin.queue.pause(q.name))
    toast.show(t(q.paused ? 'admin.queue.resumed' : 'admin.queue.wasPaused'))
    await refresh()
  } catch (e) { toast.error(e) } finally { busy.value = null }
}

// Task drill-down
const selected = ref<string | null>(null)
const taskState = ref<TaskState>('pending')
const { data: taskList, pending: loadingTasks, refresh: refreshTasks } = await useAsyncData(
  'admin-queue-tasks',
  () => selected.value ? api.admin.queue.tasks(selected.value, taskState.value, 1, 25) : Promise.resolve(null),
  { watch: [selected, taskState] },
)
const stateOptions = computed(() => (['pending', 'active', 'scheduled', 'retry', 'archived', 'completed'] as TaskState[]).map((s) => ({ value: s, label: t(`admin.queue.${s}`) })))

async function taskAction(fn: () => Promise<unknown>, msg: string) {
  try { await fn(); toast.show(t(msg)); await refreshTasks() } catch (e) { toast.error(e) }
}

function statChip(q: QueueSnapshot) {
  return [
    { label: t('admin.queue.pending'), v: q.pending },
    { label: t('admin.queue.active'), v: q.active },
    { label: t('admin.queue.scheduled'), v: q.scheduled },
    { label: t('admin.queue.retry'), v: q.retry },
    { label: t('admin.queue.archived'), v: q.archived },
  ]
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="lists" :title="t('admin.queue.title')" :subtitle="t('admin.queue.subtitle')">
      <template #action>
        <MdIconButton icon="refresh" :title="t('common.refresh')" @click="refresh()" />
      </template>
    </PageHeader>

    <div v-if="pending" class="col gap-3"><SkeletonBlock v-for="i in 3" :key="i" height="100px" radius="12px" /></div>
    <div v-else-if="!available" class="card card-outlined card-pad text-center txt-variant col gap-3" :style="{ alignItems: 'center', padding: '48px 24px' }">
      <MdSym name="cloud_off" :size="40" />
      <p :style="{ margin: 0, maxWidth: '420px' }">{{ t('admin.queue.unavailable') }}</p>
    </div>

    <template v-else>
      <MdSegmented v-model="view" :options="viewOptions" />

      <!-- Queues -->
      <template v-if="view === 'queues'">
        <div class="col gap-3">
          <div v-for="q in queues" :key="q.name" class="card card-elevated card-pad">
            <div class="row space-between flex-wrap gap-3" :style="{ alignItems: 'center' }">
              <div class="row gap-3" :style="{ alignItems: 'center' }">
                <span class="md-title-medium mono">{{ q.name }}</span>
                <MdStatus v-if="q.paused" kind="warning">{{ t('admin.queue.paused') }}</MdStatus>
              </div>
              <div class="row gap-2">
                <MdButton variant="text" :icon="q.paused ? 'play_arrow' : 'pause'" :loading="busy === q.name" @click="togglePause(q)">{{ q.paused ? t('admin.queue.resume') : t('admin.queue.pause') }}</MdButton>
                <MdButton variant="tonal" icon="list" @click="selected = selected === q.name ? null : q.name">{{ t('admin.queue.tasks') }}</MdButton>
              </div>
            </div>
            <div class="row gap-4 flex-wrap" :style="{ marginTop: '14px' }">
              <div v-for="s in statChip(q)" :key="s.label">
                <div class="md-label-medium txt-variant">{{ s.label }}</div>
                <div class="md-title-medium">{{ s.v }}</div>
              </div>
              <div>
                <div class="md-label-medium txt-variant">{{ t('admin.queue.processed') }} / {{ t('admin.queue.failed') }}</div>
                <div class="md-title-medium mono">{{ q.processed }} / {{ q.failed }}</div>
              </div>
              <div>
                <div class="md-label-medium txt-variant">{{ t('admin.queue.memory') }}</div>
                <div class="md-title-medium mono">{{ fmtBytes(q.memory_usage_bytes) }}</div>
              </div>
            </div>

            <!-- Tasks panel -->
            <div v-if="selected === q.name" :style="{ marginTop: '16px', borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '16px' }">
              <div class="row space-between flex-wrap gap-3" :style="{ marginBottom: '12px' }">
                <MdSegmented v-model="taskState" :options="stateOptions" />
                <MdButton v-if="['pending','scheduled','retry','archived'].includes(taskState)" variant="text" icon="delete_sweep" @click="taskAction(() => api.admin.queue.deleteAll(q.name, taskState), 'admin.queue.taskDeleted')">{{ t('admin.queue.deleteAll') }}</MdButton>
              </div>
              <div v-if="loadingTasks" class="col gap-2"><SkeletonBlock v-for="i in 3" :key="i" height="40px" /></div>
              <div v-else-if="!taskList?.tasks.length" class="md-body-medium txt-variant text-center" :style="{ padding: '16px' }">{{ t('admin.queue.empty') }}</div>
              <div v-else class="table-wrap">
                <table class="data-table">
                  <thead><tr><th>{{ t('admin.queue.type') }}</th><th>ID</th><th>{{ t('admin.queue.lastError') }}</th><th :style="{ textAlign: 'right' }">{{ t('admin.queue.actions') }}</th></tr></thead>
                  <tbody>
                    <tr v-for="tk in taskList.tasks" :key="tk.id">
                      <td class="mono">{{ tk.type }}</td>
                      <td class="mono md-body-small">{{ tk.id.slice(0, 10) }}…</td>
                      <td class="md-body-small txt-variant" :style="{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis' }">{{ tk.last_error || t('common.dash') }}</td>
                      <td>
                        <div class="row gap-1" :style="{ justifyContent: 'flex-end' }">
                          <MdIconButton v-if="['scheduled','retry','archived'].includes(tk.state)" icon="play_arrow" :title="t('admin.queue.run')" @click="taskAction(() => api.admin.queue.runTask(q.name, tk.id), 'admin.queue.taskRun')" />
                          <MdIconButton v-if="tk.state !== 'archived' && tk.state !== 'active'" icon="archive" :title="t('admin.queue.archive')" @click="taskAction(() => api.admin.queue.archiveTask(q.name, tk.id), 'admin.queue.taskArchived')" />
                          <MdIconButton v-if="tk.state === 'active'" icon="cancel" :title="t('admin.queue.cancel')" @click="taskAction(() => api.admin.queue.cancelActive(tk.id), 'admin.queue.taskDeleted')" />
                          <MdIconButton icon="delete" :title="t('admin.queue.deleteTask')" @click="taskAction(() => api.admin.queue.deleteTask(q.name, tk.id), 'admin.queue.taskDeleted')" />
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Servers -->
      <template v-else-if="view === 'servers'">
        <div v-if="!servers.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.queue.empty') }}</div>
        <div v-else class="col gap-3">
          <div v-for="sv in servers" :key="sv.id" class="card card-elevated card-pad">
            <div class="row space-between flex-wrap gap-3">
              <div>
                <div class="md-title-medium mono">{{ sv.host }} · PID {{ sv.pid }}</div>
                <div class="md-body-small txt-variant">{{ t('admin.queue.workers') }} {{ sv.active_workers?.length ?? 0 }}/{{ sv.concurrency }} · {{ relTime(sv.started_at) }}</div>
              </div>
              <MdStatus :kind="sv.status === 'active' ? 'success' : 'neutral'">{{ sv.status }}</MdStatus>
            </div>
          </div>
        </div>
      </template>

      <!-- Scheduler -->
      <template v-else>
        <div v-if="!scheduler.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.queue.empty') }}</div>
        <div v-else class="card card-elevated">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>{{ t('admin.queue.spec') }}</th><th>{{ t('admin.queue.type') }}</th><th>{{ t('admin.queue.nextRun') }}</th></tr></thead>
              <tbody>
                <tr v-for="e in scheduler" :key="e.id">
                  <td class="mono">{{ e.spec }}</td>
                  <td class="mono">{{ e.task_type }}</td>
                  <td>{{ relTime(e.next) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
