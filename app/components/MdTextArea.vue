<script setup lang="ts">
const props = defineProps<{
  label?: string
  modelValue?: string
  placeholder?: string
  mono?: boolean
  supporting?: string
  rows?: number
  tfBg?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const focused = ref(false)
const wrapStyle = computed(() => (props.tfBg ? { '--md-tf-bg': props.tfBg } as Record<string, string> : undefined))
const labelStyle = computed(() => (props.tfBg ? { background: props.tfBg } : undefined))
</script>

<template>
  <div class="field">
    <div class="tf tf-textarea" :class="{ 'field-focused': focused }" :style="wrapStyle">
      <textarea
        :rows="rows || 4"
        :value="modelValue"
        :placeholder="placeholder"
        :class="{ mono }"
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
        @focus="focused = true"
        @blur="focused = false"
      />
    </div>
    <label v-if="label" class="tf-label" :style="labelStyle">{{ label }}</label>
    <span v-if="supporting" class="tf-supporting">{{ supporting }}</span>
  </div>
</template>
