<script setup lang="ts">
// Reusable copy-to-clipboard button. Renders as an MD3 icon button by default,
// or a labeled text button when `label` is set. Swaps the icon to a check mark
// for 1500ms after a successful copy and surfaces a toast for confirmation.
const props = withDefaults(defineProps<{
  /** Text to copy to the clipboard. */
  value: string
  /** When set, renders a labeled text button instead of a bare icon button. */
  label?: string
  /** Icon button diameter / text-button height in pixels. */
  size?: number
  /** Tooltip + aria-label override (defaults to the i18n "copy" label). */
  title?: string
  /** Suppress the "Copied" toast (the icon still swaps to a check). */
  silent?: boolean
}>(), {
  size: 32,
})

const emit = defineEmits<{ copied: [value: string] }>()

const { t } = useI18n()
const toast = useToast()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

const tip = computed(() => props.title ?? t('common.copy'))

async function writeClipboard(text: string): Promise<boolean> {
  if (import.meta.client && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    }
    catch {
      // fall through to the legacy fallback below
    }
  }
  // Fallback for insecure contexts / older browsers without the async API.
  if (import.meta.client && typeof document !== 'undefined') {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    }
    catch {
      ok = false
    }
    document.body.removeChild(ta)
    return ok
  }
  return false
}

async function handleCopy() {
  const ok = await writeClipboard(props.value)
  if (!ok) {
    toast.show(t('common.copyFailed'), { kind: 'error' })
    return
  }
  copied.value = true
  if (!props.silent) toast.show(t('common.copied'))
  emit('copied', props.value)
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { copied.value = false }, 1500)
}

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <button
    v-ripple
    type="button"
    :title="tip"
    :aria-label="tip"
    :class="label ? 'btn btn-text' : 'icon-btn'"
    :style="label ? undefined : { width: `${size}px`, height: `${size}px` }"
    @click="handleCopy"
  >
    <MdSym :name="copied ? 'check' : 'content_copy'" :size="label ? 18 : Math.round(size * 0.56)" />
    <span v-if="label">{{ copied ? t('common.copied') : label }}</span>
  </button>
</template>
