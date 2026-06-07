<script setup lang="ts">
const { locale } = useI18n()
const { seed } = useSeed()

// Drive <html lang> from the active locale and <html data-seed> from the accent
// preference so md3-tokens.css selects the right palette during SSR (no flash).
useHead({
  htmlAttrs: {
    lang: locale,
    'data-seed': seed,
  },
  titleTemplate: (title) => (title ? `${title} · AutoPeer` : 'AutoPeer · DN42 BGP peering'),
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <SnackbarHost />
  </div>
</template>
