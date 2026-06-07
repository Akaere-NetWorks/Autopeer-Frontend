<script setup lang="ts">
const props = withDefaults(defineProps<{ rx: number[], tx: number[], height?: number }>(), { height: 160 })

const W = 560
const gradId = `dual-grad-${useId()}`

const max = computed(() => (Math.max(0, ...props.rx, ...props.tx) * 1.15) || 1)
const rxPath = computed(() => buildSmoothPath(props.rx, W, props.height, 6, max.value))
const txPath = computed(() => buildSmoothPath(props.tx, W, props.height, 6, max.value))
</script>

<template>
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
</template>
