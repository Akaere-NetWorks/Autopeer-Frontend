<script setup lang="ts">
/**
 * MD3 "click to verify" captcha. The visible UI is our own Material Design 3
 * surface; the actual Cloudflare Turnstile widget runs HEADLESS (appearance:
 * 'execute') in a hidden slot and is triggered by clicking the box. This mirrors
 * the closed-source CaptchaVerify and avoids the raw managed-iframe (which we
 * cannot theme and which raced the script load). Drop-in for the old widget:
 * same `siteKey` prop, `verified`/`expired` emits, and exposed `reset()`.
 */
interface TurnstileApi {
  render: (el: string | HTMLElement, opts: Record<string, unknown>) => string
  reset: (id?: string) => void
  remove: (id?: string) => void
  execute: (id?: string) => void
}

const props = defineProps<{ siteKey: string, ariaLabel?: string }>()
const emit = defineEmits<{ verified: [string], expired: [], error: [] }>()

const { t } = useI18n()
const colorMode = useColorMode()

type State = 'idle' | 'verifying' | 'success' | 'error' | 'expired'
const state = ref<State>('idle')
const slot = ref<HTMLElement | null>(null)
let widgetId: string | undefined
let scriptFailed = false

function api(): TurnstileApi | undefined {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile
}

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (api()) return resolve()
    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]')
    if (existing) {
      if (api()) return resolve()
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('turnstile script failed')))
      // The script may have already finished loading (load won't fire again) — poll.
      const poll = setInterval(() => { if (api()) { clearInterval(poll); resolve() } }, 100)
      setTimeout(() => clearInterval(poll), 15000)
      return
    }
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.defer = true
    s.dataset.turnstile = 'true'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('turnstile script failed'))
    document.head.appendChild(s)
  })
}

// Poll for the global, then run cb; time out after 15s into an error state.
function waitForWidget(cb: () => void) {
  if (api()) return cb()
  if (scriptFailed) { state.value = 'error'; emit('error'); emit('expired'); return }
  const check = setInterval(() => { if (api()) { clearInterval(check); cb() } }, 100)
  setTimeout(() => {
    clearInterval(check)
    if (!api() && state.value === 'verifying') { state.value = 'error'; emit('error'); emit('expired') }
  }, 15000)
}

function initWidget() {
  const ts = api()
  if (!ts || !slot.value) return
  if (widgetId) { try { ts.remove(widgetId) } catch { /* noop */ } }
  slot.value.innerHTML = ''
  widgetId = ts.render(slot.value, {
    sitekey: props.siteKey,
    appearance: 'execute',
    theme: colorMode.value === 'dark' ? 'dark' : 'light',
    callback: (token: string) => { state.value = 'success'; emit('verified', token) },
    'error-callback': () => { state.value = 'error'; emit('error'); emit('expired') },
    'expired-callback': () => { state.value = 'expired'; emit('expired') },
    'timeout-callback': () => { state.value = 'expired'; emit('expired') },
  })
}

function handleClick() {
  if (state.value === 'verifying' || state.value === 'success') return
  state.value = 'verifying'
  const ts = api()
  if (widgetId && ts) {
    ts.reset(widgetId)
    setTimeout(() => { if (widgetId && api()) api()!.execute(widgetId) }, 120)
  } else {
    waitForWidget(() => {
      initWidget()
      setTimeout(() => { if (widgetId && api()) api()!.execute(widgetId) }, 120)
    })
  }
}

function reset() {
  state.value = 'idle'
  const ts = api()
  if (widgetId && ts) { try { ts.reset(widgetId) } catch { /* noop */ } }
}
defineExpose({ reset })

onMounted(() => { loadScript().catch(() => { scriptFailed = true }) })
onUnmounted(() => {
  const ts = api()
  if (widgetId && ts) { try { ts.remove(widgetId) } catch { /* noop */ } widgetId = undefined }
})

const icon = computed(() => ({
  idle: 'verified_user',
  verifying: 'progress_activity',
  success: 'task_alt',
  error: 'error',
  expired: 'running_with_errors',
}[state.value]))

const title = computed(() => ({
  idle: t('captcha.clickToVerify'),
  verifying: t('captcha.verifying'),
  success: t('captcha.verified'),
  error: t('captcha.failed'),
  expired: t('captcha.expired'),
}[state.value]))

const sub = computed(() => ({
  idle: t('captcha.iAmHuman'),
  verifying: t('captcha.verifyingIdentity'),
  success: t('captcha.passedVerification'),
  error: t('captcha.clickToRetry'),
  expired: t('captcha.clickToVerifyAgain'),
}[state.value]))
</script>

<template>
  <div class="cap-wrap">
    <button
      type="button"
      class="cap-box"
      :class="`cap-${state}`"
      :aria-pressed="state === 'success'"
      :aria-busy="state === 'verifying'"
      :aria-label="ariaLabel || t('captcha.clickToVerify')"
      :disabled="state === 'verifying' || state === 'success'"
      @click="handleClick"
    >
      <span class="cap-icon">
        <MdSym :name="icon" :class="{ spinning: state === 'verifying' }" :fill="state === 'success'" :size="22" />
      </span>
      <span class="cap-text">
        <span class="cap-title md-body-large">{{ title }}</span>
        <span class="cap-sub md-body-small">{{ sub }}</span>
      </span>
      <span v-if="state === 'verifying'" class="cap-progress"><span class="cap-progress-bar" /></span>
    </button>
    <!-- Headless Turnstile renders here (appearance: execute) -->
    <div ref="slot" class="cap-slot" />
  </div>
</template>

<style scoped>
.cap-wrap { margin-top: 4px; }
.cap-slot { position: absolute; width: 0; height: 0; overflow: hidden; opacity: 0; pointer-events: none; }

.cap-box {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  text-align: left;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-shape-md);
  background: var(--md-sys-color-surface-container-low);
  color: var(--md-sys-color-on-surface);
  cursor: pointer;
  overflow: hidden;
  transition: border-color var(--md-dur-short) var(--md-ease-standard),
              background-color var(--md-dur-short) var(--md-ease-standard),
              box-shadow var(--md-dur-short) var(--md-ease-standard);
}
.cap-box:hover:not(:disabled) { border-color: var(--md-sys-color-primary); }
.cap-box:focus-visible { outline: 2px solid var(--md-sys-color-primary); outline-offset: 2px; }
.cap-box:disabled { cursor: default; }

.cap-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; flex-shrink: 0;
  border-radius: var(--md-shape-sm);
  background: var(--md-sys-color-surface-container-highest);
  color: var(--md-sys-color-on-surface-variant);
  transition: background-color var(--md-dur-short), color var(--md-dur-short);
}
.cap-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cap-title { font-weight: 500; line-height: 1.3; }
.cap-sub { color: var(--md-sys-color-on-surface-variant); line-height: 1.3; }

/* Verifying */
.cap-verifying { border-color: var(--md-sys-color-primary); cursor: wait; }
.cap-verifying .cap-icon { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }

/* Success */
.cap-success { border-color: var(--md-sys-color-success); background: var(--md-sys-color-success-container); }
.cap-success .cap-icon { background: var(--md-sys-color-success); color: var(--md-sys-color-on-success); }
.cap-success .cap-title { color: var(--md-sys-color-on-success-container); }
.cap-success .cap-sub { color: var(--md-sys-color-on-success-container); opacity: .85; }

/* Error */
.cap-error { border-color: var(--md-sys-color-error); background: var(--md-sys-color-error-container); }
.cap-error .cap-icon { background: var(--md-sys-color-error); color: var(--md-sys-color-on-error); }
.cap-error .cap-title { color: var(--md-sys-color-on-error-container); }
.cap-error .cap-sub { color: var(--md-sys-color-on-error-container); opacity: .85; }

/* Expired (warning palette, falls back to error tokens if absent) */
.cap-expired {
  border-color: var(--md-sys-color-warning, var(--md-sys-color-error));
  background: var(--md-sys-color-warning-container, var(--md-sys-color-error-container));
}
.cap-expired .cap-icon {
  background: var(--md-sys-color-warning, var(--md-sys-color-error));
  color: var(--md-sys-color-on-warning, var(--md-sys-color-on-error));
}
.cap-expired .cap-title { color: var(--md-sys-color-on-warning-container, var(--md-sys-color-on-error-container)); }

/* Indeterminate progress bar while challenging */
.cap-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; overflow: hidden; background: var(--md-sys-color-primary-container); }
.cap-progress-bar { position: absolute; top: 0; bottom: 0; width: 40%; background: var(--md-sys-color-primary); border-radius: 99px; animation: cap-indeterminate 1.4s var(--md-ease-standard) infinite; }
@keyframes cap-indeterminate { 0% { left: -40%; } 100% { left: 100%; } }

.spinning { animation: cap-spin 1s linear infinite; }
@keyframes cap-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .cap-progress-bar, .spinning { animation-duration: .001ms !important; }
}
</style>
