<script setup lang="ts">
import type { AdminNode } from '~/types/admin'

definePageMeta({ middleware: 'admin', title: 'nav.admin.nodes' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const { relTime, fmtUptime } = useFormat()

const { data, pending, refresh } = await useAsyncData('admin-nodes', () => api.admin.nodes.list(), { server: false })
const nodes = computed(() => data.value ?? [])

const busy = ref<string | null>(null)
const openMenu = ref<string | null>(null)

const showCreate = ref(false)
const editFor = ref<AdminNode | null>(null)
const deleteFor = ref<AdminNode | null>(null)
const updateFor = ref<AdminNode | null>(null)
const tokenDialog = ref<{ title: string, token: string } | null>(null)

const form = reactive({ name: '', location: '', public_ip: '', our_lla: '', our_wg_pubkey: '', our_asn: '' })
const editForm = reactive({ name: '', location: '', public_ip: '', our_lla: '', our_wg_pubkey: '', enabled: true })
const updateVersion = ref('')

async function act<T>(id: string, fn: () => Promise<T>, okMsg: string, after?: (r: T) => void) {
  busy.value = id; openMenu.value = null
  try {
    const r = await fn()
    if (after) after(r)
    else toast.show(t(okMsg))
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = null
  }
}

async function doCreate() {
  showCreate.value = false
  try {
    const r = await api.admin.nodes.create({
      name: form.name, location: form.location, public_ip: form.public_ip,
      our_lla: form.our_lla, our_wg_pubkey: form.our_wg_pubkey,
      our_asn: form.our_asn ? Number(form.our_asn) : undefined,
    })
    tokenDialog.value = { title: t('admin.nodes.tokenTitle'), token: r.agent_token }
    toast.show(t('admin.nodes.created'))
    Object.assign(form, { name: '', location: '', public_ip: '', our_lla: '', our_wg_pubkey: '', our_asn: '' })
    await refresh()
  } catch (e) { toast.error(e) }
}

function openEdit(n: AdminNode) {
  editFor.value = n; openMenu.value = null
  Object.assign(editForm, { name: n.name, location: n.location, public_ip: n.public_ip, our_lla: n.our_lla, our_wg_pubkey: n.our_wg_pubkey, enabled: n.enabled })
}
async function doEdit() {
  const n = editFor.value!; editFor.value = null
  await act(n.id, () => api.admin.nodes.update(n.id, { ...editForm }), 'admin.nodes.updated')
}
async function doDelete() {
  const n = deleteFor.value!; deleteFor.value = null
  await act(n.id, () => api.admin.nodes.remove(n.id), 'admin.nodes.deleted')
}
async function doUpdateAgent() {
  const n = updateFor.value!; updateFor.value = null
  await act(n.id, () => api.admin.nodes.updateAgent(n.id, { version: updateVersion.value }), 'admin.nodes.agentUpdating')
}

async function copy(text: string) {
  if (import.meta.client && navigator.clipboard) { await navigator.clipboard.writeText(text); toast.show(t('common.copied')) }
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="dns" :title="t('admin.nodes.title')" :subtitle="t('admin.nodes.subtitle')">
      <template #action>
        <MdButton variant="filled" icon="add" @click="showCreate = true">{{ t('admin.nodes.create') }}</MdButton>
      </template>
    </PageHeader>

    <div v-if="pending" class="col gap-3">
      <SkeletonBlock v-for="i in 3" :key="i" height="64px" radius="12px" />
    </div>
    <div v-else-if="!nodes.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.nodes.empty') }}</div>

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
            <tr v-for="n in nodes" :key="n.id">
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
              <td>
                <div class="row gap-2" :style="{ justifyContent: 'flex-end' }">
                  <MdIconButton icon="edit" :title="t('common.edit')" :disabled="busy === n.id" @click="openEdit(n)" />
                  <MdMenu :open="openMenu === n.id" @update:open="(v: boolean) => (openMenu = v ? n.id : null)">
                    <template #trigger>
                      <MdIconButton icon="more_vert" :title="t('admin.nodes.actions')" :loading="busy === n.id" @click="openMenu = openMenu === n.id ? null : n.id" />
                    </template>
                    <button v-ripple type="button" class="menu-item" @click="act(n.id, () => api.admin.nodes.importPeers(n.id), '', (r) => toast.show(t('admin.nodes.imported', { n: r.inserted })))"><MdSym name="download" /> <span>{{ t('admin.nodes.importPeers') }}</span></button>
                    <button v-ripple type="button" class="menu-item" @click="act(n.id, () => api.admin.nodes.birdRefresh(n.id), '', (r) => toast.show(t('admin.nodes.refreshed', { n: r.updated })))"><MdSym name="refresh" /> <span>{{ t('admin.nodes.birdRefresh') }}</span></button>
                    <button v-ripple type="button" class="menu-item" @click="updateFor = n; updateVersion = n.agent_version; openMenu = null"><MdSym name="upgrade" /> <span>{{ t('admin.nodes.updateAgent') }}</span></button>
                    <button v-ripple type="button" class="menu-item" @click="act(n.id, () => api.admin.nodes.rollback(n.id), 'admin.nodes.rolledBack')"><MdSym name="history" /> <span>{{ t('admin.nodes.rollback') }}</span></button>
                    <button v-ripple type="button" class="menu-item" @click="act(n.id, () => api.admin.nodes.regenerateToken(n.id), '', (r) => { tokenDialog = { title: t('admin.nodes.tokenTitle'), token: r.agent_token } })"><MdSym name="key" /> <span>{{ t('admin.nodes.regenToken') }}</span></button>
                    <button v-ripple type="button" class="menu-item" @click="act(n.id, () => api.admin.nodes.resetPubkey(n.id), 'admin.nodes.pubkeyReset')"><MdSym name="lock_reset" /> <span>{{ t('admin.nodes.resetPubkey') }}</span></button>
                    <hr class="md-divider" :style="{ margin: '4px 0' }">
                    <button v-ripple type="button" class="menu-item" :style="{ color: 'var(--md-sys-color-error)' }" @click="deleteFor = n; openMenu = null"><MdSym name="delete" /> <span>{{ t('admin.nodes.deleteNode') }}</span></button>
                  </MdMenu>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create -->
    <MdDialog :open="showCreate" :title="t('admin.nodes.createTitle')" @update:open="showCreate = false">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <MdTextField :label="t('admin.nodes.fName')" :model-value="form.name" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.name = v)" />
        <MdTextField :label="t('admin.nodes.fLocation')" :model-value="form.location" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.location = v)" />
        <MdTextField :label="t('admin.nodes.fPublicIp')" :model-value="form.public_ip" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.public_ip = v)" />
        <MdTextField :label="t('admin.nodes.fLla')" :model-value="form.our_lla" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.our_lla = v)" />
        <MdTextField :label="t('admin.nodes.fPubkey')" :model-value="form.our_wg_pubkey" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.our_wg_pubkey = v)" />
        <MdTextField :label="`${t('admin.nodes.fAsn')} (${t('common.optional')})`" :model-value="form.our_asn" inputmode="numeric" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.our_asn = v.replace(/\D/g, ''))" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :disabled="!form.name || !form.location || !form.public_ip || !form.our_lla || !form.our_wg_pubkey" @click="doCreate">{{ t('common.create') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Edit -->
    <MdDialog :open="!!editFor" :title="t('admin.nodes.editTitle')" @update:open="editFor = null">
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
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" @click="doEdit">{{ t('common.save') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Update agent -->
    <MdDialog :open="!!updateFor" :title="t('admin.nodes.updateTitle')" @update:open="updateFor = null">
      <MdTextField :label="t('admin.nodes.version')" :model-value="updateVersion" mono :supporting="t('admin.nodes.versionHint')" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (updateVersion = v)" />
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :disabled="!updateVersion" @click="doUpdateAgent">{{ t('admin.nodes.updateAgent') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Delete -->
    <MdDialog :open="!!deleteFor" :title="t('admin.nodes.deleteNode')" @update:open="deleteFor = null">
      <p :style="{ margin: 0 }">{{ t('admin.nodes.deleteBody') }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" @click="doDelete">{{ t('common.delete') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Token reveal -->
    <MdDialog :open="!!tokenDialog" :title="tokenDialog?.title" @update:open="tokenDialog = null">
      <p :style="{ margin: '0 0 12px' }">{{ t('admin.nodes.tokenBody') }}</p>
      <div class="code-block" :style="{ position: 'relative', wordBreak: 'break-all', whiteSpace: 'normal' }">
        {{ tokenDialog?.token }}
        <button class="icon-btn" :style="{ position: 'absolute', top: '6px', right: '6px', width: '32px', height: '32px' }" :title="t('common.copy')" @click="copy(tokenDialog!.token)">
          <MdSym name="content_copy" :size="18" />
        </button>
      </div>
      <template #actions="{ close }">
        <MdButton variant="filled" @click="close">{{ t('common.close') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
