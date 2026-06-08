<script setup lang="ts">
import type { AdminNode } from '~/types/admin'

definePageMeta({ middleware: 'admin', title: 'nav.admin.nodes' })

// This page acts as the parent route for /admin/nodes and /admin/nodes/[id].
// When a child (detail) route is active, render only <NuxtPage>; otherwise the
// list below. (Nuxt nests `nodes.vue` + `nodes/[id].vue` as parent/child.)
const route = useRoute()
const isDetail = computed(() => route.matched.length > 1)

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const { fmtUptime } = useFormat()

const { data, pending, refresh } = await useAsyncData('admin-nodes', () => api.admin.nodes.list(), { lazy: true, server: false })
const nodes = computed(() => data.value ?? [])

// ── Filters (client-side over the fetched list) ───────────────────────────────
const search = ref('')
const onlineFilter = ref<'' | 'online' | 'offline'>('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return nodes.value.filter((n) => {
    const statusOk = !onlineFilter.value || (onlineFilter.value === 'online' ? n.online : !n.online)
    const text = [n.name, n.location, n.public_ip].join(' ').toLowerCase()
    return statusOk && (!q || text.includes(q))
  })
})

const busy = ref<string | null>(null)
const openMenu = ref<string | null>(null)

// ── Dialog state ──────────────────────────────────────────────────────────────
const showCreate = ref(false)
const editFor = ref<AdminNode | null>(null)
const deleteFor = ref<AdminNode | null>(null)
const updateFor = ref<AdminNode | null>(null)
const regenFor = ref<AdminNode | null>(null)
const resetFor = ref<AdminNode | null>(null)
const rollbackFor = ref<AdminNode | null>(null)
const tokenDialog = ref<{ title: string, token: string } | null>(null)

const submitting = ref(false)

const form = reactive({ name: '', location: '', public_ip: '', our_lla: '', our_wg_pubkey: '', our_asn: '' })
const editForm = reactive({ name: '', location: '', public_ip: '', our_lla: '', our_wg_pubkey: '', enabled: true })
const updateVersion = ref('')
const deleteConfirm = ref('')

// Row-level menu actions (import / bird-refresh) keep the row's busy spinner and
// surface a result toast, then refresh the list.
async function act<T>(id: string, fn: () => Promise<T>, after?: (r: T) => void) {
  busy.value = id; openMenu.value = null
  try {
    const r = await fn()
    if (after) after(r)
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    busy.value = null
  }
}

// ── Create ────────────────────────────────────────────────────────────────────
const createValid = computed(() =>
  !!form.name && !!form.location && !!form.public_ip && !!form.our_lla && !!form.our_wg_pubkey,
)
async function doCreate() {
  if (!createValid.value || submitting.value) return
  submitting.value = true
  try {
    const r = await api.admin.nodes.create({
      name: form.name,
      location: form.location,
      public_ip: form.public_ip,
      our_lla: form.our_lla,
      our_wg_pubkey: form.our_wg_pubkey,
      our_asn: form.our_asn ? Number(form.our_asn) : undefined,
    })
    // Success: surface the one-time agent token, reset + close.
    tokenDialog.value = { title: t('admin.nodes.tokenTitle'), token: r.agent_token }
    toast.show(t('admin.nodes.created'))
    Object.assign(form, { name: '', location: '', public_ip: '', our_lla: '', our_wg_pubkey: '', our_asn: '' })
    showCreate.value = false
    await refresh()
  }
  catch (e) {
    // Keep the dialog open with typed values preserved on failure.
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

// ── Edit ──────────────────────────────────────────────────────────────────────
function openEdit(n: AdminNode) {
  editFor.value = n; openMenu.value = null
  Object.assign(editForm, {
    name: n.name, location: n.location, public_ip: n.public_ip,
    our_lla: n.our_lla, our_wg_pubkey: n.our_wg_pubkey, enabled: n.enabled,
  })
}
async function doEdit() {
  const n = editFor.value
  if (!n || submitting.value) return
  submitting.value = true
  try {
    await api.admin.nodes.update(n.id, { ...editForm })
    toast.show(t('admin.nodes.updated'))
    editFor.value = null
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

// ── Delete (type-to-confirm friction) ─────────────────────────────────────────
function openDelete(n: AdminNode) {
  deleteFor.value = n; openMenu.value = null; deleteConfirm.value = ''
}
const deleteArmed = computed(() => deleteConfirm.value.trim().toLowerCase() === 'delete')
async function doDelete() {
  const n = deleteFor.value
  if (!n || !deleteArmed.value || submitting.value) return
  submitting.value = true
  try {
    await api.admin.nodes.remove(n.id)
    toast.show(t('admin.nodes.deleted'))
    deleteFor.value = null
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
function openUpdate(n: AdminNode) {
  updateFor.value = n; openMenu.value = null; updateVersion.value = ''
}
// Require a target version that differs from the running one — no no-op rollouts.
const updateArmed = computed(() => {
  const v = updateVersion.value.trim()
  return !!v && v !== (updateFor.value?.agent_version ?? '')
})
async function doUpdateAgent() {
  const n = updateFor.value
  if (!n || !updateArmed.value || submitting.value) return
  submitting.value = true
  try {
    await api.admin.nodes.updateAgent(n.id, { version: updateVersion.value.trim() })
    toast.show(t('admin.nodes.agentUpdating'))
    updateFor.value = null
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
function openRollback(n: AdminNode) {
  rollbackFor.value = n; openMenu.value = null
}
async function doRollback() {
  const n = rollbackFor.value
  if (!n || submitting.value) return
  submitting.value = true
  try {
    await api.admin.nodes.rollback(n.id)
    toast.show(t('admin.nodes.rolledBack'))
    rollbackFor.value = null
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

// ── Regenerate token (confirmed — invalidates the live agent token) ───────────
function openRegen(n: AdminNode) {
  regenFor.value = n; openMenu.value = null
}
async function doRegen() {
  const n = regenFor.value
  if (!n || submitting.value) return
  submitting.value = true
  try {
    const r = await api.admin.nodes.regenerateToken(n.id)
    regenFor.value = null
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

// ── Reset pubkey (confirmed — clears the node WG pubkey) ──────────────────────
function openReset(n: AdminNode) {
  resetFor.value = n; openMenu.value = null
}
async function doReset() {
  const n = resetFor.value
  if (!n || submitting.value) return
  submitting.value = true
  try {
    await api.admin.nodes.resetPubkey(n.id)
    toast.show(t('admin.nodes.pubkeyReset'))
    resetFor.value = null
    await refresh()
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    submitting.value = false
  }
}

function goDetail(n: AdminNode) {
  navigateTo(`/admin/nodes/${n.id}`)
}
</script>

<template>
  <NuxtPage v-if="isDetail" />
  <div v-else class="col gap-5">
    <PageHeader icon="dns" :title="t('admin.nodes.title')" :subtitle="t('admin.nodes.subtitle')">
      <template #action>
        <MdButton variant="filled" icon="add" @click="showCreate = true">{{ t('admin.nodes.create') }}</MdButton>
      </template>
    </PageHeader>

    <!-- Search + online filter -->
    <div class="card card-outlined card-pad row gap-3 flex-wrap" :style="{ alignItems: 'center' }">
      <MdTextField
        :model-value="search" :label="t('common.search')" icon="search"
        :style="{ flex: '1 1 240px' }" tf-bg="var(--md-sys-color-surface-container-high)"
        @update:model-value="(v: string) => (search = v)"
      />
      <MdSegmented
        :model-value="onlineFilter"
        :options="[
          { value: '', label: t('admin.nodes.allStatuses') },
          { value: 'online', label: t('admin.nodes.online') },
          { value: 'offline', label: t('admin.nodes.offline') },
        ]"
        @update:model-value="(v: string) => (onlineFilter = v as '' | 'online' | 'offline')"
      />
    </div>

    <div v-if="data === null" class="col gap-3">
      <SkeletonBlock v-for="i in 3" :key="i" height="64px" radius="12px" />
    </div>
    <div v-else-if="!nodes.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.nodes.empty') }}</div>
    <div v-else-if="!filtered.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.nodes.noMatch') }}</div>

    <div v-else class="card card-elevated">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ t('admin.nodes.name') }}</th>
              <th>{{ t('admin.nodes.location') }}</th>
              <th>{{ t('admin.nodes.publicIp') }}</th>
              <th>{{ t('admin.nodes.asn') }}</th>
              <th>{{ t('admin.nodes.peers') }}</th>
              <th>{{ t('admin.nodes.agent') }}</th>
              <th>{{ t('admin.nodes.status') }}</th>
              <th :style="{ textAlign: 'right' }">{{ t('admin.nodes.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="n in filtered" :key="n.id"
              class="row-clickable"
              @click="goDetail(n)"
            >
              <td :style="{ fontWeight: 500 }">{{ n.name }}</td>
              <td>{{ n.location }}</td>
              <td><span class="code-inline">{{ n.public_ip }}</span></td>
              <td class="mono">AS{{ n.our_asn }}</td>
              <td>{{ n.active_peers }}</td>
              <td>
                <span class="mono md-body-small">{{ n.agent_version || t('common.dash') }}</span>
                <span v-if="n.uptime_secs" class="md-body-small txt-variant"> · {{ fmtUptime(n.uptime_secs) }}</span>
              </td>
              <td>
                <MdStatus v-if="n.online" kind="success">{{ t('admin.nodes.online') }}</MdStatus>
                <MdStatus v-else kind="neutral">{{ t('admin.nodes.offline') }}</MdStatus>
              </td>
              <td @click.stop>
                <div class="row gap-2" :style="{ justifyContent: 'flex-end' }">
                  <MdIconButton icon="edit" :title="t('common.edit')" :disabled="busy === n.id" @click="openEdit(n)" />
                  <MdMenu :open="openMenu === n.id" @update:open="(v: boolean) => (openMenu = v ? n.id : null)">
                    <template #trigger>
                      <MdIconButton icon="more_vert" :title="t('admin.nodes.actions')" :loading="busy === n.id" @click="openMenu = openMenu === n.id ? null : n.id" />
                    </template>
                    <button v-ripple type="button" class="menu-item" @click="act(n.id, () => api.admin.nodes.importPeers(n.id), (r) => toast.show(t('admin.nodes.imported', { n: r.inserted })))"><MdSym name="download" /> <span>{{ t('admin.nodes.importPeers') }}</span></button>
                    <button v-ripple type="button" class="menu-item" @click="act(n.id, () => api.admin.nodes.birdRefresh(n.id), (r) => toast.show(t('admin.nodes.refreshed', { n: r.updated })))"><MdSym name="refresh" /> <span>{{ t('admin.nodes.birdRefresh') }}</span></button>
                    <button v-ripple type="button" class="menu-item" @click="openUpdate(n)"><MdSym name="upgrade" /> <span>{{ t('admin.nodes.updateAgent') }}</span></button>
                    <button v-ripple type="button" class="menu-item" @click="openRollback(n)"><MdSym name="history" /> <span>{{ t('admin.nodes.rollback') }}</span></button>
                    <button v-ripple type="button" class="menu-item" @click="openRegen(n)"><MdSym name="key" /> <span>{{ t('admin.nodes.regenToken') }}</span></button>
                    <button v-ripple type="button" class="menu-item" @click="openReset(n)"><MdSym name="lock_reset" /> <span>{{ t('admin.nodes.resetPubkey') }}</span></button>
                    <hr class="md-divider" :style="{ margin: '4px 0' }">
                    <button v-ripple type="button" class="menu-item" :style="{ color: 'var(--md-sys-color-error)' }" @click="openDelete(n)"><MdSym name="delete" /> <span>{{ t('admin.nodes.deleteNode') }}</span></button>
                  </MdMenu>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create -->
    <MdDialog :open="showCreate" :title="t('admin.nodes.createTitle')" :submitting="submitting" @update:open="(v: boolean) => { if (!v) showCreate = false }">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <MdTextField :label="t('admin.nodes.fName')" :model-value="form.name" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.name = v)" />
        <MdTextField :label="t('admin.nodes.fLocation')" :model-value="form.location" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.location = v)" />
        <MdTextField :label="t('admin.nodes.fPublicIp')" :model-value="form.public_ip" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.public_ip = v)" />
        <MdTextField :label="t('admin.nodes.fLla')" :model-value="form.our_lla" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.our_lla = v)" />
        <MdTextField :label="t('admin.nodes.fPubkey')" :model-value="form.our_wg_pubkey" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.our_wg_pubkey = v)" />
        <MdTextField :label="`${t('admin.nodes.fAsn')} (${t('common.optional')})`" :model-value="form.our_asn" inputmode="numeric" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.our_asn = v.replace(/\D/g, ''))" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :disabled="!createValid" :loading="submitting" @click="doCreate">{{ t('common.create') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Edit -->
    <MdDialog :open="!!editFor" :title="t('admin.nodes.editTitle')" :submitting="submitting" @update:open="(v: boolean) => { if (!v) editFor = null }">
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
        <MdButton variant="filled" icon="save" :loading="submitting" @click="doEdit">{{ t('common.save') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Update agent -->
    <MdDialog :open="!!updateFor" :title="t('admin.nodes.updateTitle')" :submitting="submitting" @update:open="(v: boolean) => { if (!v) updateFor = null }">
      <MdTextField
        :label="t('admin.nodes.version')" :model-value="updateVersion" mono
        :placeholder="t('admin.nodes.versionPlaceholder')" :supporting="t('admin.nodes.versionHint')"
        tf-bg="var(--md-sys-color-surface-container-high)"
        @update:model-value="(v: string) => (updateVersion = v)"
      />
      <p v-if="updateFor?.agent_version" class="md-body-small txt-variant" :style="{ margin: '8px 0 0' }">
        {{ t('admin.nodes.currentVersion', { v: updateFor.agent_version }) }}
      </p>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="upgrade" :disabled="!updateArmed" :loading="submitting" @click="doUpdateAgent">{{ t('admin.nodes.updateAgent') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Rollback agent -->
    <MdDialog :open="!!rollbackFor" :title="t('admin.nodes.rollbackTitle')" :submitting="submitting" @update:open="(v: boolean) => { if (!v) rollbackFor = null }">
      <div
        class="row gap-3"
        :style="{ alignItems: 'flex-start', padding: '14px', borderRadius: '12px', background: 'var(--md-sys-color-warning-container)', color: 'var(--md-sys-color-on-warning-container)' }"
      >
        <MdSym name="warning" :size="20" fill />
        <span class="md-body-medium">{{ t('admin.nodes.rollbackBody', { name: rollbackFor?.name }) }}</span>
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="history" :loading="submitting" @click="doRollback">{{ t('admin.nodes.rollback') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Regenerate token -->
    <MdDialog :open="!!regenFor" :title="t('admin.nodes.regenTitle')" :submitting="submitting" @update:open="(v: boolean) => { if (!v) regenFor = null }">
      <div
        class="row gap-3"
        :style="{ alignItems: 'flex-start', padding: '14px', borderRadius: '12px', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }"
      >
        <MdSym name="warning" :size="20" fill />
        <span class="md-body-medium">{{ t('admin.nodes.regenWarning', { name: regenFor?.name }) }}</span>
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" :loading="submitting" @click="doRegen">{{ t('admin.nodes.regenToken') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Reset pubkey -->
    <MdDialog :open="!!resetFor" :title="t('admin.nodes.resetTitle')" :submitting="submitting" @update:open="(v: boolean) => { if (!v) resetFor = null }">
      <div
        class="row gap-3"
        :style="{ alignItems: 'flex-start', padding: '14px', borderRadius: '12px', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }"
      >
        <MdSym name="warning" :size="20" fill />
        <span class="md-body-medium">{{ t('admin.nodes.resetWarning', { name: resetFor?.name }) }}</span>
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" :loading="submitting" @click="doReset">{{ t('admin.nodes.resetPubkey') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Delete (type-to-confirm) -->
    <MdDialog :open="!!deleteFor" :title="t('admin.nodes.deleteNode')" :submitting="submitting" @update:open="(v: boolean) => { if (!v) deleteFor = null }">
      <div class="col gap-4" :style="{ marginTop: '4px' }">
        <div
          class="row gap-3"
          :style="{ alignItems: 'flex-start', padding: '14px', borderRadius: '12px', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }"
        >
          <MdSym name="warning" :size="20" fill />
          <span class="md-body-medium">{{ t('admin.nodes.deleteBody2', { name: deleteFor?.name }) }}</span>
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
