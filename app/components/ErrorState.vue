<script setup lang="ts">
/** Standard inline error state: icon + message + retry button. */
defineProps<{
  message: string
  /** Hide the retry button (when there is no retry path). */
  noRetry?: boolean
}>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="col gap-3 text-center" :style="{ alignItems: 'center', padding: '40px 16px' }">
    <MdSym name="error" :size="36" :style="{ color: 'var(--md-sys-color-error)' }" />
    <div class="md-body-medium txt-variant" :style="{ maxWidth: '480px', wordBreak: 'break-word' }">{{ message }}</div>
    <MdButton v-if="!noRetry" variant="tonal" icon="refresh" @click="emit('retry')">{{ t('common.retry') }}</MdButton>
  </div>
</template>
