<script setup lang="ts">
const route = useRoute()
const { t, te } = useI18n()
const cfg = useRuntimeConfig()

const drawerOpen = ref(false)
const scrolled = ref(false)

const title = computed(() => {
  const key = route.meta.title as string | undefined
  return key && te(key) ? t(key) : t('brand')
})

watch(() => route.fullPath, () => { drawerOpen.value = false })

function onScroll() {
  scrolled.value = window.scrollY > 4
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))

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
          <div class="scrim" @click="drawerOpen = false" />
          <aside
            class="nav-drawer"
            :style="{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 70, borderRadius: '0 16px 16px 0', boxShadow: 'var(--md-elev-3)' }"
          >
            <AppSidebar @navigate="drawerOpen = false" />
          </aside>
          </div>
        </Transition>
      </Teleport>
    </ClientOnly>

    <div class="page-main">
      <AppTopBar :title="title" :scrolled="scrolled" @open-drawer="drawerOpen = true" />

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
</style>
