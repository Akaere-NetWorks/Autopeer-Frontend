<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: string
  options: { value: string, label: string, icon?: string }[]
  // 'group' → toggle buttons with aria-pressed (default);
  // 'tablist' → role=tab + aria-selected (e.g. chart range selector).
  role?: 'group' | 'tablist'
}>(), {
  role: 'group',
})
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const isTablist = computed(() => props.role === 'tablist')
const segs = ref<HTMLButtonElement[]>([])

// Roving tabindex: only the active segment (or the first one) is tab-focusable.
const activeIndex = computed(() => {
  const i = props.options.findIndex(o => o.value === props.modelValue)
  return i === -1 ? 0 : i
})
function tabIndexFor(i: number) {
  return i === activeIndex.value ? 0 : -1
}

function select(value: string) {
  emit('update:modelValue', value)
}

function focusAt(i: number) {
  const n = props.options.length
  if (!n) return
  const idx = ((i % n) + n) % n
  segs.value[idx]?.focus()
  // For tablists, follow the focus with selection (automatic activation).
  if (isTablist.value) select(props.options[idx]!.value)
}

function onKeydown(e: KeyboardEvent, i: number) {
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      e.preventDefault()
      focusAt(i + 1)
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      e.preventDefault()
      focusAt(i - 1)
      break
    case 'Home':
      e.preventDefault()
      focusAt(0)
      break
    case 'End':
      e.preventDefault()
      focusAt(props.options.length - 1)
      break
  }
}
</script>

<template>
  <div class="segmented" :role="isTablist ? 'tablist' : 'group'">
    <button
      v-for="(o, i) in options"
      :key="o.value"
      ref="segs"
      v-ripple
      type="button"
      class="seg"
      :class="{ 'seg-active': modelValue === o.value }"
      :role="isTablist ? 'tab' : undefined"
      :aria-pressed="isTablist ? undefined : modelValue === o.value"
      :aria-selected="isTablist ? modelValue === o.value : undefined"
      :tabindex="tabIndexFor(i)"
      @click="select(o.value)"
      @keydown="onKeydown($event, i)"
    >
      <MdSym v-if="modelValue === o.value" name="check" />
      <MdSym v-else-if="o.icon" :name="o.icon" />
      <span>{{ o.label }}</span>
    </button>
  </div>
</template>
