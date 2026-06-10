<script setup lang="ts">
const props = withDefaults(defineProps<{
  rx: number[]
  tx: number[]
  height?: number
  /** Optional value formatter; when set, max/mid scale ticks are rendered. */
  format?: (v: number) => string
}>(), { height: 160 })

const W = 560
const PAD = 6
const gradId = `dual-grad-${useId()}`

const max = computed(() => (Math.max(0, ...props.rx, ...props.tx) * 1.15) || 1)
const rxPath = computed(() => buildSmoothPath(props.rx, W, props.height, PAD, max.value))
const txPath = computed(() => buildSmoothPath(props.tx, W, props.height, PAD, max.value))

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
      role="img"
      aria-label="Traffic"
    >
      <defs>
        <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--md-sys-color-primary)" stop-opacity="0.22" />
          <stop offset="100%" stop-color="var(--md-sys-color-primary)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path v-if="rxPath.area" :d="rxPath.area" :fill="`url(#${gradId})`" />
      <path v-if="rxPath.line" :d="rxPath.line" fill="none" stroke="var(--md-sys-color-primary)" stroke-width="2.5" stroke-linecap="round" />
      <path v-if="txPath.line" :d="txPath.line" fill="none" stroke="var(--md-sys-color-tertiary)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="2 5" />
    </svg>
    <template v-if="format && (rx.length > 1 || tx.length > 1)">
      <div aria-hidden="true" :style="{ position: 'absolute', left: 0, right: 0, top: `${PAD}px`, borderTop: '1px dashed var(--md-sys-color-outline-variant)', pointerEvents: 'none' }" />
      <div aria-hidden="true" :style="{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px dashed var(--md-sys-color-outline-variant)', pointerEvents: 'none' }" />
      <span :style="{ ...tickStyle, top: `${PAD}px` }">{{ format(max) }}</span>
      <span :style="{ ...tickStyle, top: '50%' }">{{ format(max / 2) }}</span>
    </template>
  </div>
</template>
