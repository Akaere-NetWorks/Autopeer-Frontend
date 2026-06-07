import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type { AuthResponse, AuthUser } from '~/types/api'
import { decodeJwt } from '~/utils/jwt'

/**
 * Auth state + every login flow the OSS backend supports (email code, GPG,
 * passkey, admin password, device flow). The access token lives in a cookie
 * (readable so SSR can forward it as a Bearer header); the refresh token is an
 * HttpOnly cookie managed by the backend through the same-origin proxy.
 */
export function useAuth() {
  const token = useCookie<string | null>('token', { sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
  const user = useState<AuthUser | null>('auth-user', () => decodeUser(token.value))
  const cfg = useRuntimeConfig()
  const apiVersion = cfg.public.apiVersion as string
  const { apiFetch, refreshOnce } = useApi()

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const asn = computed(() => user.value?.asn ?? null)

  function decodeUser(t: string | null): AuthUser | null {
    const p = decodeJwt(t)
    if (p && (p.role === 'user' || p.role === 'admin') && p.sub) {
      return { role: p.role, asn: p.asn, email: p.email }
    }
    return null
  }

  function applySession(res: AuthResponse) {
    const next = res.access_token || res.token
    if (next) {
      token.value = next
      user.value = res.user ?? decodeUser(next)
    }
    return res
  }

  /** Re-derive user state from the token cookie (called on app init). */
  function hydrate() {
    user.value = decodeUser(token.value)
  }

  // ── Email-code login ────────────────────────────────────────────────────────
  function requestCode(asnValue: number, turnstileToken?: string) {
    return apiFetch<{ masked_email: string, expires_in: number }>('/api/v1/auth/user/request-code', {
      method: 'POST',
      body: { asn: asnValue, cf_turnstile_response: turnstileToken },
    })
  }
  async function verifyCode(asnValue: number, code: string) {
    return applySession(await apiFetch<AuthResponse>('/api/v1/auth/user/verify-code', {
      method: 'POST',
      body: { asn: asnValue, code },
    }))
  }

  // ── GPG login ────────────────────────────────────────────────────────────────
  function checkGpg(asnValue: number) {
    return apiFetch<{ available: boolean }>('/api/v1/auth/user/check-gpg-availability', {
      method: 'POST',
      body: { asn: asnValue },
    })
  }
  function requestGpgChallenge(asnValue: number, turnstileToken?: string) {
    return apiFetch<{ challenge_id: string, challenge_text: string, expires_in: number }>(
      '/api/v1/auth/user/request-gpg-challenge',
      { method: 'POST', body: { asn: asnValue, cf_turnstile_response: turnstileToken } },
    )
  }
  async function verifyGpg(asnValue: number, challengeId: string, signedMessage: string, publicKey?: string) {
    return applySession(await apiFetch<AuthResponse>('/api/v1/auth/user/verify-gpg', {
      method: 'POST',
      body: { asn: asnValue, challenge_id: challengeId, signed_message: signedMessage, public_key: publicKey },
    }))
  }

  // ── Passkey login ────────────────────────────────────────────────────────────
  async function passkeyLogin(asnValue: number, turnstileToken?: string) {
    const options = await apiFetch<Record<string, unknown>>('/api/v1/auth/user/passkey/begin', {
      method: 'POST',
      body: { asn: asnValue, cf_turnstile_response: turnstileToken },
    })
    const optionsJSON = (options as { publicKey?: unknown }).publicKey ?? options
    const assertion = await startAuthentication({ optionsJSON: optionsJSON as never })
    return applySession(await $fetch<AuthResponse>(`/api/v1/auth/user/passkey/finish?asn=${asnValue}`, {
      method: 'POST',
      headers: { 'Autopeer-Version': apiVersion },
      body: assertion,
    }))
  }

  // ── Passkey registration (authenticated) ─────────────────────────────────────
  async function passkeyStatus() {
    return apiFetch<{ has_passkey: boolean, count: number }>('/api/v1/passkey/status')
  }
  async function passkeyRegister() {
    const options = await apiFetch<Record<string, unknown>>('/api/v1/passkey/register/begin', { method: 'POST' })
    const optionsJSON = (options as { publicKey?: unknown }).publicKey ?? options
    const attestation = await startRegistration({ optionsJSON: optionsJSON as never })
    return apiFetch<{ success: boolean, id: string, name: string }>('/api/v1/passkey/register/finish', {
      method: 'POST',
      body: attestation,
    })
  }

  // ── Admin password login ─────────────────────────────────────────────────────
  async function adminLogin(email: string, password: string, turnstileToken?: string) {
    return applySession(await apiFetch<AuthResponse>('/api/v1/auth/admin/login', {
      method: 'POST',
      body: { email, password, cf_turnstile_response: turnstileToken },
    }))
  }

  // ── Device flow (CLI activation) ─────────────────────────────────────────────
  function deviceRequest(userCode: string) {
    return apiFetch<{
      user_code: string, client_name: string, device_name?: string, version?: string,
      scopes: string[], status: string, created_at: string, expires_at: string
    }>('/api/v1/auth/device/request', { query: { user_code: userCode } })
  }
  function deviceAuthorize(userCode: string, decision: 'approve' | 'deny') {
    return apiFetch<{ ok: boolean, status: string }>('/api/v1/auth/device/authorize', {
      method: 'POST',
      body: { user_code: userCode, decision },
    })
  }

  // ── Misc bootstrap config ────────────────────────────────────────────────────
  function loginStatus() {
    return apiFetch<{ enabled: boolean }>('/api/v1/auth/user/login-status')
  }
  function turnstileConfig() {
    return apiFetch<{ enabled: boolean, site_key: string }>('/api/v1/auth/turnstile-config')
  }

  async function logout() {
    try {
      await apiFetch<{ ok: boolean }>('/api/v1/auth/logout', { method: 'POST' })
    } catch {
      // best-effort — clear locally regardless
    }
    token.value = null
    user.value = null
  }

  return {
    token, user, isAuthenticated, isAdmin, asn,
    hydrate, applySession, refreshOnce,
    requestCode, verifyCode,
    checkGpg, requestGpgChallenge, verifyGpg,
    passkeyLogin, passkeyStatus, passkeyRegister,
    adminLogin,
    deviceRequest, deviceAuthorize,
    loginStatus, turnstileConfig, logout,
  }
}
