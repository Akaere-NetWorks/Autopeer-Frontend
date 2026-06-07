<script setup lang="ts">
const props = defineProps<{ open: boolean, title?: string }>()
const emit = defineEmits<{ 'update:open': [boolean], close: [] }>()

function close() {
  emit('update:open', false)
  emit('close')
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) close()
}

onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="snackbar">
      <div v-if="open">
        <div class="scrim" @click="close" />
        <div class="dialog" role="dialog" aria-modal="true">
          <h2 v-if="title" class="md-headline-small dialog-title">{{ title }}</h2>
          <div class="md-body-medium" :style="{ color: 'var(--md-sys-color-on-surface-variant)' }">
            <slot />
          </div>
          <div class="dialog-actions">
            <slot name="actions" :close="close" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
