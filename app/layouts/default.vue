<script setup lang="ts">
const route = useRoute()
const { t, te } = useI18n()
const cfg = useRuntimeConfig()
const auth = useAuth()

const drawerOpen = ref(false)
const scrolled = ref(false)

// Ref to the mobile modal drawer so we can move focus into it on open.
const drawerEl = ref<HTMLElement | null>(null)
// The element (menu button) that had focus when the drawer opened, so we can
// restore focus to it on close for keyboard/screen-reader users.
let drawerOpener: HTMLElement | null = null

// Shared modal scroll-lock (md-modal-count ref-counter, same as MdDialog) —
// lock while the mobile drawer is open so background scrolling is frozen, and
// any other open modal keeps the lock alive via the shared counter.
const { lock, unlock } = useScrollLock()
// Guard so lock/unlock stay balanced even if the watcher fires oddly.
let drawerLocked = false

const title = computed(() => {
  const key = route.meta.title as string | undefined
  return key && te(key) ? t(key) : t('brand')
})

function closeDrawer() {
  drawerOpen.value = false
}

function openDrawer() {
  if (!import.meta.client) return
  drawerOpener = (document.activeElement as HTMLElement) || null
  drawerOpen.value = true
}

// Close on Escape while the drawer is open. Bound globally (window) so it fires
// regardless of where focus currently sits.
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && drawerOpen.value) closeDrawer()
}

watch(drawerOpen, async (open) => {
  if (!import.meta.client) return
  if (open) {
    if (!drawerLocked) { lock(); drawerLocked = true }
    // Move focus into the drawer once it has rendered.
    await nextTick()
    const focusTarget = drawerEl.value?.querySelector<HTMLElement>(
      'a, button, [tabindex]:not([tabindex="-1"])',
    )
    ;(focusTarget || drawerEl.value)?.focus()
  } else {
    if (drawerLocked) { unlock(); drawerLocked = false }
    // Restore focus to whatever opened the drawer (the menu button).
    drawerOpener?.focus()
    drawerOpener = null
  }
})

// Close on route change too (covers programmatic navigation). The keydown +
// @navigate handlers cover same-route taps that this watcher would miss.
watch(() => route.fullPath, closeDrawer)

function onScroll() {
  scrolled.value = window.scrollY > 4
}
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('keydown', onKey)
  // If we unmount while the drawer is open, release our share of the lock.
  if (drawerLocked) { unlock(); drawerLocked = false }
})

async function returnToAdmin() {
  await auth.restoreAdmin()
  await navigateTo('/admin')
}

const year = new Date().getFullYear()
</script>

<template>
  <div class="page-shell">
    <!-- Persistent drawer (desktop) -->
    <aside class="nav-drawer app-drawer-persistent">
      <AppSidebar />
    </aside>

    <!-- Modal drawer (mobile) -->
    <ClientOnly>
      <Teleport to="body">
        <Transition name="snackbar">
          <div v-if="drawerOpen">
          <div class="scrim" @click="closeDrawer" />
          <aside
            ref="drawerEl"
            class="nav-drawer"
            role="dialog"
            aria-modal="true"
            tabindex="-1"
            :style="{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 70, borderRadius: '0 16px 16px 0', boxShadow: 'var(--md-elev-3)' }"
          >
            <AppSidebar @navigate="closeDrawer" />
          </aside>
          </div>
        </Transition>
      </Teleport>
    </ClientOnly>

    <div class="page-main">
      <!-- Persistent impersonation banner (admin viewing as another account) -->
      <ClientOnly>
        <div v-if="auth.isImpersonating.value" class="impersonation-banner" role="status">
          <MdSym name="visibility" class="impersonation-banner-icon" />
          <span class="md-body-medium" :style="{ flex: 1, minWidth: 0 }">{{ t('common.impersonating') }}</span>
          <button v-ripple type="button" class="btn btn-text impersonation-banner-action" @click="returnToAdmin">
            <MdSym name="logout" />
            {{ t('common.returnToAdmin') }}
          </button>
        </div>
      </ClientOnly>

      <AppTopBar :title="title" :scrolled="scrolled" @open-drawer="openDrawer" />

      <!-- Passkey enrollment prompt (self-gates: only renders for eligible
           logged-in users without a passkey). -->
      <PasskeyBanner />

      <main :style="{ flex: 1, minWidth: 0 }">
        <div class="page-content">
          <slot />
        </div>
        <footer class="page-footer md-body-small">
          <div class="row gap-5 flex-wrap">
            <a href="https://dn42.dev" target="_blank" rel="noopener">{{ t('footer.dn42') }}</a>
            <a href="https://github.com/Akaere-NetWorks" target="_blank" rel="noopener">GitHub</a>
            <a href="https://github.com/Akaere-NetWorks/Autopeer-Center" target="_blank" rel="noopener">{{ t('footer.documentation') }}</a>
          </div>
          <div>© {{ year }} {{ cfg.public.operator }} · {{ t('footer.build') }} {{ cfg.public.commitHash }} · {{ t('footer.madeWith') }}</div>
        </footer>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-drawer-persistent {
  position: sticky;
  top: 0;
  height: 100vh;
  align-self: flex-start;
}
@media (max-width: 1080px) {
  .app-drawer-persistent { display: none; }
}

/* Prominent impersonation banner — warning container for high visibility. */
.impersonation-banner {
  position: sticky;
  top: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--md-sys-color-warning-container);
  color: var(--md-sys-color-on-warning-container);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}
.impersonation-banner-icon { flex-shrink: 0; }
.impersonation-banner-action {
  flex-shrink: 0;
  color: var(--md-sys-color-on-warning-container);
  --slc: var(--md-sys-color-on-warning-container);
}
</style>
