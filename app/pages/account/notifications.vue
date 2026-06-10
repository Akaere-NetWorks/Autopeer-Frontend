<script setup lang="ts">
import type { NotificationOption, NotificationPreset } from '~/types/api'

definePageMeta({ middleware: 'auth', title: 'nav.notifications' })

const { t, te } = useI18n()
const api = useApi()
const toast = useToast()
const { relTime } = useFormat()

type Binding = Awaited<ReturnType<typeof api.telegram.binding>>

const { data, refresh } = await useAsyncData('notif', async () => {
  const [email, binding] = await Promise.all([
    api.account.notificationPrefs(),
    api.telegram.binding().catch(() => ({ bound: false } as Binding)),
  ])
  let tgPrefs: Awaited<ReturnType<typeof api.telegram.notificationPrefs>> | null = null
  if (binding.bound) tgPrefs = await api.telegram.notificationPrefs().catch(() => null)
  return { email, binding, tgPrefs }
}, { lazy: true, server: false })

// ── Email catalog (batched draft + explicit Save) ────────────────────────────
// We keep a local draft of every option's enabled state and only persist it when
// the user presses Save. This matches the closed page and avoids per-toggle
// autosave races (out-of-order PUTs losing updates).
const emailOptions = ref<NotificationOption[]>([])
const initialEnabledKeys = ref<string[]>([])
const emailPresets = computed<NotificationPreset[]>(() => data.value?.email.presets ?? [])
// current_catalog_version is an int on the backend; keep it numeric for the round-trip.
const catalogVersion = computed(() => data.value?.email.current_catalog_version ?? 0)
const seenCatalogVersion = computed(() => data.value?.email.seen_catalog_version ?? 0)
const emailMode = computed(() => data.value?.email.mode ?? 'explicit')
const showWizardBanner = computed(() =>
  !!data.value?.email && (data.value.email.needs_wizard || data.value.email.has_unseen_options || data.value.email.mode === 'legacy'),
)

function syncEmailFromData() {
  const opts = (data.value?.email.options ?? []).map((o) => ({ ...o }))
  emailOptions.value = opts
  initialEnabledKeys.value = opts.filter((o) => o.enabled).map((o) => o.key)
}
watch(data, syncEmailFromData, { immediate: true })

const emailGroups = computed(() => {
  const order = ['account', 'peer_lifecycle', 'connectivity', 'monitoring']
  const groups = [...new Set(emailOptions.value.map((o) => o.group))]
  return groups.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
})
const enabledCount = computed(() => emailOptions.value.filter((o) => o.enabled).length)
const currentEnabledKeys = computed(() => emailOptions.value.filter((o) => o.enabled).map((o) => o.key))

function sameKeySet(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const a = [...left].sort()
  const b = [...right].sort()
  return a.every((v, i) => v === b[i])
}
const hasChanges = computed(() => !sameKeySet(initialEnabledKeys.value, currentEnabledKeys.value))
const canSave = computed(() => hasChanges.value || showWizardBanner.value)

function groupLabel(g: string) {
  return te(`notifications.groups.${g}`) ? t(`notifications.groups.${g}`) : t('notifications.groups.other')
}
function optionsIn(group: string) {
  return emailOptions.value.filter((o) => o.group === group)
}
function activeEmailPreset(p: NotificationPreset) {
  return sameKeySet(p.enabled_keys, currentEnabledKeys.value)
}

// A "protected" option needs a confirmation before it can be turned off.
function isProtected(o: NotificationOption) {
  return o.kind === 'critical' || o.kind === 'required' || o.requires_disable_confirmation
}

// ── Confirm-disable dialog state ─────────────────────────────────────────────
const showConfirm = ref(false)
// 'client' = user is turning off a protected option (gate before any network call);
// 'backend' = the server returned confirmation_required and we need explicit consent.
const confirmStage = ref<'client' | 'backend'>('client')
const confirmTarget = ref<NotificationOption | null>(null)
const confirmKeys = ref<string[]>([])

const savingEmail = ref(false)

function toggleEmailOption(o: NotificationOption, next: boolean) {
  // Gate the disable of a protected option BEFORE mutating the draft. The flip
  // only happens after the user confirms (confirmClientDisable).
  if (!next && o.enabled && isProtected(o)) {
    confirmStage.value = 'client'
    confirmTarget.value = o
    confirmKeys.value = [o.key]
    showConfirm.value = true
    return
  }
  o.enabled = next
}

function confirmClientDisable() {
  if (confirmTarget.value) confirmTarget.value.enabled = false
  closeConfirm()
}

function closeConfirm() {
  showConfirm.value = false
  confirmTarget.value = null
  confirmKeys.value = []
  confirmStage.value = 'client'
}

// The OSS backend returns the disputed keys under `keys`; fall back across the
// other field names the closed page tolerated in case of a contract change.
function extractConfirmationKeys(e: ApiError): string[] {
  const d = e.data as Record<string, unknown>
  const candidate = d.confirmed_disabled_critical_keys ?? d.confirmation_required_keys ?? d.keys ?? d.option_keys
  if (Array.isArray(candidate)) return candidate.map(String)
  // Fall back to every currently-disabled protected key.
  return emailOptions.value.filter((o) => !o.enabled && isProtected(o)).map((o) => o.key)
}

async function saveEmail(confirmedDisabledCriticalKeys: string[] = []) {
  savingEmail.value = true
  try {
    await api.account.setNotificationPrefs({
      enabled_keys: currentEnabledKeys.value,
      confirmed_disabled_critical_keys: confirmedDisabledCriticalKeys,
      seen_catalog_version: catalogVersion.value,
      wizard_completed: true,
    })
    toast.show(t('notifications.saved'))
    closeConfirm()
    // Re-baseline so hasChanges resets and the wizard banner clears.
    await refresh()
  } catch (e) {
    if (e instanceof ApiError && e.code === 'confirmation_required') {
      confirmStage.value = 'backend'
      confirmTarget.value = null
      confirmKeys.value = extractConfirmationKeys(e)
      showConfirm.value = true
      return
    }
    if (e instanceof ApiError && e.code === 'precondition_failed') {
      // A required notification can't be disabled yet (e.g. no GPG fallback).
      toast.error(e, t('notifications.preconditionFailed'))
      return
    }
    toast.error(e)
  } finally {
    savingEmail.value = false
  }
}

// Confirm dialog footer action: client stage just flips the draft; backend stage
// re-submits the save WITH the confirmed keys.
async function confirmAction() {
  if (confirmStage.value === 'client') {
    confirmClientDisable()
    return
  }
  const keys = confirmKeys.value.slice()
  await saveEmail(keys)
}

// Presets only mutate the local draft — never autosave. The user commits via Save,
// so dismissing a later confirm dialog can't silently wipe a preset selection.
function applyEmailPreset(keys: string[]) {
  const set = new Set(keys)
  emailOptions.value = emailOptions.value.map((o) => ({ ...o, enabled: set.has(o.key) }))
}

// ── Telegram binding ─────────────────────────────────────────────────────────
// Local binding state, seeded from the SSR-safe fetch and updated live by polling.
const binding = ref<Binding>({ bound: false })
watch(() => data.value?.binding, (b) => { if (b) binding.value = b }, { immediate: true })
const botConfigured = computed(() => !!binding.value.bot_username)
const tgBusy = ref(false)
const tgDeeplink = ref('')

// Poll the binding endpoint until the user finishes linking in Telegram. The
// closed page uses a shared composable with the same 3s/~5min cadence.
let pollTimer: ReturnType<typeof setInterval> | null = null
function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
function startPolling() {
  stopPolling()
  let attempts = 0
  pollTimer = setInterval(async () => {
    attempts++
    if (attempts > 100) { // ~5 minutes at 3s
      // Don't leave the "waiting" spinner up forever: clear the pending link
      // state and tell the user to start over.
      stopPolling()
      tgDeeplink.value = ''
      toast.show(t('notifications.telegram.linkTimeout'))
      return
    }
    try {
      const result = await api.telegram.binding()
      if (result.bound) {
        binding.value = result
        tgDeeplink.value = ''
        stopPolling()
        await loadTgPrefs()
      }
    } catch {
      // ignore transient poll errors
    }
  }, 3000)
}

async function linkTelegram() {
  tgBusy.value = true
  try {
    const res = await api.telegram.bindToken()
    tgDeeplink.value = res.deeplink
    if (import.meta.client) window.open(res.deeplink, '_blank', 'noopener')
    startPolling()
  } catch (e) {
    toast.error(e)
  } finally {
    tgBusy.value = false
  }
}

function cancelLink() {
  stopPolling()
  tgDeeplink.value = ''
}

async function unlinkTelegram() {
  tgBusy.value = true
  try {
    await api.telegram.unbind()
    stopPolling()
    tgDeeplink.value = ''
    binding.value = { bound: false }
    tgOptions.value = []
    toast.show(t('notifications.telegram.unbound'))
  } catch (e) {
    toast.error(e)
  } finally {
    tgBusy.value = false
  }
}

// ── Telegram notification prefs (optimistic, serialized) ─────────────────────
const tgOptions = ref<NotificationOption[]>([])
watch(() => data.value?.tgPrefs, (p) => {
  tgOptions.value = (p?.options ?? []).map((o) => ({ ...o }))
}, { immediate: true })
const tgPresets = computed<NotificationPreset[]>(() => data.value?.tgPrefs?.presets ?? [])
const tgGroups = computed(() => [...new Set(tgOptions.value.map((o) => o.group))])

const savingTg = ref(false)
const tgPrefsLoading = ref(false)

async function loadTgPrefs() {
  tgPrefsLoading.value = true
  try {
    const p = await api.telegram.notificationPrefs()
    if (p.bound) {
      tgOptions.value = (p.options ?? []).map((o) => ({ ...o }))
      if (data.value) data.value.tgPrefs = p
    }
  } catch (e) {
    toast.error(e)
  } finally {
    tgPrefsLoading.value = false
  }
}

async function saveTelegram() {
  // Serialize: never fire a second PUT while one is in flight (switches/chips are
  // disabled in the template too, this is belt-and-braces against rapid programmatic calls).
  if (savingTg.value) return
  savingTg.value = true
  try {
    await api.telegram.setNotificationPrefs(tgOptions.value.filter((o) => o.enabled).map((o) => o.key))
    toast.show(t('notifications.saved'))
  } catch (e) {
    toast.error(e)
    // Re-sync the draft from the server so a failed optimistic flip is reverted.
    await loadTgPrefs()
  } finally {
    savingTg.value = false
  }
}

async function toggleTgOption(o: NotificationOption, next: boolean) {
  if (savingTg.value) return
  o.enabled = next
  await saveTelegram()
}

async function applyTgPreset(keys: string[]) {
  if (savingTg.value) return
  const set = new Set(keys)
  tgOptions.value = tgOptions.value.map((o) => ({ ...o, enabled: set.has(o.key) }))
  await saveTelegram()
}

function activeTgPreset(p: NotificationPreset) {
  return sameKeySet(p.enabled_keys, tgOptions.value.filter((o) => o.enabled).map((o) => o.key))
}

function presetLabel(name: string) {
  return name.replace(/\b\w/g, (c) => c.toUpperCase())
}

// When Telegram becomes bound, auto-load the notification prefs so the toggle
// UI appears without a manual refresh.
watch(() => binding.value.bound, async (bound) => {
  if (bound && tgOptions.value.length === 0) await loadTgPrefs()
})

// Stop any in-flight binding poll when the user navigates away.
onUnmounted(stopPolling)
</script>

<template>
  <div class="col gap-6">
    <PageHeader icon="notifications" :title="t('notifications.title')" :subtitle="t('notifications.subtitle')" />

    <!-- Email -->
    <section class="col gap-4">
      <div v-if="showWizardBanner" class="card card-pad row gap-3" :style="{ background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }">
        <MdSym name="info" :size="20" :style="{ flexShrink: 0 }" />
        <div :style="{ flex: 1 }">
          <div class="md-title-small">{{ t('notifications.wizard.title') }}</div>
          <div class="md-body-small">{{ emailMode === 'legacy' ? t('notifications.wizard.legacy') : t('notifications.wizard.catalog') }}</div>
        </div>
      </div>

      <div class="card card-elevated card-pad row space-between flex-wrap gap-4">
        <div :style="{ flex: 1, minWidth: '200px' }">
          <div class="md-title-small row gap-2"><MdSym name="mail" :size="20" class="txt-variant" /> {{ t('notifications.emailChannel') }}</div>
          <div class="md-body-small txt-variant">{{ t('notifications.enabledCount', { enabled: enabledCount, total: emailOptions.length }) }}</div>
        </div>
        <div class="row gap-2 flex-wrap">
          <MdChip
            v-for="p in emailPresets"
            :key="p.name"
            :selected="activeEmailPreset(p)"
            @click="!savingEmail && applyEmailPreset(p.enabled_keys)"
          >{{ presetLabel(p.name) }}</MdChip>
        </div>
      </div>

      <div v-for="g in emailGroups" :key="g" class="card card-elevated">
        <div class="md-title-small txt-variant" :style="{ padding: '16px 20px 4px' }">{{ groupLabel(g) }}</div>
        <div
          v-for="(o, i) in optionsIn(g)"
          :key="o.key"
          class="list-item"
          :style="{ borderBottom: i < optionsIn(g).length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none', padding: '12px 20px' }"
        >
          <div :style="{ flex: 1 }">
            <div class="md-title-small row gap-2">
              {{ o.name }}
              <MdStatus v-if="o.kind === 'required'" kind="neutral" :dot="false">{{ t('notifications.labels.required') }}</MdStatus>
              <MdStatus v-else-if="o.kind === 'critical'" kind="warning" :dot="false">{{ t('notifications.labels.critical') }}</MdStatus>
              <MdStatus v-else-if="o.is_new" kind="info" :dot="false">{{ t('notifications.labels.new') }}</MdStatus>
            </div>
            <div class="md-body-small txt-variant">{{ o.description }}</div>
          </div>
          <MdSwitch
            :model-value="o.enabled"
            :aria-label="o.name"
            :disabled="savingEmail"
            @update:model-value="(v: boolean) => toggleEmailOption(o, v)"
          />
        </div>
      </div>

      <div class="card card-elevated card-pad row space-between flex-wrap gap-3">
        <div class="md-body-small txt-variant">{{ t('notifications.reviewHint') }}</div>
        <MdButton variant="filled" :loading="savingEmail" :disabled="!canSave" @click="saveEmail()">{{ t('common.save') }}</MdButton>
      </div>
    </section>

    <!-- Telegram -->
    <section class="col gap-4">
      <div class="card card-elevated card-pad">
        <div class="row gap-3 flex-wrap space-between">
          <div class="row gap-3" :style="{ alignItems: 'center' }">
            <span :style="{ display: 'inline-flex', width: '44px', height: '44px', borderRadius: '12px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }">
              <MdSym name="send" :size="22" fill />
            </span>
            <div>
              <div class="md-title-small">{{ t('notifications.telegramChannel') }}</div>
              <div v-if="!botConfigured" class="md-body-small txt-variant">{{ t('notifications.telegram.notConfigured') }}</div>
              <div v-else-if="binding.bound" class="md-body-small txt-variant">{{ t('notifications.telegram.bound', { username: binding.tg_username }) }} · {{ t('notifications.telegram.boundAt', { time: relTime(binding.bound_at) }) }}</div>
              <div v-else class="md-body-small txt-variant">{{ t('notifications.telegram.notBoundBody') }}</div>
            </div>
          </div>
          <div v-if="botConfigured" class="row gap-2">
            <MdButton v-if="binding.bound" variant="text" icon="link_off" :loading="tgBusy" @click="unlinkTelegram">{{ t('notifications.telegram.unbind') }}</MdButton>
            <template v-else>
              <MdButton v-if="tgDeeplink" variant="text" :disabled="tgBusy" @click="cancelLink">{{ t('common.cancel') }}</MdButton>
              <MdButton variant="tonal" icon="send" :loading="tgBusy" @click="linkTelegram">{{ t('notifications.telegram.bind') }}</MdButton>
            </template>
          </div>
        </div>
        <div v-if="tgDeeplink && !binding.bound" class="md-body-small" :style="{ marginTop: '14px', padding: '12px', borderRadius: '12px', background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }">
          <a :href="tgDeeplink" target="_blank" rel="noopener" class="row gap-2"><MdSym name="open_in_new" :size="16" /> {{ t('notifications.telegram.openLink') }}</a>
          <div class="row gap-2" :style="{ marginTop: '6px' }">
            <MdSym name="progress_activity" :size="16" class="spinning" />
            {{ t('notifications.telegram.waiting') }}
          </div>
        </div>
      </div>

      <!-- Telegram prefs (when bound) -->
      <template v-if="binding.bound && (tgOptions.length || tgPrefsLoading)">
        <div class="card card-elevated card-pad row space-between flex-wrap gap-3">
          <div class="md-title-small row gap-2">
            {{ t('notifications.telegram.prefsTitle') }}
            <MdSym v-if="savingTg" name="progress_activity" :size="16" class="spinning txt-variant" />
          </div>
          <div class="row gap-2 flex-wrap">
            <MdChip
              v-for="p in tgPresets"
              :key="p.name"
              :selected="activeTgPreset(p)"
              @click="!savingTg && applyTgPreset(p.enabled_keys)"
            >{{ presetLabel(p.name) }}</MdChip>
          </div>
        </div>
        <div v-if="tgPrefsLoading" class="card card-elevated card-pad row gap-2 txt-variant md-body-small">
          <MdSym name="progress_activity" :size="16" class="spinning" /> {{ t('common.loading') }}
        </div>
        <div v-for="g in tgGroups" v-else :key="g" class="card card-elevated">
          <div class="md-title-small txt-variant" :style="{ padding: '16px 20px 4px' }">{{ groupLabel(g) }}</div>
          <div
            v-for="(o, i) in tgOptions.filter(x => x.group === g)"
            :key="o.key"
            class="list-item"
            :style="{ borderBottom: i < tgOptions.filter(x => x.group === g).length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none', padding: '12px 20px' }"
          >
            <div :style="{ flex: 1 }">
              <div class="md-title-small">{{ o.name }}</div>
              <div class="md-body-small txt-variant">{{ o.description }}</div>
            </div>
            <MdSwitch
              :model-value="o.enabled"
              :aria-label="o.name"
              :disabled="savingTg"
              @update:model-value="(v: boolean) => toggleTgOption(o, v)"
            />
          </div>
        </div>
      </template>
    </section>

    <!-- Confirm-disable dialog. The dialog never reverts the draft on dismiss:
         the client-stage flip only happens on Confirm, and the backend-stage
         re-submit only happens on Confirm. Dismissing (scrim/Escape/Cancel)
         simply leaves the local draft untouched. -->
    <MdDialog v-model:open="showConfirm" :title="t('notifications.confirmDisableTitle')" :submitting="savingEmail" @close="closeConfirm">
      <p>{{ t('notifications.confirmDisableBody') }}</p>
      <div v-if="confirmTarget" class="card card-pad" :style="{ marginTop: '12px' }">
        <div class="md-title-small">{{ confirmTarget.name }}</div>
        <div class="md-body-small txt-variant">{{ confirmTarget.description }}</div>
      </div>
      <div v-if="confirmKeys.length" class="row gap-2 flex-wrap" :style="{ marginTop: '12px' }">
        <MdStatus v-for="k in confirmKeys" :key="k" kind="neutral" :dot="false">{{ k }}</MdStatus>
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="savingEmail" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="savingEmail" @click="confirmAction">{{ t('common.confirm') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
