<script setup lang="ts">
const props = defineProps<{
  label?: string
  modelValue?: string
  options: { value: string, label: string }[]
  tfBg?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const focused = ref(false)
const wrapStyle = computed(() => (props.tfBg ? { '--md-tf-bg': props.tfBg } as Record<string, string> : undefined))
const labelStyle = computed(() => (props.tfBg ? { background: props.tfBg } : undefined))
</script>

<template>
  <div class="field">
    <div class="tf" :class="{ 'field-focused': focused }" :style="wrapStyle">
      <select
        :value="modelValue"
        @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
        @focus="focused = true"
        @blur="focused = false"
      >
        <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <MdSym name="arrow_drop_down" />
    </div>
    <label v-if="label" class="tf-label" :style="labelStyle">{{ label }}</label>
  </div>
</template>
