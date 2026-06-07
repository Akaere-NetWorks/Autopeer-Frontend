<script setup lang="ts">
defineProps<{ selected?: boolean, icon?: string }>()
defineEmits<{ click: [MouseEvent] }>()
</script>

<template>
  <button
    v-ripple
    type="button"
    class="chip"
    :class="{ 'chip-selected': selected }"
    @click="$emit('click', $event)"
  >
    <MdSym v-if="selected" name="check" class="lead-check" />
    <MdSym v-else-if="icon" :name="icon" />
    <span><slot /></span>
  </button>
</template>
