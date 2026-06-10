<script setup lang="ts">
/**
 * Standard destructive-action confirmation: warning banner + optional recap
 * rows + optional type-to-confirm friction. Use for anything irreversible.
 */
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  /** Warning text shown in an error-container banner. */
  warning?: string
  /** Optional [label, value] recap rows describing the target. */
  recap?: [string, string][]
  /** Require typing this word (case-insensitive) to arm the confirm button. */
  confirmWord?: string
  confirmLabel?: string
  confirmIcon?: string
  submitting?: boolean
  /** Use the error palette for the confirm button (default). */
  danger?: boolean
}>(), { danger: true })
const emit = defineEmits<{ 'update:open': [boolean], confirm: [] }>()

const { t } = useI18n()
const typed = ref('')
watch(() => props.open, (o) => {
  if (o) typed.value = ''
})
const armed = computed(() => !props.confirmWord || typed.value.trim().toLowerCase() === props.confirmWord.toLowerCase())
</script>

<template>
  <MdDialog :open="open" :title="title" :submitting="submitting" @update:open="(v: boolean) => emit('update:open', v)">
    <div class="col gap-4" :style="{ marginTop: '4px' }">
      <div
        v-if="warning"
        class="row gap-3"
        :style="{ alignItems: 'flex-start', padding: '14px', borderRadius: '12px', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }"
      >
        <MdSym name="warning" :size="20" fill />
        <span class="md-body-medium">{{ warning }}</span>
      </div>
      <slot />
      <div v-if="recap?.length" :style="{ borderRadius: '12px', border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden' }">
        <div
          v-for="(row, i) in recap"
          :key="row[0]"
          class="row gap-4"
          :style="{ padding: '12px 14px', borderBottom: i < recap.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none' }"
        >
          <div class="md-body-small txt-variant" :style="{ width: '110px', flexShrink: 0 }">{{ row[0] }}</div>
          <div class="md-body-small" :style="{ flex: 1, wordBreak: 'break-all' }">{{ row[1] }}</div>
        </div>
      </div>
      <MdTextField
        v-if="confirmWord"
        v-model="typed"
        :label="t('common.typeToConfirm', { word: confirmWord })"
        :placeholder="confirmWord"
        mono
        tf-bg="var(--md-sys-color-surface-container-high)"
      />
    </div>
    <template #actions="{ close }">
      <MdButton variant="text" :disabled="submitting" @click="close">{{ t('common.cancel') }}</MdButton>
      <MdButton
        variant="filled"
        :icon="confirmIcon"
        :disabled="!armed || submitting"
        :loading="submitting"
        :style="danger ? { background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' } : undefined"
        @click="emit('confirm')"
      >
        {{ confirmLabel || t('common.confirm') }}
      </MdButton>
    </template>
  </MdDialog>
</template>
