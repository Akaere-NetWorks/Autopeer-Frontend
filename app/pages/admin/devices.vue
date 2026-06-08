<script setup lang="ts">
import type { AuthSession } from '~/types/api'

definePageMeta({ middleware: 'admin', title: 'nav.admin.devices' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const auth = useAuth()
const { relTime, fmtDate } = useFormat()

const { data, pending, refresh } = await useAsyncData('admin-devices', () => api.admin.devices.list())
const sessions = computed(() => data.value ?? [])
const busy = ref<string | null>(null)

async function revoke(s: AuthSession) {
  busy.value = s.id
  try {
    await api.admin.devices.revoke(s.id)
    toast.show(t('admin.devices.revoked'))
    await refresh()
  } catch (e) { toast.error(e) } finally { busy.value = null }
}

const showLoginAs = ref(false)
const asn = ref('')
const persist = ref(false)
const loggingIn = ref(false)
async function doLoginAs() {
  loggingIn.value = true
  try {
    const res = await api.admin.devices.loginAs(Number(asn.value), persist.value)
    auth.applySession(res)
    toast.show(t('login.welcome', { asn: asn.value }))
    showLoginAs.value = false
    await navigateTo('/peers')
  } catch (e) { toast.error(e) } finally { loggingIn.value = false }
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="devices" :title="t('admin.devices.title')" :subtitle="t('admin.devices.subtitle')">
      <template #action>
        <MdButton variant="tonal" icon="switch_account" @click="showLoginAs = true">{{ t('admin.devices.loginAs') }}</MdButton>
      </template>
    </PageHeader>

    <div v-if="pending" class="col gap-3">
      <SkeletonBlock v-for="i in 3" :key="i" height="72px" radius="12px" />
    </div>
    <div v-else-if="!sessions.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.devices.empty') }}</div>

    <div v-else class="card card-elevated">
      <div
        v-for="(s, i) in sessions"
        :key="s.id"
        class="list-item"
        :style="{ borderBottom: i < sessions.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none', padding: '14px 20px' }"
      >
        <span :style="{ display: 'inline-flex', width: '40px', height: '40px', borderRadius: '12px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }">
          <MdSym :name="s.subject_type === 'impersonation' ? 'theater_comedy' : 'computer'" :size="20" />
        </span>
        <div :style="{ flex: 1, minWidth: 0 }">
          <div class="md-title-small">
            {{ s.device_name || s.user_agent || t('admin.devices.device') }}
            <span v-if="s.login_method" class="md-body-small txt-variant">· {{ s.login_method }}</span>
          </div>
          <div class="md-body-small mono txt-variant">{{ s.ip_address || t('common.dash') }} · {{ t('admin.devices.expires') }} {{ fmtDate(s.expires_at) }}</div>
        </div>
        <span class="md-body-small txt-variant" :style="{ whiteSpace: 'nowrap', marginRight: '8px' }">{{ relTime(s.last_used_at || s.created_at) }}</span>
        <MdIconButton icon="logout" :title="t('admin.devices.revoke')" :loading="busy === s.id" @click="revoke(s)" />
      </div>
    </div>

    <MdDialog :open="showLoginAs" :title="t('admin.devices.loginAsTitle')" @update:open="showLoginAs = false">
      <p :style="{ margin: '0 0 12px' }">{{ t('admin.devices.loginAsBody') }}</p>
      <MdTextField :label="t('admin.devices.asn')" :model-value="asn" icon="tag" mono inputmode="numeric" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (asn = v.replace(/\D/g, ''))" />
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :disabled="!asn" :loading="loggingIn" @click="doLoginAs">{{ t('admin.devices.loginAs') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
