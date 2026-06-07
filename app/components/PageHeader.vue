<script setup lang="ts">
withDefaults(defineProps<{
  icon?: string
  tone?: 'primary' | 'secondary' | 'tertiary'
  title: string
  subtitle?: string
}>(), { tone: 'primary' })
</script>

<template>
  <div :style="{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }">
    <span
      v-if="icon"
      :style="{
        display: 'inline-flex', width: '52px', height: '52px', borderRadius: '16px',
        alignItems: 'center', justifyContent: 'center',
        background: `var(--md-sys-color-${tone}-container)`, color: `var(--md-sys-color-on-${tone}-container)`,
      }"
    >
      <MdSym :name="icon" :size="26" fill />
    </span>
    <div :style="{ flex: 1, minWidth: 0 }">
      <h1 class="md-headline-medium" :style="{ margin: 0 }">{{ title }}</h1>
      <p v-if="subtitle" class="md-body-medium" :style="{ margin: '4px 0 0', color: 'var(--md-sys-color-on-surface-variant)' }">{{ subtitle }}</p>
    </div>
    <slot name="action" />
  </div>
</template>
