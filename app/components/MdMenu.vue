<script setup lang="ts">
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const root = ref<HTMLElement | null>(null)
const surface = ref<HTMLElement | null>(null)

// Shared "currently open menu" id so opening one menu (e.g. the theme / accent /
// locale menus in AppTopBar) closes any other open one. Each instance gets a
// stable id; the one whose id matches state stays open, the rest close.
const openId = useState<symbol | null>('md-menu-open', () => null)
const id = Symbol('md-menu')

function close(refocus = false) {
  emit('update:open', false)
  if (refocus) focusTrigger()
}

function focusTrigger() {
  const el = root.value?.querySelector<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )
  el?.focus()
}

// Focusable menu items: real [role=menuitem] nodes, or the .menu-item / swatch
// buttons the existing callers render.
function items(): HTMLElement[] {
  if (!surface.value) return []
  return Array.from(
    surface.value.querySelectorAll<HTMLElement>(
      '[role=menuitem], .menu-item, .swatch',
    ),
  ).filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1)
}

function focusItem(i: number) {
  const list = items()
  if (!list.length) return
  const idx = ((i % list.length) + list.length) % list.length
  list[idx]?.focus()
}

function onKey(e: KeyboardEvent) {
  if (!props.open) return
  // Don't hijack arrows from embedded controls that manage their own arrow keys
  // (e.g. an MdSegmented theme toggle or a swatch grid inside the menu surface).
  const active = document.activeElement as HTMLElement | null
  if (e.key !== 'Escape' && active?.closest('.segmented, [role=tablist], [role=radiogroup]')) return
  const list = items()
  const current = list.indexOf(active as HTMLElement)
  switch (e.key) {
    case 'Escape':
      e.preventDefault()
      close(true)
      break
    case 'ArrowDown':
      e.preventDefault()
      focusItem(current < 0 ? 0 : current + 1)
      break
    case 'ArrowUp':
      e.preventDefault()
      focusItem(current < 0 ? list.length - 1 : current - 1)
      break
    case 'Home':
      e.preventDefault()
      focusItem(0)
      break
    case 'End':
      e.preventDefault()
      focusItem(list.length - 1)
      break
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      // Becoming the active menu closes whichever other instance was open.
      openId.value = id
      document.addEventListener('keydown', onKey)
      nextTick(() => {
        const list = items()
        const active = list.findIndex(el => el.classList.contains('menu-item-active'))
        focusItem(active >= 0 ? active : 0)
      })
    }
    else {
      document.removeEventListener('keydown', onKey)
      if (openId.value === id) openId.value = null
    }
  },
)

// When another menu opens, this shared id changes; close ourselves if we were open.
watch(openId, (val) => {
  if (val !== id && props.open) emit('update:open', false)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  if (openId.value === id) openId.value = null
})
</script>

<template>
  <span ref="root" class="menu-anchor">
    <!-- Trigger sits above the backdrop so its own click toggles the menu
         (preserving the original outside-click-excludes-trigger behaviour). -->
    <span class="menu-trigger">
      <slot name="trigger" />
    </span>
    <!-- Transparent full-screen catcher: closes on outside click/tap;
         pointerdown is more reliable on touch than document mousedown. -->
    <div v-if="open" class="menu-backdrop" @pointerdown="close()" />
    <Transition name="snackbar">
      <div v-if="open" ref="surface" class="menu" role="menu">
        <slot :close="() => close()" />
      </div>
    </Transition>
  </span>
</template>

<style scoped>
/* Keep the trigger above the backdrop so its own click toggles the menu
   instead of the backdrop swallowing the pointer event. */
.menu-trigger { position: relative; z-index: 61; display: inline-flex; }
.menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 59; /* just under .menu (z-index: 60) */
  background: transparent;
}
</style>
