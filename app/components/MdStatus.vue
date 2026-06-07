<script setup lang="ts">
withDefaults(defineProps<{
  kind?: 'success' | 'warning' | 'error' | 'neutral' | 'info'
  dot?: boolean
}>(), { kind: 'neutral', dot: true })
</script>

<template>
  <span class="status" :class="`status-${kind}`">
    <span v-if="dot" class="dot" />
    <span><slot /></span>
  </span>
</template>
