<script setup lang="ts">
const props = withDefaults(defineProps<{
  data: number[]
  color?: string
  height?: number
  label?: string
  fillOpacity?: number
}>(), { color: 'primary', height: 140, fillOpacity: 0.16 })

const W = 560
const gradId = `area-grad-${useId()}`

const paths = computed(() => buildSmoothPath(props.data, W, props.height, 6))
const stroke = computed(() => `var(--md-sys-color-${props.color})`)
const topStop = computed(() => props.fillOpacity + 0.12)
</script>

<template>
  <svg
    :viewBox="`0 0 ${W} ${height}`"
    preserveAspectRatio="none"
    :style="{ width: '100%', height: `${height}px`, display: 'block' }"
    :aria-label="label"
    role="img"
  >
    <defs>
      <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="stroke" :stop-opacity="topStop" />
        <stop offset="100%" :stop-color="stroke" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path v-if="paths.area" :d="paths.area" :fill="`url(#${gradId})`" />
    <path v-if="paths.line" :d="paths.line" fill="none" :stroke="stroke" stroke-width="2.5" stroke-linecap="round" />
  </svg>
</template>
