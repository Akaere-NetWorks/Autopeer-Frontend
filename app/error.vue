<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()

const code = computed(() => props.error?.statusCode ?? 500)
// Three buckets: not-found, gateway/maintenance (the backend is unreachable),
// and generic server error.
const kind = computed(() => {
  if (code.value === 404) return '404'
  if ([502, 503, 504].includes(code.value)) return 'unavailable'
  return '500'
})
const title = computed(() => ({
  404: t('errors.page404Title'),
  unavailable: t('errors.pageUnavailableTitle'),
  500: t('errors.page500Title'),
}[kind.value]))
const body = computed(() => ({
  404: t('errors.page404Body'),
  unavailable: t('errors.pageUnavailableBody'),
  500: t('errors.page500Body'),
}[kind.value]))
const icon = computed(() => ({
  404: 'travel_explore',
  unavailable: 'cloud_off',
  500: 'error',
}[kind.value]))

useHead({ title: () => `${code.value}` })

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div :style="{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-background)', padding: '24px' }">
    <div class="text-center col gap-4" :style="{ alignItems: 'center', maxWidth: '460px' }">
      <span :style="{ display: 'inline-flex', width: '96px', height: '96px', borderRadius: '28px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }">
        <MdSym :name="icon" :size="48" fill />
      </span>
      <div class="md-display-small mono" :style="{ color: 'var(--md-sys-color-on-surface-variant)' }">{{ code }}</div>
      <h1 class="md-headline-medium" :style="{ margin: 0 }">{{ title }}</h1>
      <p class="md-body-large txt-variant" :style="{ margin: 0 }">{{ body }}</p>
      <MdButton variant="filled" icon="home" large @click="goHome">{{ t('errors.backHome') }}</MdButton>
    </div>
  </div>
</template>
