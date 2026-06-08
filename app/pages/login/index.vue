<script setup lang="ts">
import { ApiError } from '~/composables/useApi'
import { safeInternalRedirect } from '~/utils/redirect'

definePageMeta({ middleware: 'guest', title: 'common.signIn' })

const { t } = useI18n()
const route = useRoute()
const toast = useToast()
const auth = useAuth()

type Step = 'asn' | 'email' | 'gpg' | 'admin'
type Method = 'email' | 'gpg' | 'passkey'

const step = ref<Step>('asn')
const asn = ref('')
const method = ref<Method>('email')
const code = ref('')
const signed = ref('')
const publicKey = ref('')
const showPublicKey = ref(false)
const adminEmail = ref('')
const adminPassword = ref('')
const challengeId = ref('')
const challengeText = ref('')
const maskedEmail = ref('')
const gpgAvailable = ref<boolean | null>(null)
const turnstileToken = ref('')
const submitting = ref(false)
const captchaRef = ref<{ reset: () => void } | null>(null)

// Whether user login is enabled at the operator level. null = not yet known.
const loginEnabled = ref<boolean | null>(null)
// Shown once when a refresh dumps the user back to the ASN step mid-flow.
const sessionExpired = ref(false)

const { data: tsConfig } = await useAsyncData('turnstile', () => auth.turnstileConfig().catch(() => ({ enabled: false, site_key: '' })), { lazy: true, server: false })

// Detect passkey support only AFTER mount so SSR and the first client render
// agree (both false) — otherwise the method segmented control hydration-mismatches.
const passkeySupported = ref(false)
onMounted(async () => {
  passkeySupported.value = typeof window.PublicKeyCredential !== 'undefined'
  // The multi-step state lives only in refs, so a refresh while on a verify step
  // remounts at step 'asn'. Surface that instead of silently losing the email/code.
  if (step.value !== 'asn') {
    sessionExpired.value = true
    resetFlow()
  }
  try {
    const status = await auth.loginStatus()
    loginEnabled.value = status.enabled
  } catch {
    // Fail open: if the status probe errors, let the user try (backend still gates).
    loginEnabled.value = true
  }
})

const methodOptions = computed(() => {
  const opts = [
    { value: 'email', label: t('login.methods.email'), icon: 'mail' },
    { value: 'gpg', label: t('login.methods.gpg'), icon: 'fingerprint' },
  ]
  if (passkeySupported.value) opts.push({ value: 'passkey', label: t('login.methods.passkey'), icon: 'passkey' })
  return opts
})

const subtitle = computed(() => {
  if (step.value === 'email') return t('login.subtitleEmail', { asn: asn.value || '…' })
  if (step.value === 'gpg') return t('login.subtitleGpg', { asn: asn.value || '…' })
  if (step.value === 'admin') return t('login.subtitleAdmin')
  if (method.value === 'passkey') return t('login.subtitlePasskey', { asn: asn.value || '…' })
  return t('login.subtitleAsn')
})

const captchaReady = computed(() => !tsConfig.value?.enabled || !!turnstileToken.value)

// GPG availability probe (debounced).
let gpgTimer: ReturnType<typeof setTimeout> | undefined
watch(asn, (v) => {
  gpgAvailable.value = null
  if (gpgTimer) clearTimeout(gpgTimer)
  const n = Number(v)
  if (!n || v.length < 7) return
  gpgTimer = setTimeout(async () => {
    try {
      const res = await auth.checkGpg(n)
      gpgAvailable.value = res.available
    } catch {
      gpgAvailable.value = null
    }
  }, 450)
})

function onlyDigits(v: string) { asn.value = v.replace(/\D/g, '') }
function resetCaptcha() {
  turnstileToken.value = ''
  captchaRef.value?.reset()
}

// Return to the ASN step and wipe any verify-step state.
function resetFlow() {
  step.value = 'asn'
  code.value = ''
  signed.value = ''
  publicKey.value = ''
  showPublicKey.value = false
  challengeId.value = ''
  challengeText.value = ''
  maskedEmail.value = ''
  stopCooldown()
}

// ── Resend cooldown (60s) ───────────────────────────────────────────────────
const resendCooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null
function startCooldown() {
  resendCooldown.value = 60
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    resendCooldown.value--
    if (resendCooldown.value <= 0 && cooldownTimer) {
      clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}
function stopCooldown() {
  if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null }
  resendCooldown.value = 0
}
onUnmounted(stopCooldown)

// Only honor a same-origin absolute redirect; otherwise fall back to a
// role-aware internal landing page. Mirrors the fixed guest.ts guard.
function redirectAfterLogin() {
  const fallback = auth.isAdmin.value ? '/admin' : '/peers'
  return navigateTo(safeInternalRedirect(route.query.redirect, fallback))
}

async function startAdmin() {
  if (tsConfig.value?.enabled && !turnstileToken.value) {
    toast.show(t('captcha.required'), { kind: 'error' })
    return
  }
  submitting.value = true
  try {
    await auth.adminLogin(adminEmail.value, adminPassword.value, turnstileToken.value || undefined)
    await redirectAfterLogin()
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) toast.show(t('login.invalidCredentials'), { kind: 'error' })
    else toast.error(e)
    resetCaptcha()
  } finally {
    submitting.value = false
  }
}

async function startAuth() {
  const n = Number(asn.value)
  if (!n) return
  if (tsConfig.value?.enabled && !turnstileToken.value) {
    toast.show(t('captcha.required'), { kind: 'error' })
    return
  }
  submitting.value = true
  try {
    if (method.value === 'email') {
      const res = await auth.requestCode(n, turnstileToken.value || undefined)
      maskedEmail.value = res.masked_email
      step.value = 'email'
      startCooldown()
    } else if (method.value === 'gpg') {
      const res = await auth.requestGpgChallenge(n, turnstileToken.value || undefined)
      challengeId.value = res.challenge_id
      challengeText.value = res.challenge_text
      step.value = 'gpg'
    } else {
      await auth.passkeyLogin(n, turnstileToken.value || undefined)
      await redirectAfterLogin()
    }
  } catch (e) {
    toast.error(e)
    resetCaptcha()
  } finally {
    submitting.value = false
  }
}

// Resend the email code. The Turnstile widget is unmounted on the email step,
// so this does NOT route through the captcha-gated startAuth — it re-requests a
// code directly (throttled by the 60s client cooldown + the backend ASN limit).
async function resend() {
  const n = Number(asn.value)
  if (resendCooldown.value > 0 || !n) return
  submitting.value = true
  try {
    const res = await auth.requestCode(n)
    maskedEmail.value = res.masked_email
    startCooldown()
  } catch (e) {
    toast.error(e)
  } finally {
    submitting.value = false
  }
}

async function verifyEmail() {
  // If the in-flight state was lost (refresh), guide the user back instead of
  // submitting against an empty ASN.
  if (!Number(asn.value)) { sessionExpired.value = true; resetFlow(); return }
  submitting.value = true
  try {
    await auth.verifyCode(Number(asn.value), code.value)
    await redirectAfterLogin()
  } catch (e) {
    toast.error(e)
  } finally {
    submitting.value = false
  }
}

async function verifyGpg() {
  if (!Number(asn.value) || !challengeId.value) { sessionExpired.value = true; resetFlow(); return }
  submitting.value = true
  try {
    await auth.verifyGpg(Number(asn.value), challengeId.value, signed.value.trim(), publicKey.value.trim() || undefined)
    await redirectAfterLogin()
  } catch (e) {
    toast.error(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="row" :style="{ justifyContent: 'center', paddingTop: '8px' }">
    <div :style="{ width: '100%', maxWidth: '480px' }">
      <div class="text-center" :style="{ marginBottom: '28px' }">
        <span :style="{ display: 'inline-flex', width: '64px', height: '64px', borderRadius: '20px', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)', marginBottom: '16px' }">
          <MdSym name="vpn_key" :size="32" fill />
        </span>
        <h1 class="md-headline-medium" :style="{ margin: '0 0 8px' }">{{ t('login.title') }}</h1>
        <p class="md-body-medium txt-variant" :style="{ margin: 0 }">{{ subtitle }}</p>
      </div>

      <div class="card card-elevated card-pad">
        <!-- Session-expired notice (refresh dropped the verify state) -->
        <div v-if="sessionExpired && step === 'asn'" class="md-body-medium row gap-3" :style="{ alignItems: 'flex-start', padding: '12px 14px', marginBottom: '16px', borderRadius: '12px', background: 'var(--md-sys-color-warning-container)', color: 'var(--md-sys-color-on-warning-container)' }">
          <MdSym name="info" :size="18" />
          <span>{{ t('login.sessionExpired') }}</span>
        </div>

        <!-- Login-disabled gate: replaces the form entirely -->
        <div v-if="loginEnabled === false" class="md-body-medium row gap-3" :style="{ alignItems: 'flex-start', padding: '14px 16px', borderRadius: '12px', background: 'var(--md-sys-color-warning-container)', color: 'var(--md-sys-color-on-warning-container)' }">
          <MdSym name="warning" :size="20" />
          <span>{{ t('login.loginDisabled') }}</span>
        </div>

        <!-- ASN step -->
        <div v-else-if="step === 'asn'" class="col gap-5">
          <MdTextField
            :label="t('login.asnLabel')"
            icon="tag"
            :model-value="asn"
            :placeholder="t('login.asnPlaceholder')"
            inputmode="numeric"
            mono
            tf-bg="var(--md-sys-color-surface-container-low)"
            :supporting="t('login.asnSupporting')"
            @update:model-value="onlyDigits"
          />

          <div>
            <p class="md-label-large txt-variant" :style="{ margin: '0 0 10px' }">{{ t('login.method') }}</p>
            <MdSegmented v-model="method" :options="methodOptions" />
            <p v-if="method === 'gpg'" class="md-body-small txt-variant row gap-2" :style="{ margin: '10px 2px 0' }">
              <MdSym :name="gpgAvailable ? 'check_circle' : 'info'" :size="16" :fill="!!gpgAvailable" />
              <span v-if="gpgAvailable === true">{{ t('login.gpgDetected') }}</span>
              <span v-else-if="gpgAvailable === false">{{ t('login.gpgUnavailable') }}</span>
              <span v-else>{{ t('login.gpgEnterAsn') }}</span>
            </p>
          </div>

          <ClientOnly>
            <TurnstileWidget
              v-if="tsConfig?.enabled && tsConfig.site_key"
              ref="captchaRef"
              :site-key="tsConfig.site_key"
              @verified="(tok: string) => (turnstileToken = tok)"
              @expired="turnstileToken = ''"
            />
          </ClientOnly>

          <MdButton
            variant="filled"
            :icon="method === 'email' ? 'send' : method === 'passkey' ? 'passkey' : 'arrow_forward'"
            :disabled="asn.length < 4 || !captchaReady"
            :loading="submitting"
            block
            @click="startAuth"
          >
            {{ method === 'email' ? t('login.sendCode') : method === 'passkey' ? t('login.usePasskey') : t('login.continueGpg') }}
          </MdButton>

          <MdButton variant="text" icon="admin_panel_settings" :style="{ margin: '0 auto' }" @click="step = 'admin'">{{ t('login.adminLink') }}</MdButton>
        </div>

        <!-- Email code step -->
        <div v-else-if="step === 'email'" class="col gap-5">
          <p class="md-body-small txt-variant text-center" :style="{ margin: 0 }">{{ t('login.codeSent', { email: maskedEmail }) }}</p>
          <MdTextField
            :label="t('login.codeLabel')"
            :model-value="code"
            placeholder="000000"
            mono
            icon="dialpad"
            inputmode="numeric"
            tf-bg="var(--md-sys-color-surface-container-low)"
            @update:model-value="(v: string) => (code = v.replace(/\D/g, '').slice(0, 6))"
          />
          <MdButton variant="filled" icon="check" :disabled="code.length < 6" :loading="submitting" block @click="verifyEmail">
            {{ t('login.verify') }}
          </MdButton>
          <div class="row space-between">
            <MdButton variant="text" icon="arrow_back" @click="resetFlow">{{ t('common.back') }}</MdButton>
            <MdButton variant="text" icon="refresh" :disabled="resendCooldown > 0 || submitting" @click="resend">
              {{ resendCooldown > 0 ? t('login.resendIn', { seconds: resendCooldown }) : t('login.resend') }}
            </MdButton>
          </div>
        </div>

        <!-- GPG step -->
        <div v-else-if="step === 'gpg'" class="col gap-4">
          <div>
            <p class="md-label-large txt-variant" :style="{ margin: '0 0 6px' }">{{ t('login.challengeText') }}</p>
            <div class="code-block" :style="{ position: 'relative' }">
              {{ challengeText }}
              <MdCopyButton :value="challengeText" :style="{ position: 'absolute', top: '6px', right: '6px' }" />
            </div>
            <p class="md-body-small txt-variant" :style="{ margin: '8px 2px 0' }">{{ t('login.challengeHint') }}</p>
          </div>
          <MdTextArea
            :label="t('login.signedLabel')"
            :model-value="signed"
            :rows="5"
            mono
            tf-bg="var(--md-sys-color-surface-container-low)"
            :placeholder="t('login.signedPlaceholder')"
            :supporting="t('login.signedSupporting')"
            @update:model-value="(v: string) => (signed = v)"
          />

          <!-- Optional public key (for ASNs whose key the server does not hold) -->
          <div>
            <MdButton variant="text" :icon="showPublicKey ? 'expand_less' : 'expand_more'" @click="showPublicKey = !showPublicKey">
              {{ t('login.publicKeyToggle') }}
            </MdButton>
            <MdTextArea
              v-if="showPublicKey"
              :label="t('login.publicKeyLabel')"
              :model-value="publicKey"
              :rows="5"
              mono
              tf-bg="var(--md-sys-color-surface-container-low)"
              :placeholder="t('login.publicKeyPlaceholder')"
              :supporting="t('login.publicKeyHint')"
              :style="{ marginTop: '8px' }"
              @update:model-value="(v: string) => (publicKey = v)"
            />
          </div>

          <MdButton variant="filled" icon="verified_user" :disabled="!signed.trim()" :loading="submitting" block @click="verifyGpg">
            {{ t('login.verifySignature') }}
          </MdButton>
          <MdButton variant="text" icon="arrow_back" :style="{ margin: '0 auto' }" @click="resetFlow">{{ t('login.backToLogin') }}</MdButton>
        </div>

        <!-- Admin step -->
        <div v-else-if="step === 'admin'" class="col gap-5">
          <MdTextField
            :label="t('login.adminEmail')"
            icon="mail"
            type="email"
            inputmode="email"
            :model-value="adminEmail"
            tf-bg="var(--md-sys-color-surface-container-low)"
            @update:model-value="(v: string) => (adminEmail = v)"
          />
          <MdTextField
            :label="t('login.adminPassword')"
            icon="lock"
            type="password"
            :model-value="adminPassword"
            tf-bg="var(--md-sys-color-surface-container-low)"
            @update:model-value="(v: string) => (adminPassword = v)"
          />
          <ClientOnly>
            <TurnstileWidget
              v-if="tsConfig?.enabled && tsConfig.site_key"
              ref="captchaRef"
              :site-key="tsConfig.site_key"
              @verified="(tok: string) => (turnstileToken = tok)"
              @expired="turnstileToken = ''"
            />
          </ClientOnly>
          <MdButton
            variant="filled"
            icon="login"
            :disabled="!adminEmail || !adminPassword || !captchaReady"
            :loading="submitting"
            block
            @click="startAdmin"
          >
            {{ t('login.adminSignIn') }}
          </MdButton>
          <MdButton variant="text" icon="arrow_back" :style="{ margin: '0 auto' }" @click="step = 'asn'">{{ t('login.backToUser') }}</MdButton>
        </div>
      </div>
    </div>
  </div>
</template>
