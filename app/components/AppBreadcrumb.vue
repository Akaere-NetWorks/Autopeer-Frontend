<script setup lang="ts">
defineProps<{ items: { label: string, to?: string }[] }>()
</script>

<template>
  <nav class="md-body-medium" :style="{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '4px', flexWrap: 'wrap' }">
    <template v-for="(it, i) in items" :key="i">
      <MdSym v-if="i > 0" name="chevron_right" :size="18" :style="{ opacity: 0.6 }" />
      <NuxtLink v-if="it.to" :to="it.to" :style="{ color: 'inherit' }">{{ it.label }}</NuxtLink>
      <span v-else :style="{ color: 'var(--md-sys-color-on-surface)' }">{{ it.label }}</span>
    </template>
  </nav>
</template>
