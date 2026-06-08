<script setup lang="ts">
import type { SiteSettingItem } from '~/types/admin'

definePageMeta({ middleware: 'admin', title: 'nav.admin.settings' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()

const { data, pending, refresh } = await useAsyncData('admin-settings', () => api.admin.settings.list(), { lazy: true, server: false })
const settings = computed<SiteSettingItem[]>(() => data.value?.settings ?? [])

// Per-key text drafts (non-boolean settings). Re-seeded from server truth whenever a key isn't currently tracked.
const drafts = reactive<Record<string, string>>({})
watchEffect(() => {
  for (const s of settings.value) if (!(s.key in drafts)) drafts[s.key] = s.value
})

// One in-flight save at a time, keyed by setting key (prevents overlapping saves).
const saving = ref<string | null>(null)

const TRUTHY = new Set(['true', '1', 'yes'])
const BOOLEAN_VALUES = new Set(['true', 'false', '1', '0', 'yes', 'no'])
function isBoolean(s: SiteSettingItem) { return BOOLEAN_VALUES.has(s.value.trim().toLowerCase()) }
function isOn(value: string) { return TRUTHY.has(value.trim().toLowerCase()) }
function dirty(s: SiteSettingItem) { return drafts[s.key] !== undefined && drafts[s.key] !== s.value }

// Persist a single key. Re-syncs the draft to server truth on success; reverts on error.
async function persist(key: string, value: string): Promise<boolean> {
  if (saving.value) return false
  saving.value = key
  try {
    await api.admin.settings.set(key, value)
    await refresh()
    // Drop the local draft so watchEffect re-seeds it from the freshly loaded (canonical) server value.
    delete drafts[key]
    toast.show(t('admin.settings.saved'))
    return true
  } catch (e) {
    // Revert the displayed draft to the last known server value so the UI reflects what actually persisted.
    const current = settings.value.find(s => s.key === key)
    if (current) drafts[key] = current.value
    toast.error(e)
    return false
  } finally {
    saving.value = null
  }
}

function saveText(s: SiteSettingItem) {
  if (!dirty(s)) return
  void persist(s.key, drafts[s.key] ?? '')
}

// Boolean settings: toggling opens a confirmation dialog (these flags are global/dangerous) instead of saving immediately.
const pendingToggle = ref<SiteSettingItem | null>(null)
const pendingToggleValue = ref('')
const togglingKey = computed(() => (saving.value && pendingToggle.value && saving.value === pendingToggle.value.key ? saving.value : null))
const pendingToggleMessage = computed(() => isOn(pendingToggleValue.value) ? t('admin.settings.confirmEnable') : t('admin.settings.confirmDisable'))

function requestToggle(s: SiteSettingItem) {
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
  if (!s) return
  const ok = await persist(s.key, pendingToggleValue.value)
  if (ok) pendingToggle.value = null
}

// Test email
const showTest = ref(false)
const testTo = ref('')
const testMsg = ref('')
const sending = ref(false)
function closeTest() {
  if (sending.value) return
  showTest.value = false
}
async function sendTest() {
  sending.value = true
  try {
    await api.admin.notifications.testEmail(testTo.value, testMsg.value || undefined)
    toast.show(t('admin.settings.sent'))
    showTest.value = false
    testTo.value = ''; testMsg.value = ''
  } catch (e) { toast.error(e) } finally { sending.value = false }
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="tune" :title="t('admin.settings.title')" :subtitle="t('admin.settings.subtitle')">
      <template #action>
        <MdButton variant="tonal" icon="outgoing_mail" @click="showTest = true">{{ t('admin.settings.testEmail') }}</MdButton>
      </template>
    </PageHeader>

    <div v-if="data === null" class="col gap-3">
      <SkeletonBlock v-for="i in 5" :key="i" height="72px" radius="12px" />
    </div>
    <div v-else-if="!settings.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.settings.empty') }}</div>

    <div v-else class="card card-elevated">
      <div
        v-for="(s, i) in settings"
        :key="s.key"
        class="list-item"
        :style="{ borderBottom: i < settings.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none', padding: '16px 20px', alignItems: 'flex-start', flexWrap: 'wrap' }"
      >
        <div :style="{ flex: 1, minWidth: '220px' }">
          <div class="md-title-small mono">{{ s.key }}</div>
          <div v-if="s.description" class="md-body-small txt-variant">{{ s.description }}</div>
        </div>

        <!-- Boolean setting: proper toggle gated by a confirmation dialog -->
        <div v-if="isBoolean(s)" class="row gap-3" :style="{ flex: 1, minWidth: '260px', alignItems: 'center', justifyContent: 'flex-end' }">
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

        <!-- Free-form setting: draft text field + per-setting save -->
        <div v-else class="row gap-2" :style="{ flex: 1, minWidth: '260px', alignItems: 'center' }">
          <div :style="{ flex: 1 }">
            <MdTextField
              :model-value="drafts[s.key] ?? s.value"
              mono
              tf-bg="var(--md-sys-color-surface-container-low)"
              :disabled="saving === s.key"
              @update:model-value="(v: string) => (drafts[s.key] = v)"
            />
          </div>
          <MdIconButton
            icon="save"
            variant="tonal"
            :title="t('common.save')"
            :disabled="!dirty(s) || (!!saving && saving !== s.key)"
            :loading="saving === s.key"
            @click="saveText(s)"
          />
        </div>
      </div>
    </div>

    <!-- Confirm boolean toggle -->
    <MdDialog :open="!!pendingToggle" :title="t('admin.settings.confirmTitle')" :submitting="!!togglingKey" @update:open="closeToggle">
      <div class="col gap-3" :style="{ marginTop: '4px' }">
        <div class="status status-warning" :style="{ alignItems: 'flex-start' }">
          <MdSym name="warning" :size="18" />
          <span>{{ t('admin.settings.toggleWarning') }}</span>
        </div>
        <div class="status status-warning" :style="{ display: 'block' }">
          {{ pendingToggleMessage }}
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

    <!-- Test email -->
    <MdDialog :open="showTest" :title="t('admin.settings.testEmailTitle')" :submitting="sending" @update:open="closeTest">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <MdTextField :label="t('admin.settings.to')" :model-value="testTo" icon="mail" inputmode="email" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (testTo = v)" />
        <MdTextField :label="`${t('admin.settings.message')} (${t('common.optional')})`" :model-value="testMsg" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (testMsg = v)" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="sending" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :disabled="!testTo" :loading="sending" @click="sendTest">{{ t('admin.settings.testEmail') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
