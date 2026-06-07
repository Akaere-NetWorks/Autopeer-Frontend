<script setup lang="ts">
defineProps<{
  modelValue?: string
  options: { value: string, label: string, icon?: string }[]
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
</script>

<template>
  <div class="segmented" role="group">
    <button
      v-for="o in options"
      :key="o.value"
      v-ripple
      type="button"
      class="seg"
      :class="{ 'seg-active': modelValue === o.value }"
      @click="emit('update:modelValue', o.value)"
    >
      <MdSym v-if="modelValue === o.value" name="check" />
      <MdSym v-else-if="o.icon" :name="o.icon" />
      <span>{{ o.label }}</span>
    </button>
  </div>
</template>
