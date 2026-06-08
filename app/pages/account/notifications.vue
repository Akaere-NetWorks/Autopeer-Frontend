<script setup lang="ts">
import type { NotificationOption } from '~/types/api'

definePageMeta({ middleware: 'auth', title: 'nav.notifications' })

const { t, te } = useI18n()
const api = useApi()
const toast = useToast()
const { relTime } = useFormat()

const { data, refresh } = await useAsyncData('notif', async () => {
  const [email, binding] = await Promise.all([
    api.account.notificationPrefs(),
    api.telegram.binding().catch(() => ({ bound: false } as Awaited<ReturnType<typeof api.telegram.binding>>)),
  ])
  let tg: Awaited<ReturnType<typeof api.telegram.notificationPrefs>> | null = null
  if (binding.bound) tg = await api.telegram.notificationPrefs().catch(() => null)
  return { email, binding, tg }
}, { server: false })

// ── Email catalog ────────────────────────────────────────────────────────────
const emailOptions = ref<NotificationOption[]>([])
const emailPresets = computed(() => data.value?.email.presets ?? [])
const catalogVersion = computed(() => data.value?.email.current_catalog_version ?? 0)
watchEffect(() => { emailOptions.value = (data.value?.email.options ?? []).map((o) => ({ ...o })) })

const emailGroups = computed(() => {
  const order = ['account', 'peer_lifecycle', 'connectivity', 'monitoring']
  const groups = [...new Set(emailOptions.value.map((o) => o.group))]
  return groups.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
})
const enabledCount = computed(() => emailOptions.value.filter((o) => o.enabled).length)
function groupLabel(g: string) {
  return te(`notifications.groups.${g}`) ? t(`notifications.groups.${g}`) : t('notifications.groups.other')
}
function optionsIn(group: string) {
  return emailOptions.value.filter((o) => o.group === group)
}

const savingEmail = ref(false)
const showConfirm = ref(false)
const pendingConfirm = ref<string[]>([])

async function saveEmail(confirmed: string[] = []) {
  savingEmail.value = true
  try {
    await api.account.setNotificationPrefs({
      enabled_keys: emailOptions.value.filter((o) => o.enabled).map((o) => o.key),
      confirmed_disabled_critical_keys: confirmed,
      seen_catalog_version: catalogVersion.value,
      wizard_completed: true,
    })
    toast.show(t('notifications.saved'))
    showConfirm.value = false
  } catch (e) {
    if (e instanceof ApiError && (e.code === 'confirmation_required')) {
      pendingConfirm.value = (e.data.keys as string[]) || []
      showConfirm.value = true
    } else {
      toast.error(e)
      await refresh()
    }
  } finally {
    savingEmail.value = false
  }
}
function applyEmailPreset(keys: string[]) {
  const set = new Set(keys)
  emailOptions.value = emailOptions.value.map((o) => ({ ...o, enabled: set.has(o.key) }))
  saveEmail()
}

// ── Telegram ─────────────────────────────────────────────────────────────────
const binding = computed(() => data.value?.binding ?? { bound: false })
const botConfigured = computed(() => !!data.value?.binding?.bot_username)
const tgBusy = ref(false)
const tgDeeplink = ref('')

async function linkTelegram() {
  tgBusy.value = true
  try {
    const res = await api.telegram.bindToken()
    tgDeeplink.value = res.deeplink
    if (import.meta.client) window.open(res.deeplink, '_blank', 'noopener')
  } catch (e) {
    toast.error(e)
  } finally {
    tgBusy.value = false
  }
}
async function unlinkTelegram() {
  tgBusy.value = true
  try {
    await api.telegram.unbind()
    toast.show(t('notifications.telegram.unbound'))
    tgDeeplink.value = ''
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    tgBusy.value = false
  }
}

const tgOptions = ref<NotificationOption[]>([])
watchEffect(() => { tgOptions.value = (data.value?.tg?.options ?? []).map((o) => ({ ...o })) })
const tgPresets = computed(() => data.value?.tg?.presets ?? [])
const tgGroups = computed(() => [...new Set(tgOptions.value.map((o) => o.group))])
const savingTg = ref(false)
async function saveTelegram() {
  savingTg.value = true
  try {
    await api.telegram.setNotificationPrefs(tgOptions.value.filter((o) => o.enabled).map((o) => o.key))
    toast.show(t('notifications.saved'))
  } catch (e) {
    toast.error(e)
    await refresh()
  } finally {
    savingTg.value = false
  }
}
function applyTgPreset(keys: string[]) {
  const set = new Set(keys)
  tgOptions.value = tgOptions.value.map((o) => ({ ...o, enabled: set.has(o.key) }))
  saveTelegram()
}
function presetLabel(name: string) {
  return name.replace(/\b\w/g, (c) => c.toUpperCase())
}
</script>

<template>
  <div class="col gap-6">
    <PageHeader icon="notifications" :title="t('notifications.title')" :subtitle="t('notifications.subtitle')" />

    <!-- Email -->
    <section class="col gap-4">
      <div class="card card-elevated card-pad row space-between flex-wrap gap-4">
        <div :style="{ flex: 1, minWidth: '200px' }">
          <div class="md-title-small row gap-2"><MdSym name="mail" :size="20" class="txt-variant" /> {{ t('notifications.emailChannel') }}</div>
          <div class="md-body-small txt-variant">{{ t('notifications.enabledCount', { enabled: enabledCount, total: emailOptions.length }) }}</div>
        </div>
        <div class="row gap-2 flex-wrap">
          <MdChip v-for="p in emailPresets" :key="p.name" @click="applyEmailPreset(p.enabled_keys)">{{ presetLabel(p.name) }}</MdChip>
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
              <MdStatus v-if="o.kind === 'required'" kind="neutral" :dot="false">required</MdStatus>
              <MdStatus v-else-if="o.is_new" kind="info" :dot="false">new</MdStatus>
            </div>
            <div class="md-body-small txt-variant">{{ o.description }}</div>
          </div>
          <MdSwitch :model-value="o.enabled" :aria-label="o.name" @update:model-value="(v: boolean) => { o.enabled = v; saveEmail() }" />
        </div>
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
          <div v-if="botConfigured">
            <MdButton v-if="binding.bound" variant="text" icon="link_off" :loading="tgBusy" @click="unlinkTelegram">{{ t('notifications.telegram.unbind') }}</MdButton>
            <MdButton v-else variant="tonal" icon="send" :loading="tgBusy" @click="linkTelegram">{{ t('notifications.telegram.bind') }}</MdButton>
          </div>
        </div>
        <div v-if="tgDeeplink && !binding.bound" class="md-body-small" :style="{ marginTop: '14px', padding: '12px', borderRadius: '12px', background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }">
          <a :href="tgDeeplink" target="_blank" rel="noopener" class="row gap-2"><MdSym name="open_in_new" :size="16" /> {{ t('notifications.telegram.openLink') }}</a>
          <div :style="{ marginTop: '4px' }">{{ t('notifications.telegram.linkHint') }}</div>
        </div>
      </div>

      <!-- Telegram prefs (when bound) -->
      <template v-if="binding.bound && tgOptions.length">
        <div class="card card-elevated card-pad row space-between flex-wrap gap-3">
          <div class="md-title-small">{{ t('notifications.telegram.prefsTitle') }}</div>
          <div class="row gap-2 flex-wrap">
            <MdChip v-for="p in tgPresets" :key="p.name" @click="applyTgPreset(p.enabled_keys)">{{ presetLabel(p.name) }}</MdChip>
          </div>
        </div>
        <div v-for="g in tgGroups" :key="g" class="card card-elevated">
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
            <MdSwitch :model-value="o.enabled" :aria-label="o.name" @update:model-value="(v: boolean) => { o.enabled = v; saveTelegram() }" />
          </div>
        </div>
      </template>
    </section>

    <!-- Confirm disable dialog. Dismissing it (scrim / Escape / Cancel) re-syncs
         the optimistic switch state from the server via refresh(). A successful
         confirm sets showConfirm=false directly, which does NOT emit close. -->
    <MdDialog v-model:open="showConfirm" :title="t('notifications.confirmDisableTitle')" @close="refresh()">
      <p>{{ t('notifications.confirmDisableBody') }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="savingEmail" @click="saveEmail(pendingConfirm)">{{ t('common.confirm') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
