<script setup lang="ts">
const props = defineProps<{
  label?: string
  modelValue?: string
  placeholder?: string
  icon?: string
  mono?: boolean
  error?: string
  supporting?: string
  type?: string
  tfBg?: string
  inputmode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel' | 'url' | 'search'
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const focused = ref(false)
const wrapStyle = computed(() => (props.tfBg ? { '--md-tf-bg': props.tfBg } as Record<string, string> : undefined))
const labelStyle = computed(() => (props.tfBg ? { background: props.tfBg } : undefined))
</script>

<template>
  <div class="field">
    <div class="tf" :class="{ 'tf-error': !!error, 'field-focused': focused }" :style="wrapStyle">
      <MdSym v-if="icon" :name="icon" />
      <input
        :type="type || 'text'"
        :inputmode="inputmode"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :class="{ mono }"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @focus="focused = true"
        @blur="focused = false"
      >
    </div>
    <label v-if="label" class="tf-label" :style="labelStyle">{{ label }}</label>
    <span v-if="error" class="tf-error-text">{{ error }}</span>
    <span v-else-if="supporting" class="tf-supporting">{{ supporting }}</span>
  </div>
</template>
