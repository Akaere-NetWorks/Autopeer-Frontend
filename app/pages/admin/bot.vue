<script setup lang="ts">
import type { BotBlockedUser } from '~/types/admin'

definePageMeta({ middleware: 'admin', title: 'nav.admin.bot' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const { relTime } = useFormat()

const { data, pending, refresh } = await useAsyncData('admin-bot', async () => {
  const [stats, settings, commands, blocked] = await Promise.all([
    api.admin.bot.stats(),
    api.admin.bot.settings(),
    api.admin.bot.commands(1).catch(() => ({ commands: [], total: 0, page: 1, per_page: 50 })),
    api.admin.bot.blocked().catch(() => ({ blocked_users: [] })),
  ])
  return { stats, settings, commands, blocked }
}, { lazy: true, server: false })

const stats = computed(() => data.value?.stats)
const settings = computed(() => data.value?.settings.settings ?? [])
const commands = computed(() => data.value?.commands.commands ?? [])
const blocked = computed(() => data.value?.blocked.blocked_users ?? [])

const tiles = computed(() => [
  { icon: 'tag', label: t('admin.bot.totalCommands'), value: stats.value?.total_commands ?? 0 },
  { icon: 'group', label: t('admin.bot.uniqueUsers'), value: stats.value?.unique_users ?? 0 },
  { icon: 'schedule', label: t('admin.bot.lastCommand'), value: stats.value?.last_command_at ? relTime(stats.value.last_command_at) : t('common.never') },
])

// settings drafts
const drafts = reactive<Record<string, string>>({})
watchEffect(() => { for (const s of settings.value) if (!(s.key in drafts)) drafts[s.key] = s.value })
const saving = ref<string | null>(null)
async function saveSetting(key: string) {
  saving.value = key
  try { await api.admin.bot.setSetting(key, drafts[key] ?? ''); toast.show(t('admin.bot.saved')); await refresh() }
  catch (e) { toast.error(e) } finally { saving.value = null }
}

// Token reset invalidates the current token immediately — gate it behind an
// explicit confirmation before calling the API.
const showResetConfirm = ref(false)
const resetting = ref(false)
const tokenDialog = ref<string | null>(null)
async function resetToken() {
  resetting.value = true
  try {
    const r = await api.admin.bot.resetToken()
    showResetConfirm.value = false
    tokenDialog.value = r.new_token
    await refresh()
  }
  catch (e) { toast.error(e) }
  finally { resetting.value = false }
}

const showBlock = ref(false)
const blockForm = reactive({ tg_user_id: '', username: '', reason: '' })
async function doBlock() {
  try {
    await api.admin.bot.block({ tg_user_id: Number(blockForm.tg_user_id), username: blockForm.username || undefined, reason: blockForm.reason || undefined })
    toast.show(t('admin.bot.blocked')); showBlock.value = false
    Object.assign(blockForm, { tg_user_id: '', username: '', reason: '' })
    await refresh()
  } catch (e) { toast.error(e) }
}
async function unblock(u: BotBlockedUser) {
  try { await api.admin.bot.unblock(u.id); toast.show(t('admin.bot.unblocked')); await refresh() } catch (e) { toast.error(e) }
}
async function copy(text: string) {
  if (import.meta.client && navigator.clipboard) { await navigator.clipboard.writeText(text); toast.show(t('common.copied')) }
}
</script>

<template>
  <div class="col gap-6">
    <PageHeader icon="smart_toy" :title="t('admin.bot.title')" :subtitle="t('admin.bot.subtitle')">
      <template #action>
        <MdStatus :kind="stats?.bot_connected ? 'success' : 'neutral'">
          <span class="dot" /> {{ stats?.bot_connected ? t('admin.bot.connected') : t('admin.bot.disconnected') }}
        </MdStatus>
      </template>
    </PageHeader>

    <div v-if="data === null" class="col gap-3"><SkeletonBlock v-for="i in 4" :key="i" height="80px" radius="12px" /></div>

    <template v-else>
      <section class="metric-3">
        <div v-for="m in tiles" :key="m.label" class="card card-elevated metric-tile">
          <div class="metric-label md-label-large"><MdSym :name="m.icon" :size="18" /> {{ m.label }}</div>
          <div class="metric-value md-headline-medium">{{ m.value }}</div>
        </div>
      </section>

      <!-- Settings -->
      <section class="col gap-3">
        <div class="row space-between" :style="{ alignItems: 'center' }">
          <h2 class="md-title-large" :style="{ margin: 0 }">{{ t('admin.bot.settings') }}</h2>
          <MdButton variant="text" icon="key" @click="showResetConfirm = true">{{ t('admin.bot.resetToken') }}</MdButton>
        </div>
        <div class="card card-elevated">
          <div v-for="(s, i) in settings" :key="s.key" class="list-item" :style="{ borderBottom: i < settings.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none', padding: '16px 20px', flexWrap: 'wrap' }">
            <div :style="{ flex: 1, minWidth: '200px' }">
              <div class="md-title-small mono">{{ s.key }}</div>
              <div v-if="s.description" class="md-body-small txt-variant">{{ s.description }}</div>
            </div>
            <div class="row gap-2" :style="{ flex: 1, minWidth: '240px', alignItems: 'center' }">
              <div :style="{ flex: 1 }"><MdTextField :model-value="drafts[s.key] ?? s.value" mono tf-bg="var(--md-sys-color-surface-container-low)" @update:model-value="(v: string) => (drafts[s.key] = v)" /></div>
              <MdIconButton icon="save" variant="tonal" :title="t('common.save')" :disabled="drafts[s.key] === s.value" :loading="saving === s.key" @click="saveSetting(s.key)" />
            </div>
          </div>
        </div>
      </section>

      <!-- Blocked users -->
      <section class="col gap-3">
        <div class="row space-between" :style="{ alignItems: 'center' }">
          <h2 class="md-title-large" :style="{ margin: 0 }">{{ t('admin.bot.blockedUsers') }}</h2>
          <MdButton variant="tonal" icon="block" @click="showBlock = true">{{ t('admin.bot.block') }}</MdButton>
        </div>
        <div v-if="!blocked.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.bot.noBlocked') }}</div>
        <div v-else class="card card-elevated">
          <div v-for="(u, i) in blocked" :key="u.id" class="list-item" :style="{ borderBottom: i < blocked.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none', padding: '12px 20px' }">
            <div :style="{ flex: 1, minWidth: 0 }">
              <div class="md-title-small">{{ u.username || `ID ${u.tg_user_id}` }} <span class="md-body-small mono txt-variant">· {{ u.tg_user_id }}</span></div>
              <div v-if="u.reason" class="md-body-small txt-variant">{{ u.reason }}</div>
            </div>
            <span class="md-body-small txt-variant" :style="{ marginRight: '8px' }">{{ relTime(u.blocked_at) }}</span>
            <MdButton variant="text" @click="unblock(u)">{{ t('admin.bot.unblock') }}</MdButton>
          </div>
        </div>
      </section>

      <!-- Recent commands -->
      <section class="col gap-3">
        <h2 class="md-title-large" :style="{ margin: 0 }">{{ t('admin.bot.recentCommands') }}</h2>
        <div v-if="!commands.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.bot.noCommands') }}</div>
        <div v-else class="card card-elevated">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>{{ t('admin.bot.command') }}</th><th>{{ t('admin.bot.user') }}</th><th>{{ t('admin.bot.time') }}</th></tr></thead>
              <tbody>
                <tr v-for="c in commands" :key="c.id">
                  <td class="mono">{{ c.command }}</td>
                  <td>{{ c.username || c.tg_user_id }}</td>
                  <td>{{ relTime(c.created_at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>

    <!-- Block dialog -->
    <MdDialog :open="showBlock" :title="t('admin.bot.blockTitle')" @update:open="showBlock = false">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <MdTextField :label="t('admin.bot.tgUserId')" :model-value="blockForm.tg_user_id" mono inputmode="numeric" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (blockForm.tg_user_id = v.replace(/\D/g, ''))" />
        <MdTextField :label="`${t('admin.bot.user')} (${t('common.optional')})`" :model-value="blockForm.username" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (blockForm.username = v)" />
        <MdTextField :label="`${t('admin.bot.reason')} (${t('common.optional')})`" :model-value="blockForm.reason" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (blockForm.reason = v)" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :disabled="!blockForm.tg_user_id" @click="doBlock">{{ t('admin.bot.block') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Token reset confirmation -->
    <ConfirmDialog
      v-model:open="showResetConfirm"
      :title="t('admin.bot.resetTokenTitle')"
      :warning="t('admin.bot.resetTokenWarning')"
      :confirm-label="t('admin.bot.resetToken')"
      confirm-icon="key"
      :submitting="resetting"
      @confirm="resetToken"
    />

    <!-- Token reveal -->
    <MdDialog :open="!!tokenDialog" :title="t('admin.bot.tokenTitle')" @update:open="tokenDialog = null">
      <p :style="{ margin: '0 0 12px' }">{{ t('admin.bot.tokenBody') }}</p>
      <div class="code-block" :style="{ position: 'relative', wordBreak: 'break-all', whiteSpace: 'normal' }">
        {{ tokenDialog }}
        <button class="icon-btn" :style="{ position: 'absolute', top: '6px', right: '6px', width: '32px', height: '32px' }" :title="t('common.copy')" @click="copy(tokenDialog!)">
          <MdSym name="content_copy" :size="18" />
        </button>
      </div>
      <template #actions="{ close }">
        <MdButton variant="filled" @click="close">{{ t('common.close') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
