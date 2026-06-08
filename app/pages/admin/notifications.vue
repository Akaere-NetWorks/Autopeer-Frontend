<script setup lang="ts">
import type { NotificationSettingItem } from '~/types/admin'

definePageMeta({ middleware: 'admin', title: 'admin.notifications.title' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()

const { data, pending, refresh } = await useAsyncData('admin-notifications', () => api.admin.notifications.list(), { lazy: true, server: false })
const settings = computed<NotificationSettingItem[]>(() => data.value?.settings ?? [])

const TRUTHY = new Set(['true', '1', 'yes'])
function isOn(value: string) { return TRUTHY.has((value ?? '').trim().toLowerCase()) }

// One in-flight write at a time, keyed by setting key (prevents overlapping saves).
const saving = ref<string | null>(null)

// ── Enable/disable toggle, gated by a confirmation dialog (these flags drive global alerts) ──
const pendingToggle = ref<NotificationSettingItem | null>(null)
const pendingToggleValue = ref('')
const togglingKey = computed(() => (saving.value && pendingToggle.value && saving.value === pendingToggle.value.key ? saving.value : null))
const pendingToggleMessage = computed(() => isOn(pendingToggleValue.value) ? t('admin.notifications.confirmEnable') : t('admin.notifications.confirmDisable'))

function requestToggle(s: NotificationSettingItem) {
  if (saving.value) return
  pendingToggle.value = s
  pendingToggleValue.value = isOn(s.value) ? 'false' : 'true'
}
function closeToggle() {
  if (togglingKey.value) return
  pendingToggle.value = null
}
async function confirmToggle() {
  const s = pendingToggle.value
  if (!s || saving.value) return
  saving.value = s.key
  try {
    await api.admin.notifications.set(s.key, { value: pendingToggleValue.value })
    await refresh()
    toast.show(t('admin.notifications.saved'))
    pendingToggle.value = null
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = null
  }
}

// ── Edit threshold value dialog ──
const editing = ref<NotificationSettingItem | null>(null)
const thresholdDraft = ref('')
const savingThreshold = computed(() => (saving.value && editing.value && saving.value === editing.value.key ? saving.value : null))

function editThreshold(s: NotificationSettingItem) {
  if (saving.value) return
  editing.value = s
  thresholdDraft.value = s.threshold_value ?? ''
}
function closeThreshold() {
  if (savingThreshold.value) return
  editing.value = null
}
async function saveThreshold() {
  const s = editing.value
  if (!s || saving.value) return
  saving.value = s.key
  try {
    await api.admin.notifications.set(s.key, { threshold_value: thresholdDraft.value })
    await refresh()
    toast.show(t('admin.notifications.saved'))
    editing.value = null
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="notifications" :title="t('admin.notifications.title')" :subtitle="t('admin.notifications.subtitle')" />

    <div class="status status-warning" :style="{ alignItems: 'flex-start' }">
      <MdSym name="warning" :size="18" />
      <span>{{ t('admin.notifications.toggleWarning') }}</span>
    </div>

    <div v-if="data === null" class="col gap-3">
      <SkeletonBlock v-for="i in 5" :key="i" height="76px" radius="12px" />
    </div>
    <div v-else-if="!settings.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.notifications.empty') }}</div>

    <div v-else class="card card-elevated">
      <div
        v-for="(s, i) in settings"
        :key="s.key"
        class="list-item"
        :style="{ borderBottom: i < settings.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none', padding: '16px 20px', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }"
      >
        <div :style="{ flex: 1, minWidth: '220px' }">
          <div class="row gap-1" :style="{ alignItems: 'center' }">
            <span class="md-title-small mono">{{ s.key }}</span>
            <MdCopyButton :value="s.key" :size="28" silent :title="t('common.copy')" />
          </div>
          <div v-if="s.description" class="md-body-small txt-variant" :style="{ marginTop: '2px' }">{{ s.description }}</div>
          <div class="row gap-2" :style="{ alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }">
            <span class="md-body-small txt-variant">{{ t('admin.notifications.threshold') }}:</span>
            <span class="md-body-small mono">{{ s.threshold_value || t('common.dash') }}</span>
            <MdButton variant="text" icon="edit" :disabled="!!saving" @click="editThreshold(s)">{{ t('admin.notifications.editThreshold') }}</MdButton>
          </div>
        </div>

        <div class="row gap-3" :style="{ minWidth: '180px', alignItems: 'center', justifyContent: 'flex-end' }">
          <MdStatus :kind="isOn(s.value) ? 'success' : 'neutral'" :dot="false">
            {{ isOn(s.value) ? t('common.enabled') : t('common.disabled') }}
          </MdStatus>
          <MdSwitch
            :model-value="isOn(s.value)"
            :aria-label="s.key"
            :disabled="!!saving"
            @update:model-value="() => requestToggle(s)"
          />
        </div>
      </div>
    </div>

    <!-- Confirm enable/disable -->
    <MdDialog :open="!!pendingToggle" :title="t('admin.notifications.confirmTitle')" :submitting="!!togglingKey" @update:open="closeToggle">
      <div class="col gap-3" :style="{ marginTop: '4px' }">
        <div class="status status-warning" :style="{ alignItems: 'flex-start' }">
          <MdSym name="warning" :size="18" />
          <span>{{ pendingToggleMessage }}</span>
        </div>
        <div v-if="pendingToggle" class="card card-outlined card-pad">
          <div class="md-title-small mono">{{ pendingToggle.key }}</div>
          <div v-if="pendingToggle.description" class="md-body-small txt-variant" :style="{ marginTop: '4px' }">{{ pendingToggle.description }}</div>
        </div>
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="!!togglingKey" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="!!togglingKey" @click="confirmToggle">{{ t('common.save') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Edit threshold value -->
    <MdDialog :open="!!editing" :title="t('admin.notifications.editTitle')" :submitting="!!savingThreshold" @update:open="closeThreshold">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <div v-if="editing" class="md-body-small txt-variant">
          <span class="mono">{{ editing.key }}</span>
          <span v-if="editing.description"> — {{ editing.description }}</span>
        </div>
        <MdTextField
          :label="t('admin.notifications.thresholdLabel')"
          :model-value="thresholdDraft"
          mono
          tf-bg="var(--md-sys-color-surface-container-high)"
          :placeholder="t('admin.notifications.thresholdPlaceholder')"
          @update:model-value="(v: string) => (thresholdDraft = v)"
        />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="!!savingThreshold" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="!!savingThreshold" @click="saveThreshold">{{ t('common.save') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
