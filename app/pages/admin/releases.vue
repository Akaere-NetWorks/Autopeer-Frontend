<script setup lang="ts">
import type { ReleaseItem } from '~/types/admin'

definePageMeta({ middleware: 'admin', title: 'nav.admin.releases' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()
const { fmtBytes, relTime } = useFormat()

const { data, pending, refresh } = await useAsyncData('admin-releases', () => api.admin.releases.list(), { lazy: true, server: false })
const releases = computed(() => data.value?.releases ?? [])

const showUpload = ref(false)
const deleteFor = ref<ReleaseItem | null>(null)

// ── Upload ────────────────────────────────────────────────────────────────
const uploading = ref(false)
const uploadProgress = ref(0) // 0..100, determinate while bytes stream
const uploadError = ref('')
const form = reactive({ version: '', os: 'linux', arch: 'amd64' })
const file = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

// Same cookie the API client reads its bearer token from.
const token = useCookie<string | null>('token', { sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })

function openUpload() {
  uploadError.value = ''
  uploadProgress.value = 0
  showUpload.value = true
}

function onFile(e: Event) {
  // No filename → version inference: the artifact must be uploaded under the
  // exact version the admin types, never a guessed one.
  file.value = (e.target as HTMLInputElement).files?.[0] ?? null
  uploadError.value = ''
}

function closeUpload() {
  if (uploading.value) return
  showUpload.value = false
}

function resetUpload() {
  file.value = null
  if (fileInput.value) fileInput.value.value = ''
  Object.assign(form, { version: '', os: 'linux', arch: 'amd64' })
  uploadProgress.value = 0
  uploadError.value = ''
}

// Upload via XHR so we can report determinate progress for large binaries
// (the binary cap is 100 MB server-side). Mirrors the API client's auth: the
// request is proxied same-origin and carries the `token` cookie as a bearer.
function uploadWithProgress(fd: FormData): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/v1/admin/releases')
    if (token.value) xhr.setRequestHeader('Authorization', `Bearer ${token.value}`)
    xhr.upload.addEventListener('progress', (ev) => {
      if (ev.lengthComputable) uploadProgress.value = Math.round((ev.loaded / ev.total) * 100)
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        uploadProgress.value = 100
        resolve()
        return
      }
      // Map the backend's typed error codes to friendly copy.
      let code = ''
      let message = ''
      try {
        const body = JSON.parse(xhr.responseText) as { error?: string, message?: string }
        code = body.error ?? ''
        message = body.message ?? ''
      } catch { /* non-JSON body */ }
      if (xhr.status === 409 || code === 'version_exists') reject(new Error(t('admin.releases.duplicate')))
      else if (xhr.status === 413 || code === 'too_large') reject(new Error(t('admin.releases.tooLarge')))
      else reject(new Error(message || t('admin.releases.uploadFailed')))
    })
    xhr.addEventListener('error', () => reject(new Error(t('admin.releases.uploadFailed'))))
    xhr.addEventListener('abort', () => reject(new Error(t('admin.releases.uploadFailed'))))
    xhr.send(fd)
  })
}

async function doUpload() {
  if (!file.value || !form.version) return
  uploadError.value = ''
  uploading.value = true
  uploadProgress.value = 0
  try {
    const fd = new FormData()
    fd.append('version', form.version)
    fd.append('os', form.os)
    fd.append('arch', form.arch)
    fd.append('binary', file.value)
    await uploadWithProgress(fd)
    toast.show(t('admin.releases.uploaded'))
    showUpload.value = false
    resetUpload()
    await refresh()
  } catch (e) {
    uploadError.value = (e as Error)?.message || t('admin.releases.uploadFailed')
  } finally {
    uploading.value = false
  }
}

// ── Delete ────────────────────────────────────────────────────────────────
const deleting = ref(false)

function closeDelete() {
  if (deleting.value) return
  deleteFor.value = null
}

async function doDelete() {
  const r = deleteFor.value
  if (!r) return
  deleting.value = true
  try {
    await api.admin.releases.remove(r.version, r.os, r.arch)
    toast.show(t('admin.releases.deleted'))
    deleteFor.value = null
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="col gap-5">
    <PageHeader icon="deployed_code" :title="t('admin.releases.title')" :subtitle="t('admin.releases.subtitle')">
      <template #action>
        <MdButton variant="filled" icon="upload" @click="openUpload">{{ t('admin.releases.upload') }}</MdButton>
      </template>
    </PageHeader>

    <div v-if="data === null" class="col gap-3">
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
              <th>{{ t('admin.releases.uploadedBy') }}</th>
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
              <td>
                <span class="row gap-1" :style="{ alignItems: 'center' }">
                  <span class="code-inline">{{ r.sha256.slice(0, 12) }}…</span>
                  <MdCopyButton :value="r.sha256" :size="28" :title="t('admin.releases.sha')" />
                </span>
              </td>
              <td class="txt-variant">{{ r.uploaded_by || '—' }}</td>
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
    <MdDialog :open="showUpload" :title="t('admin.releases.uploadTitle')" :submitting="uploading" @update:open="closeUpload">
      <div class="col gap-4" :style="{ marginTop: '8px' }">
        <div v-if="uploadError" class="status status-error" :style="{ alignItems: 'flex-start' }">
          <MdSym name="error" :size="18" />
          <span>{{ uploadError }}</span>
        </div>
        <input ref="fileInput" type="file" :style="{ display: 'none' }" @change="onFile">
        <button v-ripple type="button" class="card card-outlined card-pad state-layer row gap-3" :disabled="uploading" :style="{ cursor: uploading ? 'default' : 'pointer', width: '100%', textAlign: 'left', '--slc': 'var(--md-sys-color-primary)' }" @click="fileInput?.click()">
          <MdSym name="attach_file" :style="{ color: 'var(--md-sys-color-primary)' }" />
          <span class="md-body-medium" :style="{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }">{{ file?.name || t('admin.releases.binary') }}</span>
          <span v-if="file" class="md-body-small txt-variant">{{ fmtBytes(file.size) }}</span>
        </button>
        <MdTextField :label="t('admin.releases.version')" :model-value="form.version" mono :disabled="uploading" :placeholder="t('admin.releases.versionPlaceholder')" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.version = v)" />
        <div class="row gap-3">
          <MdTextField :label="t('admin.releases.os')" :model-value="form.os" mono :disabled="uploading" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.os = v)" />
          <MdTextField :label="t('admin.releases.arch')" :model-value="form.arch" mono :disabled="uploading" tf-bg="var(--md-sys-color-surface-container-high)" @update:model-value="(v: string) => (form.arch = v)" />
        </div>
        <div v-if="uploading" class="col gap-2" aria-live="polite">
          <div class="row gap-2 md-body-small txt-variant" :style="{ justifyContent: 'space-between' }">
            <!-- Bytes are fully sent at 100% but the server is still hashing/storing:
                 say so instead of letting the bar look stalled. -->
            <span>{{ uploadProgress >= 100 ? t('admin.releases.processing') : t('admin.releases.uploading') }}</span>
            <span class="mono">{{ uploadProgress }}%</span>
          </div>
          <div class="progress-track" role="progressbar" :aria-valuenow="uploadProgress" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-bar" :style="{ width: `${uploadProgress}%` }" />
          </div>
        </div>
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="uploading" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :disabled="!file || !form.version" :loading="uploading" @click="doUpload">{{ t('admin.releases.upload') }}</MdButton>
      </template>
    </MdDialog>

    <!-- Delete -->
    <MdDialog :open="!!deleteFor" :title="t('admin.releases.deleteTitle')" :submitting="deleting" @update:open="closeDelete">
      <div class="col gap-4" :style="{ marginTop: '4px' }">
        <p :style="{ margin: 0 }">{{ t('admin.releases.deleteBody') }}</p>
        <div v-if="deleteFor" class="card card-outlined card-pad col gap-2">
          <div class="row gap-2" :style="{ justifyContent: 'space-between' }">
            <span class="md-body-small txt-variant">{{ t('admin.releases.version') }}</span>
            <span class="mono md-body-small">{{ deleteFor.version }}</span>
          </div>
          <div class="row gap-2" :style="{ justifyContent: 'space-between' }">
            <span class="md-body-small txt-variant">{{ t('admin.releases.os') }}</span>
            <span class="mono md-body-small">{{ deleteFor.os }}</span>
          </div>
          <div class="row gap-2" :style="{ justifyContent: 'space-between' }">
            <span class="md-body-small txt-variant">{{ t('admin.releases.arch') }}</span>
            <span class="mono md-body-small">{{ deleteFor.arch }}</span>
          </div>
          <div class="col gap-1">
            <span class="md-body-small txt-variant">{{ t('admin.releases.sha') }}</span>
            <span class="row gap-1" :style="{ alignItems: 'center' }">
              <span class="code-inline mono md-body-small" :style="{ wordBreak: 'break-all' }">{{ deleteFor.sha256 }}</span>
              <MdCopyButton :value="deleteFor.sha256" :size="28" :title="t('admin.releases.sha')" />
            </span>
          </div>
        </div>
      </div>
      <template #actions="{ close }">
        <MdButton variant="text" :disabled="deleting" @click="close">{{ t('common.cancel') }}</MdButton>
        <MdButton variant="filled" :loading="deleting" :style="{ background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }" @click="doDelete">{{ t('common.delete') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
