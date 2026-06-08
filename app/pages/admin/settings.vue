<script setup lang="ts">
definePageMeta({ middleware: 'admin', title: 'nav.admin.settings' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()

const { data, pending, refresh } = await useAsyncData('admin-settings', () => api.admin.settings.list(), { server: false })
const drafts = reactive<Record<string, string>>({})
watchEffect(() => {
  for (const s of data.value?.settings ?? []) if (!(s.key in drafts)) drafts[s.key] = s.value
})
const settings = computed(() => data.value?.settings ?? [])
const saving = ref<string | null>(null)

function dirty(key: string, value: string) { return drafts[key] !== undefined && drafts[key] !== value }

async function save(key: string) {
  saving.value = key
  try {
    await api.admin.settings.set(key, drafts[key] ?? '')
    toast.show(t('admin.settings.saved'))
    await refresh()
  } catch (e) { toast.error(e) } finally { saving.value = null }
}

// Test email
const showTest = ref(false)
const testTo = ref('')
const testMsg = ref('')
const sending = ref(false)
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

    <div v-if="pending" class="col gap-3">
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
        <div class="row gap-2" :style="{ flex: 1, minWidth: '260px', alignItems: 'center' }">
          <div :style="{ flex: 1 }">
            <MdTextField :model-value="drafts[s.key] ?? s.value" mono tf-bg="var(--md-sys-color-surface-container-low)" @update:model-value="(v: string) => (drafts[s.key] = v)" />
          </div>
          <MdIconButton icon="save" variant="tonal" :title="t('common.save')" :disabled="!dirty(s.key, s.value)" :loading="saving === s.key" @click="save(s.key)" />
        </div>
      </div>
    </div>

    <MdDialog :open="showTest" :title="t('admin.settings.testEmailTitle')" @update:open="showTest = false">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <MdTextField :label="t('admin.settings.to')" :model-value="testTo" icon="mail" inputmode="email" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (testTo = v)" />
        <MdTextField :label="`${t('admin.settings.message')} (${t('common.optional')})`" :model-value="testMsg" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (testMsg = v)" />
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :disabled="!testTo" :loading="sending" @click="sendTest">{{ t('admin.settings.testEmail') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
