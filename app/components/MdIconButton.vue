<script setup lang="ts">
defineProps<{
  icon: string
  variant?: 'filled' | 'tonal' | 'outlined'
  title?: string
  fill?: boolean
  disabled?: boolean
  loading?: boolean
}>()

defineEmits<{ click: [MouseEvent] }>()
</script>

<template>
  <button
    v-ripple
    type="button"
    :title="title"
    :aria-label="title"
    :disabled="disabled || loading"
    class="icon-btn"
    :class="variant ? `icon-btn-${variant}` : undefined"
    @click="$emit('click', $event)"
  >
    <MdSym :name="loading ? 'progress_activity' : icon" :fill="fill" :class="{ spinning: loading }" />
  </button>
</template>
