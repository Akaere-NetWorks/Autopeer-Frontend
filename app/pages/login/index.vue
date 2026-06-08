<script setup lang="ts">
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
const adminEmail = ref('')
const adminPassword = ref('')
const challengeId = ref('')
const challengeText = ref('')
const maskedEmail = ref('')
const gpgAvailable = ref<boolean | null>(null)
const turnstileToken = ref('')
const submitting = ref(false)
const captchaRef = ref<{ reset: () => void } | null>(null)

const { data: tsConfig } = await useAsyncData('turnstile', () => auth.turnstileConfig().catch(() => ({ enabled: false, site_key: '' })))

// Detect passkey support only AFTER mount so SSR and the first client render
// agree (both false) — otherwise the method segmented control hydration-mismatches.
const passkeySupported = ref(false)
onMounted(() => { passkeySupported.value = typeof window.PublicKeyCredential !== 'undefined' })

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

function redirectAfterLogin(fallback = '/peers') {
  const r = typeof route.query.redirect === 'string' ? route.query.redirect : fallback
  return navigateTo(r)
}

async function startAdmin() {
  if (tsConfig.value?.enabled && !turnstileToken.value) {
    toast.show(t('captcha.required'), { kind: 'error' })
    return
  }
  submitting.value = true
  try {
    await auth.adminLogin(adminEmail.value, adminPassword.value, turnstileToken.value || undefined)
    await redirectAfterLogin('/admin')
  } catch (e) {
    toast.error(e)
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

async function verifyEmail() {
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
  submitting.value = true
  try {
    await auth.verifyGpg(Number(asn.value), challengeId.value, signed.value)
    await redirectAfterLogin()
  } catch (e) {
    toast.error(e)
  } finally {
    submitting.value = false
  }
}

async function copyChallenge() {
  if (import.meta.client && navigator.clipboard) {
    await navigator.clipboard.writeText(challengeText.value)
    toast.show(t('common.copied'))
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
        <!-- ASN step -->
        <div v-if="step === 'asn'" class="col gap-5">
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
            <MdButton variant="text" icon="arrow_back" @click="step = 'asn'">{{ t('common.back') }}</MdButton>
            <MdButton variant="text" icon="refresh" @click="startAuth">{{ t('login.resend') }}</MdButton>
          </div>
        </div>

        <!-- GPG step -->
        <div v-else-if="step === 'gpg'" class="col gap-4">
          <div>
            <p class="md-label-large txt-variant" :style="{ margin: '0 0 6px' }">{{ t('login.challengeText') }}</p>
            <div class="code-block" :style="{ position: 'relative' }">
              {{ challengeText }}
              <button class="icon-btn" :style="{ position: 'absolute', top: '6px', right: '6px', width: '32px', height: '32px' }" :title="t('common.copy')" @click="copyChallenge">
                <MdSym name="content_copy" :size="18" />
              </button>
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
          <MdButton variant="filled" icon="verified_user" :disabled="signed.length < 10" :loading="submitting" block @click="verifyGpg">
            {{ t('login.verifySignature') }}
          </MdButton>
          <MdButton variant="text" icon="arrow_back" :style="{ margin: '0 auto' }" @click="step = 'asn'">{{ t('login.backToLogin') }}</MdButton>
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
