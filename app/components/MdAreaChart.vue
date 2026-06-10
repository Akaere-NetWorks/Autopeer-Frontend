<script setup lang="ts">
const props = withDefaults(defineProps<{
  data: number[]
  color?: string
  height?: number
  label?: string
  fillOpacity?: number
  /** Optional value formatter; when set, max/mid scale ticks are rendered. */
  format?: (v: number) => string
}>(), { color: 'primary', height: 140, fillOpacity: 0.16 })

const W = 560
const PAD = 6
const gradId = `area-grad-${useId()}`

// Same scale buildSmoothPath would derive, made explicit so the ticks match.
const scaleMax = computed(() => (Math.max(0, ...props.data) * 1.15) || 1)
const paths = computed(() => buildSmoothPath(props.data, W, props.height, PAD, scaleMax.value))
const stroke = computed(() => `var(--md-sys-color-${props.color})`)
const topStop = computed(() => props.fillOpacity + 0.12)

const tickStyle = {
  position: 'absolute',
  right: '4px',
  transform: 'translateY(-50%)',
  fontSize: '10px',
  lineHeight: 1,
  color: 'var(--md-sys-color-on-surface-variant)',
  pointerEvents: 'none',
} as const
</script>

<template>
  <div :style="{ position: 'relative' }">
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
    <template v-if="format && data.length > 1">
      <div aria-hidden="true" :style="{ position: 'absolute', left: 0, right: 0, top: `${PAD}px`, borderTop: '1px dashed var(--md-sys-color-outline-variant)', pointerEvents: 'none' }" />
      <div aria-hidden="true" :style="{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px dashed var(--md-sys-color-outline-variant)', pointerEvents: 'none' }" />
      <span :style="{ ...tickStyle, top: `${PAD}px` }">{{ format(scaleMax) }}</span>
      <span :style="{ ...tickStyle, top: '50%' }">{{ format(scaleMax / 2) }}</span>
    </template>
  </div>
</template>
