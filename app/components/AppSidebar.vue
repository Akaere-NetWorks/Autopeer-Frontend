<script setup lang="ts">
const emit = defineEmits<{ navigate: [] }>()
const { t } = useI18n()
const cfg = useRuntimeConfig()
const { groups, isActive } = useNav()
const { isAuthenticated, asn, user, logout } = useAuth()

const asnBadge = computed(() => {
  const a = asn.value
  return a ? String(a).slice(-2) : '?'
})

async function onSignOut() {
  await logout()
  emit('navigate')
  await navigateTo('/')
}
</script>

<template>
  <div :style="{ display: 'flex', flexDirection: 'column', height: '100%' }">
    <!-- Brand -->
    <NuxtLink
      to="/"
      :style="{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px 8px' }"
      @click="emit('navigate')"
    >
      <span :style="{ display: 'inline-flex', width: '40px', height: '40px', borderRadius: '12px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)' }">
        <MdSym name="bolt" :size="24" fill />
      </span>
      <div>
        <div class="md-title-medium" :style="{ lineHeight: 1.1 }">{{ t('brand') }}</div>
        <div class="md-body-small" :style="{ color: 'var(--md-sys-color-on-surface-variant)' }">{{ cfg.public.operator }}</div>
      </div>
    </NuxtLink>

    <!-- Nav -->
    <div :style="{ flex: 1, overflowY: 'auto', paddingBottom: '8px' }">
      <div v-for="(group, gi) in groups" :key="gi">
        <div v-if="group.label" class="nav-section-label md-title-small">{{ t(group.label) }}</div>
        <NuxtLink
          v-for="item in group.items"
          :key="item.to"
          v-ripple
          class="nav-item"
          :class="{ 'nav-item-active': isActive(item.to) }"
          :to="item.to"
          @click="emit('navigate')"
        >
          <MdSym :name="item.icon" :fill="isActive(item.to)" />
          <span>{{ t(item.label) }}</span>
        </NuxtLink>
      </div>
    </div>

    <hr class="md-divider" :style="{ margin: '4px 0' }">

    <!-- User / sign-in -->
    <div v-if="isAuthenticated" :style="{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 8px 8px' }">
      <MdAvatar :text="asnBadge" tone="tertiary" />
      <div :style="{ flex: 1, minWidth: 0 }">
        <div class="md-title-small mono">AS{{ asn }}</div>
        <div class="md-body-small" :style="{ color: 'var(--md-sys-color-on-surface-variant)' }">
          {{ user?.role === 'admin' ? t('nav.adminRole') : t('nav.user') }}
        </div>
      </div>
      <MdIconButton icon="logout" :title="t('common.signOut')" @click="onSignOut" />
    </div>
    <div v-else :style="{ padding: '8px 8px 12px' }">
      <MdButton variant="filled" icon="login" block @click="() => { emit('navigate'); navigateTo('/login') }">
        {{ t('common.signIn') }}
      </MdButton>
    </div>
  </div>
</template>
