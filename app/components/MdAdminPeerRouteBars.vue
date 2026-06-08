<script setup lang="ts">
// Diverging bar chart for per-interval route count deltas (imported / exported /
// preferred). Bars grow up for positive deltas and down for negative around a
// shared zero baseline. Uniquely named to avoid colliding with shared Md* charts.
const props = withDefaults(defineProps<{
  /** One group of three deltas per sampled interval. */
  series: { imported: number, exported: number, preferred: number }[]
  height?: number
  label?: string
}>(), { height: 200 })

const W = 720
const PAD_Y = 8

const flat = computed(() => props.series.flatMap(s => [s.imported, s.exported, s.preferred]))
const maxAbs = computed(() => Math.max(1, ...flat.value.map(v => Math.abs(v))))
// Zero baseline sits in the middle of the available height.
const zeroY = computed(() => props.height / 2)
const halfH = computed(() => props.height / 2 - PAD_Y)

const groupCount = computed(() => Math.max(1, props.series.length))
const groupW = computed(() => W / groupCount.value)
// Three bars per group with a little inter-group gap.
const barW = computed(() => Math.max(1, (groupW.value * 0.78) / 3))
const groupGap = computed(() => (groupW.value - barW.value * 3) / 2)

const colors = ['var(--md-sys-color-primary)', 'var(--md-sys-color-tertiary)', 'var(--md-sys-color-secondary)']

const bars = computed(() => {
  const out: { x: number, y: number, w: number, h: number, fill: string }[] = []
  props.series.forEach((s, gi) => {
    const groupX = gi * groupW.value + groupGap.value / 2
    ;[s.imported, s.exported, s.preferred].forEach((v, bi) => {
      const x = groupX + bi * barW.value
      const h = (Math.abs(v) / maxAbs.value) * halfH.value
      const y = v >= 0 ? zeroY.value - h : zeroY.value
      out.push({ x, y, w: Math.max(0.5, barW.value - 1), h: Math.max(0.5, h), fill: colors[bi]! })
    })
  })
  return out
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${W} ${height}`"
    preserveAspectRatio="none"
    :style="{ width: '100%', height: `${height}px`, display: 'block' }"
    role="img"
    :aria-label="label"
  >
    <line
      x1="0" :y1="zeroY" :x2="W" :y2="zeroY"
      stroke="var(--md-sys-color-outline-variant)" stroke-width="1"
    />
    <rect
      v-for="(b, i) in bars" :key="i"
      :x="b.x" :y="b.y" :width="b.w" :height="b.h" :fill="b.fill"
      rx="1" opacity="0.85"
    />
  </svg>
</template>
