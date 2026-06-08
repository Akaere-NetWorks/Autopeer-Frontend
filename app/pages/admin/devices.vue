<script setup lang="ts">
import type { AuthSession } from '~/types/api'

definePageMeta({ middleware: 'admin', title: 'nav.admin.devices' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const auth = useAuth()
const { relTime, fmtDate } = useFormat()

const { data, pending, refresh, error } = await useAsyncData('admin-devices', () => api.admin.devices.list(), { lazy: true, server: false })
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

// ── Login-as (impersonation) ────────────────────────────────────────────────
const showLoginAs = ref(false)
const asn = ref('')
const persist = ref(false)
const confirmLoginAs = ref(false)
const loggingIn = ref(false)

function openLoginAs() {
  asn.value = ''
  persist.value = false
  confirmLoginAs.value = false
  showLoginAs.value = true
}

// Step 1 → ask for explicit confirmation before parking the admin token.
function requestLoginAs() {
  if (!asn.value) return
  confirmLoginAs.value = true
}

// Step 2 → impersonate(). MUST be impersonate(), NOT applySession(): impersonate
// parks the current admin token in the admin_token cookie so the layout banner's
// "Return to admin" can swap it back. applySession would destroy the admin session.
async function doLoginAs() {
  loggingIn.value = true
  try {
    const res = await api.admin.devices.loginAs(Number(asn.value), persist.value)
    auth.impersonate(res)
    toast.show(t('login.welcome', { asn: asn.value }))
    confirmLoginAs.value = false
    showLoginAs.value = false
    await navigateTo('/peers')
  } catch (e) { toast.error(e) } finally { loggingIn.value = false }
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="devices" :title="t('admin.devices.title')" :subtitle="t('admin.devices.subtitle')">
      <template #action>
        <div class="row gap-2">
          <MdIconButton icon="refresh" :title="t('common.refresh')" :loading="pending" @click="() => refresh()" />
          <MdButton variant="tonal" icon="switch_account" @click="openLoginAs">{{ t('admin.devices.loginAs') }}</MdButton>
        </div>
      </template>
    </PageHeader>

    <div
      v-if="error"
      class="row gap-2"
      :style="{ alignItems: 'flex-start', padding: '12px 16px', borderRadius: '12px', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }"
    >
      <MdSym name="error" :size="20" />
      <span class="md-body-medium">{{ error.message || t('common.retry') }}</span>
    </div>

    <div v-if="data === null" class="col gap-3">
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
          <div class="md-body-small mono txt-variant" :style="{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }">
            {{ s.ip_address || t('common.dash') }}
            <span v-if="s.user_agent && s.device_name"> · {{ s.user_agent }}</span>
          </div>
          <div class="md-body-small txt-variant">
            {{ t('admin.devices.created') }} {{ fmtDate(s.created_at) }} · {{ t('admin.devices.expires') }} {{ fmtDate(s.expires_at) }}
          </div>
        </div>
        <span class="md-body-small txt-variant" :style="{ whiteSpace: 'nowrap', marginRight: '8px' }">{{ relTime(s.last_used_at || s.created_at) }}</span>
        <MdIconButton icon="logout" :title="t('admin.devices.revoke')" :loading="busy === s.id" @click="revoke(s)" />
      </div>
    </div>

    <!-- Login-as: enter ASN + persist toggle -->
    <MdDialog :open="showLoginAs" :title="t('admin.devices.loginAsTitle')" :submitting="loggingIn" @update:open="showLoginAs = false">
      <p :style="{ margin: '0 0 12px' }">{{ t('admin.devices.loginAsBody') }}</p>
      <MdTextField
        :label="t('admin.devices.asn')"
        :model-value="asn"
        icon="tag"
        mono
        inputmode="numeric"
        tf-bg="var(--md-sys-color-surface-container-high)"
        @update:model-value="(v: string) => (asn = v.replace(/\D/g, ''))"
        @keydown.enter="requestLoginAs"
      />
      <label class="row gap-3" :style="{ cursor: 'pointer', marginTop: '14px', alignItems: 'flex-start' }">
        <MdSwitch :model-value="persist" @update:model-value="(v: boolean) => (persist = v)" />
        <span :style="{ flex: 1, minWidth: 0 }">
          <span class="md-body-medium" :style="{ display: 'block' }">{{ t('admin.devices.persist') }}</span>
          <span class="md-body-small txt-variant">{{ t('admin.devices.persistHint') }}</span>
        </span>
      </label>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :disabled="!asn" @click="requestLoginAs">{{ t('admin.devices.loginAs') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Confirm before firing: impersonation replaces the active session -->
    <MdDialog :open="confirmLoginAs" :title="t('admin.devices.loginAsTitle')" :submitting="loggingIn" @update:open="confirmLoginAs = false">
      <p class="md-body-medium" :style="{ margin: 0 }">{{ t('admin.devices.confirmLoginAs', { asn }) }}</p>
      <p class="md-body-small txt-variant" :style="{ margin: '8px 0 0' }">{{ t('admin.devices.confirmLoginAsHint') }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="loggingIn" @click="doLoginAs">{{ t('admin.devices.loginAs') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
