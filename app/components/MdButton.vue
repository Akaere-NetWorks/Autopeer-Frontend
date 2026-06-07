<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'filled' | 'tonal' | 'elevated' | 'outlined' | 'text'
  icon?: string
  trailingIcon?: string
  large?: boolean
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit'
  block?: boolean
}>(), { variant: 'filled', type: 'button' })

defineEmits<{ click: [MouseEvent] }>()
</script>

<template>
  <button
    v-ripple
    :type="type"
    :disabled="disabled || loading"
    class="btn"
    :class="[`btn-${variant}`, { 'btn-lg': large, 'full-btn': block }]"
    @click="$emit('click', $event)"
  >
    <MdSym v-if="loading" name="progress_activity" class="spinning" />
    <MdSym v-else-if="icon" :name="icon" />
    <span><slot /></span>
    <MdSym v-if="trailingIcon" :name="trailingIcon" :style="{ marginLeft: '-4px', marginRight: '-4px' }" />
  </button>
</template>
