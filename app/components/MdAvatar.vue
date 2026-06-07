<script setup lang="ts">
const props = withDefaults(defineProps<{
  text: string
  size?: number
  tone?: 'tertiary' | 'primary' | 'secondary'
}>(), { size: 40, tone: 'tertiary' })

const tones: Record<string, [string, string]> = {
  tertiary: ['var(--md-sys-color-tertiary-container)', 'var(--md-sys-color-on-tertiary-container)'],
  primary: ['var(--md-sys-color-primary-container)', 'var(--md-sys-color-on-primary-container)'],
  secondary: ['var(--md-sys-color-secondary-container)', 'var(--md-sys-color-on-secondary-container)'],
}

const style = computed(() => {
  const [bg, fg] = tones[props.tone] || tones.tertiary!
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    background: bg,
    color: fg,
    fontSize: `${props.size * 0.38}px`,
  }
})
</script>

<template>
  <span class="avatar" :style="style">{{ text }}</span>
</template>
