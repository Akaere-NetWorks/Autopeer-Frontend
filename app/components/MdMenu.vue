<script setup lang="ts">
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()
const root = ref<HTMLElement | null>(null)

function onDocDown(e: MouseEvent) {
  if (props.open && root.value && !root.value.contains(e.target as Node)) {
    emit('update:open', false)
  }
}

onMounted(() => document.addEventListener('mousedown', onDocDown))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocDown))
</script>

<template>
  <span ref="root" class="menu-anchor">
    <slot name="trigger" />
    <Transition name="snackbar">
      <div v-if="open" class="menu" role="menu">
        <slot :close="() => emit('update:open', false)" />
      </div>
    </Transition>
  </span>
</template>
