<script setup lang="ts">
const props = defineProps<{ name: string, fill?: boolean, size?: number | string }>()
const sizeStyle = computed(() =>
  props.size != null ? { fontSize: typeof props.size === 'number' ? `${props.size}px` : props.size } : undefined,
)
</script>

<template>
  <span class="msym" :class="{ fill }" :style="sizeStyle" aria-hidden="true">{{ name }}</span>
</template>
