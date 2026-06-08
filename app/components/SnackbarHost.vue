<script setup lang="ts">
const { toasts, dismiss } = useToast()
const { t } = useI18n()

async function copyId(id: string | undefined) {
  if (id && import.meta.client && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(id)
    } catch {
      /* ignore */
    }
  }
}
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
            @click="copyId(toast.requestId)"
          >
            {{ t('common.copy') }} ID
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
