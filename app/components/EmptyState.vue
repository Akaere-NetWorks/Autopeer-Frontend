<script setup lang="ts">
/** Standard empty-state card: icon + title + body + optional CTA via slot. */
withDefaults(defineProps<{
  icon?: string
  title?: string
  body?: string
  /** Render without the outlined card wrapper (for use inside an existing card). */
  bare?: boolean
}>(), { icon: 'inbox' })
</script>

<template>
  <div
    class="col gap-3 text-center"
    :class="bare ? '' : 'card card-outlined'"
    :style="{ alignItems: 'center', padding: bare ? '32px 16px' : '40px 24px' }"
  >
    <MdSym :name="icon" :size="36" class="txt-variant" />
    <div v-if="title" class="md-title-medium">{{ title }}</div>
    <div v-if="body" class="md-body-medium txt-variant" :style="{ maxWidth: '420px' }">{{ body }}</div>
    <slot />
  </div>
</template>
