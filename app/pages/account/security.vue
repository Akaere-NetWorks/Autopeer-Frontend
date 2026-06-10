<script setup lang="ts">
import type { AuthSession, PasskeyInfo } from '~/types/api'

definePageMeta({ middleware: 'auth', title: 'nav.security' })

const { t } = useI18n()
const api = useApi()
const auth = useAuth()
const toast = useToast()
const { relTime, fmtDate } = useFormat()

// ── Devices / sessions ───────────────────────────────────────────────────────
// Mirror the closed reference: do not attempt to identify the "current" session
// client-side. Every session gets a Revoke action and the Revoke-others button is
// always available; the backend decides what "others" means.
const { data: devices, pending, refresh } = await useAsyncData(
  'security-devices',
  () => api.account.devices().catch(() => [] as AuthSession[]),
  { lazy: true, server: false },
)

function deviceIcon(name?: string, method?: string) {
  if (method === 'passkey') return 'passkey'
  const s = (name || '').toLowerCase()
  if (s.includes('tui') || s.includes('cli')) return 'terminal'
  if (s.includes('iphone') || s.includes('ios') || s.includes('android') || s.includes('mobile')) return 'smartphone'
  return 'computer'
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

// ── Passkeys ─────────────────────────────────────────────────────────────────
const { data: passkeys, pending: passkeysPending, refresh: refreshPasskeys } = await useAsyncData(
  'security-passkeys',
  () => api.passkeys.list().then(r => r.passkeys).catch(() => [] as PasskeyInfo[]),
  { lazy: true, server: false },
)

const adding = ref(false)
async function addPasskey() {
  adding.value = true
  try {
    await auth.passkeyRegister()
    toast.show(t('security.passkeyAdded'))
    await refreshPasskeys()
  } catch (e: unknown) {
    // The user cancelling the WebAuthn ceremony is not an error worth surfacing.
    const name = (e as { name?: string } | null)?.name
    if (name === 'NotAllowedError' || name === 'AbortError') return
    toast.error(e, t('security.passkeyFailed'))
  } finally {
    adding.value = false
  }
}

const showRemovePasskey = ref(false)
const passkeyTarget = ref<PasskeyInfo | null>(null)
const removingPasskey = ref(false)

function askRemovePasskey(p: PasskeyInfo) {
  passkeyTarget.value = p
  showRemovePasskey.value = true
}
async function doRemovePasskey() {
  if (!passkeyTarget.value) return
  removingPasskey.value = true
  try {
    await api.passkeys.remove(passkeyTarget.value.id)
    toast.show(t('security.passkeyRemoved'))
    showRemovePasskey.value = false
    await refreshPasskeys()
  } catch (e) {
    toast.error(e)
  } finally {
    removingPasskey.value = false
  }
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="shield" :title="t('security.title')" :subtitle="t('security.subtitle')">
      <template #action>
        <MdButton v-if="(devices?.length ?? 0) > 0" variant="tonal" icon="logout" @click="showRevokeOthers = true">{{ t('security.revokeOthers') }}</MdButton>
      </template>
    </PageHeader>

    <!-- ── Sessions ───────────────────────────────────────────────────────── -->
    <section class="col gap-3">
      <h2 class="md-title-medium" :style="{ margin: 0 }">{{ t('security.sessionsTitle') }}</h2>

      <div v-if="devices === null" class="col gap-3">
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
            <MdSym :name="deviceIcon(s.device_name, s.login_method)" />
          </span>
          <div :style="{ flex: 1, minWidth: 0 }">
            <div class="md-title-small">{{ s.device_name || s.user_agent || 'Session' }}</div>
            <div class="md-body-small mono txt-variant">
              {{ s.ip_address || '—' }} · {{ t('security.lastUsed', { time: s.last_used_at ? relTime(s.last_used_at) : t('common.never') }) }} · {{ t('security.expires', { time: relTime(s.expires_at) }) }}
            </div>
          </div>
          <MdIconButton icon="delete" :title="t('security.revoke')" @click="askRevoke(s.id)" />
        </div>
      </div>
    </section>

    <!-- ── Passkeys ───────────────────────────────────────────────────────── -->
    <section class="col gap-3">
      <div class="row gap-3" :style="{ alignItems: 'center' }">
        <div :style="{ flex: 1, minWidth: 0 }">
          <h2 class="md-title-medium" :style="{ margin: 0 }">{{ t('security.passkeysTitle') }}</h2>
          <p class="md-body-small txt-variant" :style="{ margin: '2px 0 0' }">{{ t('security.passkeysSubtitle') }}</p>
        </div>
        <MdButton variant="tonal" icon="add" :loading="adding" @click="addPasskey">{{ t('security.addPasskey') }}</MdButton>
      </div>

      <div v-if="passkeys === null" class="col gap-3">
        <SkeletonBlock v-for="i in 2" :key="i" height="64px" radius="12px" />
      </div>

      <div v-else-if="!passkeys?.length" class="card card-outlined card-pad text-center txt-variant">{{ t('security.passkeysEmpty') }}</div>

      <div v-else class="card card-elevated">
        <div
          v-for="(p, i) in passkeys"
          :key="p.id"
          class="list-item"
          :style="{ borderBottom: i < passkeys.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none', padding: '14px 20px' }"
        >
          <span :style="{ display: 'inline-flex', width: '44px', height: '44px', borderRadius: '12px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface-variant)' }">
            <MdSym name="passkey" />
          </span>
          <div :style="{ flex: 1, minWidth: 0 }">
            <div class="md-title-small">{{ p.name || t('security.passkeyUnnamed') }}</div>
            <div class="md-body-small txt-variant">
              {{ t('security.passkeyCreated', { time: fmtDate(p.created_at) }) }} ·
              {{ t('security.passkeyLastUsed', { time: p.last_used_at ? relTime(p.last_used_at) : t('common.never') }) }}
            </div>
          </div>
          <MdIconButton icon="delete" :title="t('security.removePasskey')" @click="askRemovePasskey(p)" />
        </div>
      </div>
    </section>

    <!-- Revoke one -->
    <MdDialog v-model:open="showRevoke" :title="t('security.revokeTitle')" :submitting="busy">
      <p>{{ t('security.revokeBody') }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="busy" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="logout" :loading="busy" @click="doRevoke">{{ t('security.revoke') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Revoke others -->
    <MdDialog v-model:open="showRevokeOthers" :title="t('security.revokeOthersTitle')" :submitting="busy">
      <p>{{ t('security.revokeOthersBody') }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="busy" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="logout" :loading="busy" @click="doRevokeOthers">{{ t('security.revokeOthers') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Remove passkey -->
    <MdDialog v-model:open="showRemovePasskey" :title="t('security.removePasskeyTitle')" :submitting="removingPasskey">
      <p>{{ t('security.removePasskeyBody', { name: passkeyTarget?.name || t('security.passkeyUnnamed') }) }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="removingPasskey" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" icon="delete" :loading="removingPasskey" @click="doRemovePasskey">{{ t('security.removePasskey') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
