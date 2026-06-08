<script setup lang="ts">
const props = defineProps<{ open: boolean, title?: string, submitting?: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean], close: [] }>()

const panel = ref<HTMLElement | null>(null)
const { lock, unlock } = useScrollLock()
let restoreTarget: HTMLElement | null = null
let listening = false
let locked = false
let scrimDown = false

function close() {
  // Keep close affordances inert while a submit is in flight.
  if (props.submitting) return
  emit('update:open', false)
  emit('close')
}

// A native `click` fires on the nearest common ancestor of mousedown+mouseup, so
// a drag that STARTS inside the panel and releases on the scrim would otherwise
// dismiss (destroying e.g. a one-time secret reveal). Require the press to have
// BOTH started AND ended on the scrim itself.
function onScrimDown(e: MouseEvent) {
  scrimDown = e.target === e.currentTarget
}
function onScrimClick(e: MouseEvent) {
  const onScrim = scrimDown && e.target === e.currentTarget
  scrimDown = false
  if (onScrim) close()
}

function focusables(): HTMLElement[] {
  const el = panel.value
  if (!el) return []
  const sel = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')
  return [...el.querySelectorAll<HTMLElement>(sel)]
    .filter(n => !n.hasAttribute('disabled') && n.offsetParent !== null)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (props.submitting) return
    e.preventDefault()
    e.stopPropagation()
    close()
    return
  }
  if (e.key !== 'Tab') return
  const list = focusables()
  if (!list.length) {
    e.preventDefault()
    panel.value?.focus()
    return
  }
  const first = list[0]!
  const last = list[list.length - 1]!
  const active = document.activeElement as HTMLElement | null
  // Trap focus inside the panel, including when focus sits on the panel itself.
  if (e.shiftKey && (active === first || active === panel.value)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

function startListening() {
  if (listening) return
  listening = true
  // Capture phase so Escape/Tab are handled before page-level handlers.
  document.addEventListener('keydown', onKeydown, true)
}

function stopListening() {
  if (!listening) return
  listening = false
  document.removeEventListener('keydown', onKeydown, true)
}

function onOpen() {
  // Per-instance balance: lock at most once, so the immediate watch firing
  // onClose() for a dialog that mounts closed (while another dialog already
  // holds the lock) can't decrement the shared counter it never incremented.
  if (!locked) { lock(); locked = true }
  startListening()
  restoreTarget = (document.activeElement as HTMLElement | null) ?? null
  nextTick(() => {
    panel.value?.focus()
    focusables()[0]?.focus()
  })
}

function onClose() {
  stopListening()
  if (locked) { unlock(); locked = false }
  restoreTarget?.focus?.()
  restoreTarget = null
}

watch(() => props.open, (open) => {
  if (!import.meta.client) return
  if (open) onOpen()
  else onClose()
}, { immediate: true })

onUnmounted(() => {
  if (!import.meta.client) return
  stopListening()
  if (locked) { unlock(); locked = false }
  restoreTarget?.focus?.()
  restoreTarget = null
})
</script>

<template>
  <Teleport to="body">
    <Transition name="md-dialog" appear>
      <div v-if="open" class="scrim" @mousedown="onScrimDown" @click="onScrimClick">
        <div
          ref="panel"
          class="dialog"
          role="dialog"
          aria-modal="true"
          :aria-busy="submitting || undefined"
          tabindex="-1"
        >
          <h2 v-if="title" class="md-headline-small dialog-title">{{ title }}</h2>
          <div class="md-body-medium" :style="{ color: 'var(--md-sys-color-on-surface-variant)' }">
            <slot />
          </div>
          <div class="dialog-actions">
            <slot name="actions" :close="close" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Dialog-specific fade (scrim) + fade/scale (panel) transition.
   The panel keeps its translate(-50%, -50%) centering from .dialog. */
.md-dialog-enter-active,
.md-dialog-leave-active {
  transition: opacity var(--md-dur-short) var(--md-ease-standard);
}
.md-dialog-enter-active .dialog,
.md-dialog-leave-active .dialog {
  transition: opacity var(--md-dur-short) var(--md-ease-standard),
    transform var(--md-dur-medium) var(--md-ease-emphasized);
}
.md-dialog-enter-from,
.md-dialog-leave-to {
  opacity: 0;
}
.md-dialog-enter-from .dialog,
.md-dialog-leave-to .dialog {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.92);
}
</style>
