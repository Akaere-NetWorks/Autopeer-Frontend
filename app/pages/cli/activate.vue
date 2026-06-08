<script setup lang="ts">
definePageMeta({ middleware: 'auth', title: 'cliActivate.title' })

const { t } = useI18n()
const route = useRoute()
const auth = useAuth()
const toast = useToast()
const { relTime, fmtDate } = useFormat()

type DeviceInfo = Awaited<ReturnType<typeof auth.deviceRequest>>

const code = ref(typeof route.query.user_code === 'string' ? route.query.user_code : '')
const info = ref<DeviceInfo | null>(null)
const result = ref<'approved' | 'denied' | null>(null)
const looking = ref(false)
const acting = ref(false)
const notFound = ref(false)

// The scope the device is requesting (admin vs user) governs WHO may approve it:
// the backend only lets an admin session authorize an admin-scoped grant and a
// user session a user-scoped grant, and rejects impersonation sessions outright.
const requestedScope = computed<'admin' | 'user'>(() =>
  info.value?.scopes?.some(s => s.trim().toLowerCase() === 'admin') ? 'admin' : 'user',
)
const sessionRole = computed(() => auth.user.value?.role ?? null)
const roleMismatch = computed(() => !!info.value && sessionRole.value !== requestedScope.value)
const roleMismatchMessage = computed(() =>
  requestedScope.value === 'admin'
    ? t('cliActivate.adminApprovalRequired')
    : t('cliActivate.userApprovalRequired'),
)
// Where the operator should go to manage the *right kind* of authorized devices.
const manageDevicesPath = computed(() => (requestedScope.value === 'admin' ? '/admin/devices' : '/account/security'))
const canAuthorize = computed(() =>
  !!info.value && !auth.isImpersonating.value && !roleMismatch.value,
)

async function lookup() {
  if (!code.value.trim()) return
  if (auth.isImpersonating.value) return
  looking.value = true
  notFound.value = false
  info.value = null
  result.value = null
  try {
    info.value = await auth.deviceRequest(code.value.trim())
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound.value = true
    else toast.error(e)
  } finally {
    looking.value = false
  }
}

async function decide(decision: 'approve' | 'deny') {
  if (!canAuthorize.value) return
  acting.value = true
  try {
    const res = await auth.deviceAuthorize(code.value.trim(), decision)
    result.value = res.status === 'approved' ? 'approved' : 'denied'
  } catch (e) {
    toast.error(e)
  } finally {
    acting.value = false
  }
}

onMounted(() => {
  // Re-derive session + impersonation state from cookies before deciding what to show.
  auth.hydrate()
  if (auth.isImpersonating.value) return
  if (code.value) lookup()
})
</script>

<template>
  <div class="row" :style="{ justifyContent: 'center', paddingTop: '8px' }">
    <div :style="{ width: '100%', maxWidth: '480px' }">
      <div class="text-center" :style="{ marginBottom: '28px' }">
        <span :style="{ display: 'inline-flex', width: '64px', height: '64px', borderRadius: '20px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)', marginBottom: '16px' }">
          <MdSym name="devices" :size="32" fill />
        </span>
        <h1 class="md-headline-medium" :style="{ margin: '0 0 8px' }">{{ t('cliActivate.title') }}</h1>
        <p class="md-body-medium txt-variant" :style="{ margin: 0 }">{{ t('cliActivate.subtitle') }}</p>
      </div>

      <div class="card card-elevated card-pad col gap-4">
        <!-- Impersonation sessions can never authorize a device. -->
        <template v-if="auth.isImpersonating.value">
          <div class="status status-error" :style="{ display: 'flex', alignItems: 'flex-start', height: 'auto', padding: '14px 16px' }">
            <MdSym name="block" :size="18" />
            <span>{{ t('cliActivate.impersonationForbidden') }}</span>
          </div>
          <NuxtLink :to="auth.isAdmin.value ? '/admin/devices' : '/account/security'" class="text-center">
            <MdButton variant="text" icon="arrow_back" block>{{ t('cliActivate.manageDevices') }}</MdButton>
          </NuxtLink>
        </template>

        <!-- Result -->
        <template v-else-if="result">
          <div class="text-center col gap-3" :style="{ alignItems: 'center', padding: '12px 0' }">
            <span :style="{ display: 'inline-flex', width: '64px', height: '64px', borderRadius: '20px', alignItems: 'center', justifyContent: 'center', background: result === 'approved' ? 'var(--md-sys-color-success-container)' : 'var(--md-sys-color-error-container)', color: result === 'approved' ? 'var(--md-sys-color-on-success-container)' : 'var(--md-sys-color-on-error-container)' }">
              <MdSym :name="result === 'approved' ? 'check_circle' : 'cancel'" :size="32" fill />
            </span>
            <p class="md-body-large" :style="{ margin: 0 }">{{ result === 'approved' ? t('cliActivate.approved') : t('cliActivate.denied') }}</p>
          </div>
        </template>

        <!-- Lookup + details -->
        <template v-else>
          <MdTextField
            v-model="code"
            :label="t('cliActivate.codeLabel')"
            :placeholder="t('cliActivate.codePlaceholder')"
            mono
            icon="pin"
            tf-bg="var(--md-sys-color-surface-container-low)"
          />
          <MdButton v-if="!info" variant="filled" icon="search" :loading="looking" :disabled="!code.trim()" block @click="lookup">
            {{ t('cliActivate.lookup') }}
          </MdButton>

          <div v-if="notFound" class="md-body-medium" :style="{ padding: '12px', borderRadius: '12px', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }">
            {{ t('cliActivate.notFound') }}
          </div>

          <template v-if="info">
            <div :style="{ borderRadius: '16px', border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden' }">
              <div v-for="(row, i) in [
                [t('cliActivate.scope'), requestedScope === 'admin' ? t('cliActivate.adminScopeLabel') : t('cliActivate.userScopeLabel')],
                [t('cliActivate.client'), info.client_name],
                [t('cliActivate.device'), info.device_name || '—'],
                [t('cliActivate.version'), info.version || '—'],
                [t('cliActivate.scopes'), info.scopes.join(', ')],
                [t('cliActivate.expires'), `${fmtDate(info.expires_at)} (${relTime(info.expires_at)})`],
              ]" :key="row[0]" class="row gap-4" :style="{ padding: '12px 16px', borderBottom: i < 5 ? '1px solid var(--md-sys-color-outline-variant)' : 'none' }">
                <div class="md-body-medium txt-variant" :style="{ width: '110px', flexShrink: 0 }">{{ row[0] }}</div>
                <div class="md-body-medium" :style="{ flex: 1 }">{{ row[1] }}</div>
              </div>
            </div>

            <!-- Role-mismatch warning OR the standard security reminder. -->
            <div
              v-if="roleMismatch"
              class="status status-warning md-body-small"
              :style="{ display: 'flex', alignItems: 'flex-start', height: 'auto', padding: '14px 16px' }"
            >
              <MdSym name="warning" :size="18" />
              <span>{{ roleMismatchMessage }}</span>
            </div>
            <div
              v-else
              class="status status-info md-body-small"
              :style="{ display: 'flex', alignItems: 'flex-start', height: 'auto', padding: '14px 16px' }"
            >
              <MdSym name="shield" :size="18" />
              <span>{{ t('cliActivate.securityNote') }}</span>
            </div>

            <div class="row space-between gap-3">
              <MdButton variant="text" icon="block" :loading="acting" :disabled="!canAuthorize" @click="decide('deny')">{{ t('cliActivate.deny') }}</MdButton>
              <MdButton variant="filled" icon="check" :loading="acting" :disabled="!canAuthorize" @click="decide('approve')">{{ t('cliActivate.approve') }}</MdButton>
            </div>

            <NuxtLink v-if="roleMismatch" :to="manageDevicesPath" class="text-center">
              <MdButton variant="text" icon="devices" block>{{ t('cliActivate.manageDevices') }}</MdButton>
            </NuxtLink>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>
