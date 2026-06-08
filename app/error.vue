<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()

const is404 = computed(() => props.error?.statusCode === 404)
const title = computed(() => (is404.value ? t('errors.page404Title') : t('errors.page500Title')))
const body = computed(() => (is404.value ? t('errors.page404Body') : t('errors.page500Body')))

useHead({ title: () => `${props.error?.statusCode ?? 500}` })

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div :style="{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-background)', padding: '24px' }">
    <div class="text-center col gap-4" :style="{ alignItems: 'center', maxWidth: '460px' }">
      <span :style="{ display: 'inline-flex', width: '96px', height: '96px', borderRadius: '28px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }">
        <MdSym :name="is404 ? 'travel_explore' : 'error'" :size="48" fill />
      </span>
      <div class="md-display-small mono" :style="{ color: 'var(--md-sys-color-on-surface-variant)' }">{{ error?.statusCode || 500 }}</div>
      <h1 class="md-headline-medium" :style="{ margin: 0 }">{{ title }}</h1>
      <p class="md-body-large txt-variant" :style="{ margin: 0 }">{{ body }}</p>
      <MdButton variant="filled" icon="home" large @click="goHome">{{ t('errors.backHome') }}</MdButton>
    </div>
  </div>
</template>
