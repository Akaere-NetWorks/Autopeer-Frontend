<script setup lang="ts">
// `banner.shouldShow` is a ComputedRef returned inside a plain object (not a
// reactive proxy), so it is NOT auto-unwrapped in the template — `.value` is
// required at the v-if.
const banner = usePasskeyBanner()
const { passkeyRegister } = useAuth()
const toast = useToast()
const { t } = useI18n()

const registering = ref(false)

async function handleRegister() {
  if (registering.value) return
  registering.value = true
  try {
    await passkeyRegister()
    // Success: mark registered so the banner hides everywhere.
    banner.markRegistered()
    toast.show(t('passkeyBanner.success'))
  }
  catch (e: unknown) {
    const name = (e as { name?: string })?.name
    if (name === 'NotAllowedError' || name === 'AbortError') {
      // User cancelled the browser prompt — stay silent.
    }
    else {
      toast.error(e, t('passkeyBanner.error'))
    }
  }
  finally {
    registering.value = false
  }
}
</script>

<template>
  <Transition name="passkey-banner">
    <section v-if="banner.shouldShow.value" class="passkey-banner" role="status">
      <MdSym name="passkey" class="passkey-banner-icon" />
      <div class="passkey-banner-text">
        <p class="passkey-banner-title">{{ t('passkeyBanner.title') }}</p>
        <p class="passkey-banner-body">{{ t('passkeyBanner.body') }}</p>
      </div>
      <div class="passkey-banner-actions">
        <MdButton variant="text" :disabled="registering" @click="banner.dismiss()">
          {{ t('passkeyBanner.dismiss') }}
        </MdButton>
        <MdButton variant="filled" :loading="registering" @click="handleRegister">
          {{ t('passkeyBanner.bind') }}
        </MdButton>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
.passkey-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-radius: var(--md-shape-md);
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
}

.passkey-banner-icon {
  flex: none;
  font-size: 24px;
}

.passkey-banner-text {
  flex: 1 1 auto;
  min-width: 0;
}

.passkey-banner-title {
  margin: 0;
  font: 500 14px/20px var(--md-font);
  letter-spacing: .1px;
}

.passkey-banner-body {
  margin: 2px 0 0;
  font: 400 13px/18px var(--md-font);
  opacity: .85;
}

.passkey-banner-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}

.passkey-banner-enter-active,
.passkey-banner-leave-active {
  transition: opacity var(--md-dur-medium) var(--md-ease-standard),
              transform var(--md-dur-medium) var(--md-ease-standard);
}

.passkey-banner-enter-from,
.passkey-banner-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 640px) {
  .passkey-banner {
    flex-wrap: wrap;
  }

  .passkey-banner-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
