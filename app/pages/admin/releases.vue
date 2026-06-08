<script setup lang="ts">
import type { ReleaseItem } from '~/types/admin'

definePageMeta({ middleware: 'admin', title: 'nav.admin.releases' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const { fmtBytes, relTime } = useFormat()

const { data, pending, refresh } = await useAsyncData('admin-releases', () => api.admin.releases.list())
const releases = computed(() => data.value?.releases ?? [])

const showUpload = ref(false)
const deleteFor = ref<ReleaseItem | null>(null)
const uploading = ref(false)
const form = reactive({ version: '', os: 'linux', arch: 'amd64' })
const file = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  file.value = f ?? null
  if (f && !form.version) form.version = f.name.replace(/\.(bin|exe)$/, '')
}

async function doUpload() {
  if (!file.value) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('version', form.version)
    fd.append('os', form.os)
    fd.append('arch', form.arch)
    fd.append('binary', file.value)
    await api.admin.releases.upload(fd)
    toast.show(t('admin.releases.uploaded'))
    showUpload.value = false
    file.value = null
    Object.assign(form, { version: '', os: 'linux', arch: 'amd64' })
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    uploading.value = false
  }
}

async function doDelete() {
  const r = deleteFor.value!; deleteFor.value = null
  try {
    await api.admin.releases.remove(r.version, r.os, r.arch)
    toast.show(t('admin.releases.deleted'))
    await refresh()
  } catch (e) { toast.error(e) }
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="deployed_code" :title="t('admin.releases.title')" :subtitle="t('admin.releases.subtitle')">
      <template #action>
        <MdButton variant="filled" icon="upload" @click="showUpload = true">{{ t('admin.releases.upload') }}</MdButton>
      </template>
    </PageHeader>

    <div v-if="pending" class="col gap-3">
      <SkeletonBlock v-for="i in 3" :key="i" height="56px" radius="12px" />
    </div>
    <div v-else-if="!releases.length" class="card card-outlined card-pad text-center txt-variant">{{ t('admin.releases.empty') }}</div>

    <div v-else class="card card-elevated">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ t('admin.releases.version') }}</th>
              <th>{{ t('admin.releases.os') }}</th>
              <th>{{ t('admin.releases.arch') }}</th>
              <th>{{ t('admin.releases.size') }}</th>
              <th>{{ t('admin.releases.sha') }}</th>
              <th>{{ t('admin.releases.uploadedAt') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in releases" :key="`${r.version}-${r.os}-${r.arch}`">
              <td class="mono" :style="{ fontWeight: 500 }">{{ r.version }}</td>
              <td>{{ r.os }}</td>
              <td>{{ r.arch }}</td>
              <td class="mono">{{ fmtBytes(r.size) }}</td>
              <td><span class="code-inline">{{ r.sha256.slice(0, 12) }}…</span></td>
              <td>{{ relTime(r.uploaded_at) }}</td>
              <td :style="{ textAlign: 'right' }">
                <MdIconButton icon="delete" :title="t('common.delete')" @click="deleteFor = r" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Upload -->
    <MdDialog :open="showUpload" :title="t('admin.releases.uploadTitle')" @update:open="showUpload = false">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <input ref="fileInput" type="file" :style="{ display: 'none' }" @change="onFile">
        <button v-ripple type="button" class="card card-outlined card-pad state-layer row gap-3" :style="{ cursor: 'pointer', width: '100%', textAlign: 'left', '--slc': 'var(--md-sys-color-primary)' }" @click="fileInput?.click()">
          <MdSym name="attach_file" :style="{ color: 'var(--md-sys-color-primary)' }" />
          <span class="md-body-medium" :style="{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }">{{ file?.name || t('admin.releases.binary') }}</span>
          <span v-if="file" class="md-body-small txt-variant">{{ fmtBytes(file.size) }}</span>
        </button>
        <MdTextField :label="t('admin.releases.version')" :model-value="form.version" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.version = v)" />
        <div class="row gap-3">
          <MdTextField :label="t('admin.releases.os')" :model-value="form.os" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.os = v)" />
          <MdTextField :label="t('admin.releases.arch')" :model-value="form.arch" mono tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.arch = v)" />
        </div>
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :disabled="!file || !form.version" :loading="uploading" @click="doUpload">{{ t('admin.releases.upload') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Delete -->
    <MdDialog :open="!!deleteFor" :title="t('admin.releases.deleteTitle')" @update:open="deleteFor = null">
      <p :style="{ margin: 0 }">{{ t('admin.releases.deleteBody') }}</p>
      <template #actions="{ close }">
        <MdButton variant="text" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" @click="doDelete">{{ t('common.delete') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
