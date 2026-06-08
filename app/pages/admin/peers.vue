<script setup lang="ts">
import type { AdminPeerListItem } from '~/types/admin'

definePageMeta({ middleware: 'admin', title: 'nav.admin.peers' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const route = useRoute()
const { meta } = usePeerStatus()
const { fmtBytes, fmtRtt } = useFormat()

const statuses = ['all', 'pending', 'active', 'suspended', 'rejected'] as const
type Filter = typeof statuses[number]
const filter = ref<Filter>(statuses.includes(route.query.status as Filter) ? route.query.status as Filter : 'all')
const page = ref(1)
const perPage = 20

const { data, pending, refresh } = await useAsyncData(
  'admin-peers',
  () => api.admin.peers.list({ status: filter.value === 'all' ? undefined : filter.value, page: page.value, per_page: perPage }),
  { watch: [filter, page] },
)
watch(filter, () => { page.value = 1 })

const peers = computed(() => data.value?.peers ?? [])
const total = computed(() => data.value?.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage)))

// ── Action dialogs ────────────────────────────────────────────────────────────
const busy = ref<string | null>(null)
const rejectFor = ref<AdminPeerListItem | null>(null)
const suspendFor = ref<AdminPeerListItem | null>(null)
const deleteFor = ref<AdminPeerListItem | null>(null)
const editFor = ref<AdminPeerListItem | null>(null)
const reason = ref('')
const edit = reactive({ remote_pubkey: '', remote_endpoint: '', remote_lla: '', mtu: '' })

async function act<T>(id: string, fn: () => Promise<T>, okMsg: string) {
  busy.value = id
  try {
    await fn()
    toast.show(t(okMsg))
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = null
  }
}

function openReject(p: AdminPeerListItem) { rejectFor.value = p; reason.value = '' }
function openSuspend(p: AdminPeerListItem) { suspendFor.value = p; reason.value = '' }
function openEdit(p: AdminPeerListItem) {
  editFor.value = p
  edit.remote_pubkey = p.remote_pubkey
  edit.remote_endpoint = p.remote_endpoint
  edit.remote_lla = p.remote_lla
  edit.mtu = p.mtu != null ? String(p.mtu) : ''
}

async function doReject() {
  const p = rejectFor.value!; rejectFor.value = null
  await act(p.id, () => api.admin.peers.reject(p.id, reason.value), 'admin.peers.wasRejected')
}
async function doSuspend() {
  const p = suspendFor.value!; suspendFor.value = null
  await act(p.id, () => api.admin.peers.suspend(p.id, reason.value || undefined), 'admin.peers.wasSuspended')
}
async function doDelete() {
  const p = deleteFor.value!; deleteFor.value = null
  await act(p.id, () => api.admin.peers.remove(p.id), 'admin.peers.deleted')
}
async function doEdit() {
  const p = editFor.value!; editFor.value = null
  await act(p.id, () => api.admin.peers.update(p.id, {
    remote_pubkey: edit.remote_pubkey || undefined,
    remote_endpoint: edit.remote_endpoint || undefined,
    remote_lla: edit.remote_lla || undefined,
    mtu: edit.mtu ? Number(edit.mtu) : null,
  }), 'admin.peers.updated')
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="swap_horiz" :title="t('admin.peers.title')" :subtitle="t('admin.peers.subtitle')" />

    <div class="row gap-2 flex-wrap">
      <MdChip v-for="s in statuses" :key="s" :selected="filter === s" @click="filter = s">
        {{ s === 'all' ? t('common.all') : meta(s).label }}
      </MdChip>
    </div>

    <div v-if="pending" class="col gap-3">
      <SkeletonBlock v-for="i in 6" :key="i" height="56px" radius="12px" />
    </div>

    <div v-else-if="!peers.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.peers.empty') }}</div>

    <template v-else>
      <div class="card card-elevated">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>{{ t('admin.peers.asn') }}</th>
                <th>{{ t('admin.peers.node') }}</th>
                <th>{{ t('admin.peers.endpoint') }}</th>
                <th>{{ t('admin.peers.bgp') }}</th>
                <th>{{ t('admin.peers.rtt') }}</th>
                <th>{{ t('admin.peers.traffic') }}</th>
                <th>{{ t('admin.peers.status') }}</th>
                <th :style="{ textAlign: 'right' }">{{ t('admin.peers.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in peers" :key="p.id">
                <td class="mono" :style="{ fontWeight: 500 }">AS{{ p.remote_asn }}</td>
                <td>{{ p.node_name }}</td>
                <td><span class="code-inline">{{ p.remote_endpoint }}</span></td>
                <td>{{ p.latest_bgp_state || t('common.dash') }}</td>
                <td class="mono">{{ fmtRtt(p.latest_rtt) }}</td>
                <td class="mono">{{ fmtBytes(p.rx_bytes_24h) }} / {{ fmtBytes(p.tx_bytes_24h) }}</td>
                <td><MdStatus :kind="meta(p.status).kind">{{ meta(p.status).label }}</MdStatus></td>
                <td>
                  <div class="row gap-2" :style="{ justifyContent: 'flex-end' }">
                    <MdIconButton v-if="p.status === 'pending'" icon="check" :title="t('admin.peers.approve')" :disabled="busy === p.id" @click="act(p.id, () => api.admin.peers.approve(p.id), 'admin.peers.approved')" />
                    <MdIconButton v-if="p.status === 'pending'" icon="block" :title="t('admin.peers.reject')" :disabled="busy === p.id" @click="openReject(p)" />
                    <MdIconButton v-if="p.status === 'active'" icon="pause" :title="t('admin.peers.suspend')" :disabled="busy === p.id" @click="openSuspend(p)" />
                    <MdIconButton v-if="p.status === 'suspended'" icon="play_arrow" :title="t('admin.peers.unsuspend')" :disabled="busy === p.id" @click="act(p.id, () => api.admin.peers.unsuspend(p.id), 'admin.peers.unsuspended')" />
                    <MdIconButton icon="edit" :title="t('common.edit')" :disabled="busy === p.id" @click="openEdit(p)" />
                    <MdIconButton icon="delete" :title="t('common.delete')" :disabled="busy === p.id" @click="deleteFor = p" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="row space-between" :style="{ alignItems: 'center' }">
        <span class="md-body-small txt-variant">{{ t('admin.peers.total', { total, page }) }}</span>
        <div class="row gap-2">
          <MdIconButton icon="chevron_left" :disabled="page <= 1" :title="t('common.back')" @click="page--" />
          <span class="md-label-large" :style="{ alignSelf: 'center' }">{{ page }} / {{ totalPages }}</span>
          <MdIconButton icon="chevron_right" :disabled="page >= totalPages" :title="t('common.next')" @click="page++" />
        </div>
      </div>
    </template>

    <!-- Reject -->
    <MdDialog :open="!!rejectFor" :title="t('admin.peers.rejectTitle')" @update:open="rejectFor = null">
      <MdTextField :label="t('admin.peers.rejectReason')" :model-value="reason" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (reason = v)" />
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :disabled="!reason.trim()" @click="doReject">{{ t('admin.peers.reject') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Suspend -->
    <MdDialog :open="!!suspendFor" :title="t('admin.peers.suspendTitle')" @update:open="suspendFor = null">
      <MdTextField :label="t('admin.peers.suspendReason')" :model-value="reason" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (reason = v)" />
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" @click="doSuspend">{{ t('admin.peers.suspend') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Delete -->
    <MdDialog :open="!!deleteFor" :title="t('admin.peers.deleteTitle')" @update:open="deleteFor = null">
      <p :style="{ margin: 0 }">{{ t('admin.peers.deleteBody') }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" @click="doDelete">{{ t('common.delete') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Edit -->
    <MdDialog :open="!!editFor" :title="t('admin.peers.editTitle')" @update:open="editFor = null">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <MdTextField :label="t('admin.peers.pubkey')" :model-value="edit.remote_pubkey" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (edit.remote_pubkey = v)" />
        <MdTextField :label="t('admin.peers.endpoint')" :model-value="edit.remote_endpoint" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (edit.remote_endpoint = v)" />
        <MdTextField :label="t('admin.peers.lla')" :model-value="edit.remote_lla" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (edit.remote_lla = v)" />
        <MdTextField :label="t('admin.peers.mtu')" :model-value="edit.mtu" inputmode="numeric" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (edit.mtu = v.replace(/\D/g, ''))" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" @click="doEdit">{{ t('common.save') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
