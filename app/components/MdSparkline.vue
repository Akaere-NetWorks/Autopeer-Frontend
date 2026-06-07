<script setup lang="ts">
const props = withDefaults(defineProps<{
  data: number[]
  color?: string
  width?: number
  height?: number
}>(), { color: 'primary', width: 120, height: 36 })

const points = computed(() => sparklinePoints(props.data, props.width, props.height))
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    :style="{ width: `${width}px`, height: `${height}px`, display: 'block' }"
    aria-hidden="true"
  >
    <polyline
      v-if="points"
      :points="points"
      fill="none"
      :stroke="`var(--md-sys-color-${color})`"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
