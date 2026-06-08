<script setup lang="ts">
import { decodeJwt } from '~/utils/jwt'

definePageMeta({ middleware: 'auth', title: 'nav.security' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const { relTime } = useFormat()
const token = useCookie<string | null>('token')

const currentSid = computed(() => {
  const p = decodeJwt(token.value) as { sid?: string, jti?: string } | null
  return p?.sid || p?.jti || null
})

const { data: devices, pending, refresh } = await useAsyncData('devices', () => api.account.devices().catch(() => []), { server: false })

function deviceIcon(name?: string) {
  const s = (name || '').toLowerCase()
  if (s.includes('tui') || s.includes('cli')) return 'terminal'
  if (s.includes('iphone') || s.includes('ios') || s.includes('android') || s.includes('mobile')) return 'smartphone'
  return 'computer'
}
function isCurrent(id: string) {
  return currentSid.value ? id === currentSid.value : false
}

const showRevoke = ref(false)
const showRevokeOthers = ref(false)
const targetId = ref<string | null>(null)
const busy = ref(false)

function askRevoke(id: string) {
  targetId.value = id
  showRevoke.value = true
}
async function doRevoke() {
  if (!targetId.value) return
  busy.value = true
  try {
    await api.account.revokeDevice(targetId.value)
    toast.show(t('security.revoked'))
    showRevoke.value = false
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
async function doRevokeOthers() {
  busy.value = true
  try {
    await api.account.revokeOtherDevices()
    toast.show(t('security.revokedOthers'))
    showRevokeOthers.value = false
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="shield" :title="t('security.title')" :subtitle="t('security.subtitle')">
      <template #action>
        <MdButton v-if="(devices?.length ?? 0) > 1" variant="tonal" icon="logout" @click="showRevokeOthers = true">{{ t('security.revokeOthers') }}</MdButton>
      </template>
    </PageHeader>

    <div v-if="pending" class="col gap-3">
      <SkeletonBlock v-for="i in 3" :key="i" height="64px" radius="12px" />
    </div>

    <div v-else-if="!devices?.length" class="card card-outlined card-pad text-center txt-variant">{{ t('security.empty') }}</div>

    <div v-else class="card card-elevated">
      <div
        v-for="(s, i) in devices"
        :key="s.id"
        class="list-item"
        :style="{ borderBottom: i < devices.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none', padding: '14px 20px' }"
      >
        <span :style="{ display: 'inline-flex', width: '44px', height: '44px', borderRadius: '12px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface-variant)' }">
          <MdSym :name="deviceIcon(s.device_name)" />
        </span>
        <div :style="{ flex: 1, minWidth: 0 }">
          <div class="md-title-small row gap-2" :style="{ flexWrap: 'wrap' }">
            <span>{{ s.device_name || s.user_agent || 'Session' }}</span>
            <MdStatus v-if="isCurrent(s.id)" kind="success" :dot="false">{{ t('security.thisDevice') }}</MdStatus>
          </div>
          <div class="md-body-small mono txt-variant">
            {{ s.ip_address || '—' }} · {{ t('security.lastUsed', { time: relTime(s.last_used_at || s.created_at) }) }} · {{ t('security.expires', { time: relTime(s.expires_at) }) }}
          </div>
        </div>
        <MdIconButton v-if="!isCurrent(s.id)" icon="delete" :title="t('security.revoke')" @click="askRevoke(s.id)" />
      </div>
    </div>

    <MdDialog v-model:open="showRevoke" :title="t('security.revokeTitle')">
      <p>{{ t('security.revokeBody') }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="logout" :loading="busy" @click="doRevoke">{{ t('security.revoke') }}</MdButton>
      </template>
    </MdDialog>

    <MdDialog v-model:open="showRevokeOthers" :title="t('security.revokeOthersTitle')">
      <p>{{ t('security.revokeOthersBody') }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="logout" :loading="busy" @click="doRevokeOthers">{{ t('security.revokeOthers') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
