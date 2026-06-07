<script setup lang="ts">
defineProps<{ title: string, scrolled?: boolean }>()
const emit = defineEmits<{ 'open-drawer': [] }>()

const { t, locale, locales, setLocale } = useI18n()
const colorMode = useColorMode()
const { seed, setSeed, seeds, hex } = useSeed()
const { isAuthenticated, asn } = useAuth()

const settingsOpen = ref(false)
const localeOpen = ref(false)

const appearanceOptions = computed(() => [
  { value: 'light', label: t('theme.light'), icon: 'light_mode' },
  { value: 'dark', label: t('theme.dark'), icon: 'dark_mode' },
  { value: 'system', label: t('theme.system'), icon: 'brightness_auto' },
])

const availableLocales = computed(() => (locales.value as { code: string, name?: string }[]))

const asnBadge = computed(() => (asn.value ? String(asn.value).slice(-2) : '?'))

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

async function pickLocale(code: string) {
  localeOpen.value = false
  await setLocale(code as never)
}
</script>

<template>
  <header class="top-app-bar" :class="{ scrolled }">
    <MdIconButton
      class="topbar-menu"
      icon="menu"
      :title="t('nav.menu')"
      @click="emit('open-drawer')"
    />
    <span class="bar-title" :style="{ marginLeft: '8px', flex: 1 }">{{ title }}</span>

    <span class="status status-warning" :style="{ marginRight: '4px' }">{{ t('beta') }}</span>

    <ClientOnly>
      <MdIconButton
        :icon="colorMode.value === 'dark' ? 'light_mode' : 'dark_mode'"
        :title="t('theme.toggle')"
        @click="toggleTheme"
      />
      <template #fallback>
        <MdIconButton icon="dark_mode" :title="t('theme.toggle')" />
      </template>
    </ClientOnly>

    <!-- Appearance + accent -->
    <ClientOnly>
      <MdMenu v-model:open="settingsOpen">
        <template #trigger>
          <MdIconButton icon="palette" :title="t('theme.appearance')" @click="settingsOpen = !settingsOpen" />
        </template>
        <div :style="{ padding: '4px 8px 8px', minWidth: '240px' }">
          <div class="md-title-small txt-variant" :style="{ padding: '8px 4px' }">{{ t('theme.appearance') }}</div>
          <MdSegmented
            :model-value="colorMode.preference"
            :options="appearanceOptions"
            @update:model-value="(v: string) => (colorMode.preference = v)"
          />
          <div class="md-title-small txt-variant" :style="{ padding: '12px 4px 8px' }">{{ t('theme.color') }}</div>
          <div class="row gap-3" :style="{ padding: '0 4px 4px' }">
            <button
              v-for="s in seeds"
              :key="s"
              v-ripple
              type="button"
              class="swatch"
              :class="{ 'swatch-active': seed === s }"
              :style="{ background: hex[s] }"
              :title="t(`theme.colors.${s}`)"
              :aria-label="t(`theme.colors.${s}`)"
              @click="setSeed(s)"
            />
          </div>
        </div>
      </MdMenu>
      <template #fallback>
        <MdIconButton icon="palette" :title="t('theme.appearance')" />
      </template>
    </ClientOnly>

    <!-- Language -->
    <MdMenu v-model:open="localeOpen">
      <template #trigger>
        <MdIconButton icon="translate" :title="t('locale.switch')" @click="localeOpen = !localeOpen" />
      </template>
      <button
        v-for="l in availableLocales"
        :key="l.code"
        v-ripple
        type="button"
        class="menu-item"
        :class="{ 'menu-item-active': locale === l.code }"
        @click="pickLocale(l.code)"
      >
        <MdSym :name="locale === l.code ? 'check' : 'language'" />
        <span>{{ l.name || l.code }}</span>
      </button>
    </MdMenu>

    <div :style="{ marginLeft: '4px' }">
      <MdAvatar v-if="isAuthenticated" :text="asnBadge" tone="tertiary" :size="36" />
      <MdAvatar v-else text="?" tone="secondary" :size="36" />
    </div>
  </header>
</template>

<style scoped>
.topbar-menu { display: none; }
@media (max-width: 1080px) {
  .topbar-menu { display: inline-flex; }
}
</style>
