<script setup lang="ts">
const { toasts, show, dismiss } = useToast()
const { t } = useI18n()

// Ephemeral per-toast "copied" feedback, keyed by toast id. Lives only as long as
// the host is mounted; cleared automatically when its timer fires.
const copiedIds = ref(new Set<number>())
const copyTimers = new Map<number, ReturnType<typeof setTimeout>>()

async function copyId(toastId: number, requestId: string | undefined) {
  if (!requestId || !import.meta.client || !navigator.clipboard) return
  try {
    await navigator.clipboard.writeText(requestId)
    const next = new Set(copiedIds.value)
    next.add(toastId)
    copiedIds.value = next
    clearTimeout(copyTimers.get(toastId))
    copyTimers.set(toastId, setTimeout(() => {
      const after = new Set(copiedIds.value)
      after.delete(toastId)
      copiedIds.value = after
      copyTimers.delete(toastId)
    }, 1500))
  } catch {
    show(t('common.copyFailed'), { kind: 'error' })
  }
}

onBeforeUnmount(() => {
  for (const timer of copyTimers.values()) clearTimeout(timer)
  copyTimers.clear()
})
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <div class="snackbar-host">
      <TransitionGroup name="snackbar">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="snackbar"
          :class="{ 'snackbar-error': toast.kind === 'error' }"
        >
          <MdSym v-if="toast.kind === 'error'" name="error" :size="20" />
          <span>{{ toast.message }}</span>
          <button
            v-if="toast.requestId"
            type="button"
            class="snackbar-action"
            :title="`${t('common.requestId')}: ${toast.requestId}`"
            @click="copyId(toast.id, toast.requestId)"
          >
            <template v-if="copiedIds.has(toast.id)">
              <MdSym name="check" :size="18" />
              {{ t('common.copied') }}
            </template>
            <template v-else>
              {{ t('common.copy') }} ID
            </template>
          </button>
          <button type="button" class="snackbar-action" @click="dismiss(toast.id)">
            {{ t('common.close') }}
          </button>
        </div>
      </TransitionGroup>
    </div>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
/* Keep the icon + label aligned when the action swaps to "Copied". */
.snackbar-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
</style>
