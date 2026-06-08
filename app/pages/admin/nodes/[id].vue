<script setup lang="ts">
import type { AdminNode } from '~/types/admin'

definePageMeta({ middleware: 'admin', title: 'nav.admin.nodes' })

const { t } = useI18n()
const route = useRoute()
const api = useApi()
const toast = useToast()
const { fmtBytes, fmtRtt, fmtUptime, relTime, fmtDate } = useFormat()

const id = computed(() => String(route.params.id))

// The OSS center backend exposes no single-node GET — the list endpoint carries
// the full record, so we fetch the list and pick our node out of it.
const { data, pending, error, refresh } = await useAsyncData(
  () => `admin-node-${id.value}`,
  () => api.admin.nodes.list(),
  { lazy: true, server: false },
)
const node = computed<AdminNode | null>(() => (data.value ?? []).find(n => n.id === id.value) ?? null)
const notFound = computed(() => !pending.value && !error.value && !node.value)

// Convert MB-denominated backend fields into bytes for fmtBytes.
function mbBytes(mb: number | null | undefined): number | null {
  return mb == null ? null : mb * 1024 * 1024
}

const detailRows = computed(() => {
  const n = node.value
  if (!n) return []
  // [label, value, copyable]
  const rows: [string, string, boolean][] = [
    [t('admin.nodes.fId'), n.id, true],
    [t('admin.nodes.fLocation'), n.location, false],
    [t('admin.nodes.fPublicIp'), n.public_ip, true],
    [t('admin.nodes.asn'), `AS${n.our_asn}`, false],
    [t('admin.nodes.fLla'), n.our_lla, true],
    [t('admin.nodes.fPubkey'), n.our_wg_pubkey, true],
    [t('admin.nodes.peers'), String(n.active_peers), false],
    [t('admin.nodes.avgRtt'), n.avg_rtt_ms != null ? `${fmtRtt(n.avg_rtt_ms)} ${t('common.ms')}` : t('common.dash'), false],
    [t('admin.nodes.rxTotal'), n.total_rx_mb != null ? fmtBytes(mbBytes(n.total_rx_mb)) : t('common.dash'), false],
    [t('admin.nodes.txTotal'), n.total_tx_mb != null ? fmtBytes(mbBytes(n.total_tx_mb)) : t('common.dash'), false],
    [t('admin.nodes.agentVersion'), n.agent_version ? `v${n.agent_version}` : t('common.dash'), false],
    [t('admin.nodes.agentState'), n.agent_state || t('common.dash'), false],
    [t('admin.nodes.uptime'), fmtUptime(n.uptime_secs), false],
    [t('admin.nodes.memAlloc'), n.mem_alloc_mb != null ? `${n.mem_alloc_mb.toFixed(1)} MB` : t('common.dash'), false],
    [t('admin.nodes.memSys'), n.mem_sys_mb != null ? `${n.mem_sys_mb.toFixed(1)} MB` : t('common.dash'), false],
    [t('admin.nodes.goroutines'), n.num_goroutine != null ? String(n.num_goroutine) : t('common.dash'), false],
    [t('admin.nodes.lastSeen'), n.last_seen ? relTime(n.last_seen) : t('common.dash'), false],
    [t('admin.nodes.created'), fmtDate(n.created_at), false],
  ]
  if (n.auth_mode) rows.push([t('admin.nodes.authMode'), n.auth_mode, false])
  return rows
})

const runtimeTiles = computed(() => {
  const n = node.value
  return [
    { icon: 'network_ping', label: t('admin.nodes.avgRtt'), value: n?.avg_rtt_ms != null ? fmtRtt(n.avg_rtt_ms) : t('common.dash'), unit: n?.avg_rtt_ms != null ? t('common.ms') : '', tone: 'primary' },
    { icon: 'group', label: t('admin.nodes.peers'), value: String(n?.active_peers ?? 0), unit: '', tone: 'tertiary' },
    { icon: 'schedule', label: t('admin.nodes.uptime'), value: fmtUptime(n?.uptime_secs), unit: '', tone: 'secondary' },
  ]
})

// ── Shared submit state for every action/dialog ───────────────────────────────
const submitting = ref(false)

// ── Edit ──────────────────────────────────────────────────────────────────────
const showEdit = ref(false)
const editForm = reactive({ name: '', location: '', public_ip: '', our_lla: '', our_wg_pubkey: '', enabled: true })
function openEdit() {
  const n = node.value
  if (!n) return
  Object.assign(editForm, {
    name: n.name, location: n.location, public_ip: n.public_ip,
    our_lla: n.our_lla, our_wg_pubkey: n.our_wg_pubkey, enabled: n.enabled,
  })
  showEdit.value = true
}
async function saveEdit() {
  const n = node.value
  if (!n || submitting.value) return
  submitting.value = true
  try {
    await api.admin.nodes.update(n.id, { ...editForm })
    toast.show(t('admin.nodes.updated'))
    showEdit.value = false
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

// ── Import peers (structured result card) ─────────────────────────────────────
const importResult = ref<{ inserted: number, skipped: number, db_errors: number, total: number } | null>(null)
async function doImport() {
  const n = node.value
  if (!n || submitting.value) return
  submitting.value = true
  try {
    const r = await api.admin.nodes.importPeers(n.id)
    importResult.value = r
    toast.show(t('admin.nodes.imported', { n: r.inserted }))
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

async function doBirdRefresh() {
  const n = node.value
  if (!n || submitting.value) return
  submitting.value = true
  try {
    const r = await api.admin.nodes.birdRefresh(n.id)
    toast.show(t('admin.nodes.refreshed', { n: r.updated }))
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

// ── Update agent ──────────────────────────────────────────────────────────────
const showUpdate = ref(false)
const updateVersion = ref('')
function openUpdate() {
  updateVersion.value = ''
  showUpdate.value = true
}
const updateArmed = computed(() => {
  const v = updateVersion.value.trim()
  return !!v && v !== (node.value?.agent_version ?? '')
})
async function doUpdate() {
  const n = node.value
  if (!n || !updateArmed.value || submitting.value) return
  submitting.value = true
  try {
    await api.admin.nodes.updateAgent(n.id, { version: updateVersion.value.trim() })
    toast.show(t('admin.nodes.agentUpdating'))
    showUpdate.value = false
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

// ── Rollback (confirmed) ──────────────────────────────────────────────────────
const showRollback = ref(false)
async function doRollback() {
  const n = node.value
  if (!n || submitting.value) return
  submitting.value = true
  try {
    await api.admin.nodes.rollback(n.id)
    toast.show(t('admin.nodes.rolledBack'))
    showRollback.value = false
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

// ── Regenerate token (confirmed → reveal new token) ───────────────────────────
const showRegen = ref(false)
const tokenDialog = ref<{ title: string, token: string } | null>(null)
async function doRegen() {
  const n = node.value
  if (!n || submitting.value) return
  submitting.value = true
  try {
    const r = await api.admin.nodes.regenerateToken(n.id)
    showRegen.value = false
    tokenDialog.value = { title: t('admin.nodes.tokenTitle'), token: r.agent_token }
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

// ── Reset pubkey (confirmed) ──────────────────────────────────────────────────
const showReset = ref(false)
async function doReset() {
  const n = node.value
  if (!n || submitting.value) return
  submitting.value = true
  try {
    await api.admin.nodes.resetPubkey(n.id)
    toast.show(t('admin.nodes.pubkeyReset'))
    showReset.value = false
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

// ── Delete (type-to-confirm, then back to list) ───────────────────────────────
const showDelete = ref(false)
const deleteConfirm = ref('')
const deleteArmed = computed(() => deleteConfirm.value.trim().toLowerCase() === 'delete')
function openDelete() {
  deleteConfirm.value = ''
  showDelete.value = true
}
async function doDelete() {
  const n = node.value
  if (!n || !deleteArmed.value || submitting.value) return
  submitting.value = true
  try {
    await api.admin.nodes.remove(n.id)
    toast.show(t('admin.nodes.deleted'))
    await navigateTo('/admin/nodes')
  }
  catch (e) {
    toast.error(e)
    submitting.value = false
  }
}
</script>

<template>
  <div class="col gap-5">
    <AppBreadcrumb :items="[{ label: t('nav.admin.nodes'), to: '/admin/nodes' }, { label: node?.name || '…' }]" />

    <div v-if="data === null && !error" class="col gap-3">
      <SkeletonBlock height="80px" radius="16px" />
      <SkeletonBlock height="320px" radius="16px" />
    </div>

    <div v-else-if="notFound" class="card card-outlined card-pad text-center col gap-3" :style="{ alignItems: 'center', padding: '56px 24px' }">
      <MdSym name="search_off" :size="40" class="txt-variant" />
      <h2 class="md-headline-small" :style="{ margin: 0 }">{{ t('admin.nodes.notFound') }}</h2>
      <p class="md-body-medium txt-variant" :style="{ margin: 0 }">{{ t('admin.nodes.notFoundBody') }}</p>
      <MdButton variant="tonal" icon="arrow_back" @click="navigateTo('/admin/nodes')">{{ t('admin.nodes.backToList') }}</MdButton>
    </div>

    <template v-else-if="node">
      <!-- Header -->
      <div class="row gap-4 flex-wrap">
        <span :style="{ display: 'inline-flex', width: '56px', height: '56px', borderRadius: '16px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }">
          <MdSym name="dns" :size="28" fill />
        </span>
        <div :style="{ flex: 1, minWidth: 0 }">
          <h1 class="md-headline-medium" :style="{ margin: 0 }">{{ node.name }}</h1>
          <div class="md-body-medium txt-variant" :style="{ marginTop: '4px' }">{{ node.location }} · <span class="mono">AS{{ node.our_asn }}</span></div>
        </div>
        <MdStatus :kind="node.online ? 'success' : 'neutral'">{{ node.online ? t('admin.nodes.online') : t('admin.nodes.offline') }}</MdStatus>
        <div class="row gap-2">
          <MdIconButton icon="edit" variant="tonal" :title="t('common.edit')" @click="openEdit" />
          <MdIconButton icon="delete" :title="t('admin.nodes.deleteNode')" @click="openDelete" />
        </div>
      </div>

      <!-- Runtime tiles -->
      <div class="metric-3">
        <div v-for="m in runtimeTiles" :key="m.label" class="card card-elevated metric-tile">
          <div class="metric-label md-label-large">
            <MdSym :name="m.icon" :size="20" :style="{ color: m.tone === 'secondary' ? 'var(--md-sys-color-on-surface-variant)' : `var(--md-sys-color-${m.tone})` }" fill />
            {{ m.label }}
          </div>
          <div class="metric-value md-headline-small" :style="{ marginTop: '10px' }">
            {{ m.value }}<span v-if="m.unit" class="md-title-medium txt-variant" :style="{ marginLeft: '4px' }">{{ m.unit }}</span>
          </div>
        </div>
      </div>

      <!-- Detail rows -->
      <div class="card card-elevated card-pad">
        <h2 class="md-title-large" :style="{ margin: '0 0 12px' }">{{ t('admin.nodes.nodeDetails') }}</h2>
        <div class="col">
          <div
            v-for="(row, i) in detailRows" :key="row[0]"
            class="row gap-4"
            :style="{ padding: '14px 0', borderBottom: i < detailRows.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none' }"
          >
            <div class="md-body-medium txt-variant" :style="{ width: '170px', flexShrink: 0 }">{{ row[0] }}</div>
            <div class="md-body-medium row gap-2" :class="{ mono: row[2] }" :style="{ flex: 1, wordBreak: 'break-all', alignItems: 'center' }">
              <span>{{ row[1] }}</span>
              <MdCopyButton v-if="row[2] && row[1] !== t('common.dash')" :value="row[1]" :size="28" />
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="card card-elevated card-pad">
        <h2 class="md-title-large" :style="{ margin: '0 0 4px' }">{{ t('admin.nodes.actions') }}</h2>
        <p class="md-body-small txt-variant" :style="{ margin: '0 0 14px' }">{{ t('admin.nodes.actionsSub') }}</p>
        <div class="row gap-3 flex-wrap">
          <MdButton variant="tonal" icon="download" :disabled="submitting" @click="doImport">{{ t('admin.nodes.importPeers') }}</MdButton>
          <MdButton variant="tonal" icon="refresh" :disabled="submitting" @click="doBirdRefresh">{{ t('admin.nodes.birdRefresh') }}</MdButton>
          <MdButton variant="outlined" icon="upgrade" :disabled="submitting" @click="openUpdate">{{ t('admin.nodes.updateAgent') }}</MdButton>
          <MdButton variant="outlined" icon="history" :disabled="submitting" @click="showRollback = true">{{ t('admin.nodes.rollback') }}</MdButton>
          <MdButton variant="outlined" icon="key" :disabled="submitting" @click="showRegen = true">{{ t('admin.nodes.regenToken') }}</MdButton>
          <MdButton variant="outlined" icon="lock_reset" :disabled="submitting" @click="showReset = true">{{ t('admin.nodes.resetPubkey') }}</MdButton>
        </div>
      </div>

      <!-- Import result -->
      <div v-if="importResult" class="card card-outlined card-pad">
        <h2 class="md-title-large" :style="{ margin: '0 0 12px' }">{{ t('admin.nodes.importResult') }}</h2>
        <div class="row gap-4 flex-wrap">
          <div class="col gap-1"><span class="md-headline-small">{{ importResult.inserted }}</span><span class="md-body-small txt-variant">{{ t('admin.nodes.inserted') }}</span></div>
          <div class="col gap-1"><span class="md-headline-small">{{ importResult.skipped }}</span><span class="md-body-small txt-variant">{{ t('admin.nodes.skipped') }}</span></div>
          <div class="col gap-1"><span class="md-headline-small">{{ importResult.db_errors }}</span><span class="md-body-small txt-variant">{{ t('admin.nodes.dbErrors') }}</span></div>
          <div class="col gap-1"><span class="md-headline-small">{{ importResult.total }}</span><span class="md-body-small txt-variant">{{ t('admin.nodes.total') }}</span></div>
        </div>
      </div>
    </template>

    <!-- Edit -->
    <MdDialog v-model:open="showEdit" :title="t('admin.nodes.editTitle')" :submitting="submitting">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <MdTextField :label="t('admin.nodes.fName')" :model-value="editForm.name" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (editForm.name = v)" />
        <MdTextField :label="t('admin.nodes.fLocation')" :model-value="editForm.location" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (editForm.location = v)" />
        <MdTextField :label="t('admin.nodes.fPublicIp')" :model-value="editForm.public_ip" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (editForm.public_ip = v)" />
        <MdTextField :label="t('admin.nodes.fLla')" :model-value="editForm.our_lla" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (editForm.our_lla = v)" />
        <MdTextField :label="t('admin.nodes.fPubkey')" :model-value="editForm.our_wg_pubkey" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (editForm.our_wg_pubkey = v)" />
        <label class="row gap-3" :style="{ cursor: 'pointer' }">
          <MdSwitch :model-value="editForm.enabled" @update:model-value="(v: boolean) => (editForm.enabled = v)" />
          <span class="md-body-medium">{{ t('common.enabled') }}</span>
        </label>
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="save" :loading="submitting" @click="saveEdit">{{ t('common.save') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Update agent -->
    <MdDialog v-model:open="showUpdate" :title="t('admin.nodes.updateTitle')" :submitting="submitting">
      <MdTextField
        :label="t('admin.nodes.version')" :model-value="updateVersion" mono
        :placeholder="t('admin.nodes.versionPlaceholder')" :supporting="t('admin.nodes.versionHint')"
        tf-bg="var(--md-sys-color-surface-container-high)"
        @update:model-value="(v: string) => (updateVersion = v)"
      />
      <p v-if="node?.agent_version" class="md-body-small txt-variant" :style="{ margin: '8px 0 0' }">
        {{ t('admin.nodes.currentVersion', { v: node.agent_version }) }}
      </p>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="upgrade" :disabled="!updateArmed" :loading="submitting" @click="doUpdate">{{ t('admin.nodes.updateAgent') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Rollback -->
    <MdDialog v-model:open="showRollback" :title="t('admin.nodes.rollbackTitle')" :submitting="submitting">
      <div
        class="row gap-3"
        :style="{ alignItems: 'flex-start', padding: '14px', borderRadius: '12px', background: 'var(--md-sys-color-warning-container)', color: 'var(--md-sys-color-on-warning-container)' }"
      >
        <MdSym name="warning" :size="20" fill />
        <span class="md-body-medium">{{ t('admin.nodes.rollbackBody', { name: node?.name }) }}</span>
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="history" :loading="submitting" @click="doRollback">{{ t('admin.nodes.rollback') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Regenerate token -->
    <MdDialog v-model:open="showRegen" :title="t('admin.nodes.regenTitle')" :submitting="submitting">
      <div
        class="row gap-3"
        :style="{ alignItems: 'flex-start', padding: '14px', borderRadius: '12px', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }"
      >
        <MdSym name="warning" :size="20" fill />
        <span class="md-body-medium">{{ t('admin.nodes.regenWarning', { name: node?.name }) }}</span>
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" :loading="submitting" @click="doRegen">{{ t('admin.nodes.regenToken') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Reset pubkey -->
    <MdDialog v-model:open="showReset" :title="t('admin.nodes.resetTitle')" :submitting="submitting">
      <div
        class="row gap-3"
        :style="{ alignItems: 'flex-start', padding: '14px', borderRadius: '12px', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }"
      >
        <MdSym name="warning" :size="20" fill />
        <span class="md-body-medium">{{ t('admin.nodes.resetWarning', { name: node?.name }) }}</span>
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" :loading="submitting" @click="doReset">{{ t('admin.nodes.resetPubkey') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Delete (type-to-confirm) -->
    <MdDialog v-model:open="showDelete" :title="t('admin.nodes.deleteNode')" :submitting="submitting">
      <div class="col gap-4" :style="{ marginTop: '4px' }">
        <div
          class="row gap-3"
          :style="{ alignItems: 'flex-start', padding: '14px', borderRadius: '12px', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }"
        >
          <MdSym name="warning" :size="20" fill />
          <span class="md-body-medium">{{ t('admin.nodes.deleteBody2', { name: node?.name }) }}</span>
        </div>
        <MdTextField
          :model-value="deleteConfirm" :label="t('admin.nodes.deleteConfirmLabel')"
          :placeholder="t('admin.nodes.deleteConfirmPlaceholder')" mono
          tf-bg="var(--md-sys-color-surface-container-high)"
          @update:model-value="(v: string) => (deleteConfirm = v)"
        />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" :disabled="!deleteArmed" :loading="submitting" @click="doDelete">{{ t('common.delete') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Token reveal -->
    <MdDialog :open="!!tokenDialog" :title="tokenDialog?.title" @update:open="(v: boolean) => { if (!v) tokenDialog = null }">
      <p :style="{ margin: '0 0 12px' }">{{ t('admin.nodes.tokenBody') }}</p>
      <div class="code-block row gap-2" :style="{ alignItems: 'flex-start', wordBreak: 'break-all', whiteSpace: 'normal' }">
        <span :style="{ flex: 1 }">{{ tokenDialog?.token }}</span>
        <MdCopyButton v-if="tokenDialog" :value="tokenDialog.token" :size="32" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="filled" @click="close">{{ t('common.close') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
