import type {
  PublicNode, PublicStats, Peer, PeerSummaryItem, PeerMetrics,
  CreatePeerReq, CreatePeerResp, UpdatePeerReq, AuthSession, AuditPage,
  EmailPreferences, NotificationPreferences, TelegramBinding, TelegramNotificationPrefs,
  McpKey, LookingGlassResult, LookingGlassType,
} from '~/types/api'

/** Typed error parsed from the backend `{error, message, request_id}` body. */
export class ApiError extends Error {
  status: number
  code: string
  requestId?: string
  data: Record<string, unknown>
  constructor(status: number, code: string, message: string, requestId?: string, data: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.data = data
  }
}

interface FetchOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, unknown>
  headers?: Record<string, string>
}

function toApiError(err: unknown): ApiError {
  const e = err as { response?: { status?: number }, status?: number, statusCode?: number, data?: Record<string, unknown> }
  const status = e?.response?.status ?? e?.statusCode ?? e?.status ?? 0
  const data = (e?.data ?? {}) as Record<string, unknown>
  if (err instanceof ApiError) return err
  const code = typeof data.error === 'string' ? data.error : (status === 0 ? 'network' : 'error')
  const message = typeof data.message === 'string' ? data.message : (status === 0 ? 'Network error' : 'Request failed')
  const requestId = typeof data.request_id === 'string' ? data.request_id : undefined
  return new ApiError(status, code, message, requestId, data)
}

export function useApi() {
  const token = useCookie<string | null>('token', { sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
  const cfg = useRuntimeConfig()
  const apiVersion = cfg.public.apiVersion as string

  async function refreshOnce(): Promise<boolean> {
    try {
      const res = await $fetch<{ access_token?: string, token?: string }>('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Autopeer-Version': apiVersion },
      })
      const next = res.access_token || res.token
      if (next) {
        token.value = next
        return true
      }
      return false
    } catch {
      token.value = null
      return false
    }
  }

  async function apiFetch<T>(path: string, opts: FetchOpts = {}, _retry = false): Promise<T> {
    const headers: Record<string, string> = { 'Autopeer-Version': apiVersion, ...(opts.headers || {}) }
    if (token.value) headers.Authorization = `Bearer ${token.value}`
    try {
      const res = await $fetch(path, {
        method: opts.method,
        body: opts.body as never,
        query: opts.query,
        headers,
      })
      return res as T
    } catch (err) {
      const apiErr = toApiError(err)
      const isAuthPath = path.includes('/auth/')
      if (apiErr.status === 401 && !_retry && !isAuthPath && import.meta.client && token.value) {
        const ok = await refreshOnce()
        if (ok) return apiFetch<T>(path, opts, true)
      }
      throw apiErr
    }
  }

  // ── Endpoint groups (typed) ────────────────────────────────────────────────
  const nodes = {
    listPublic: () => apiFetch<PublicNode[]>('/api/v1/nodes'),
  }

  const stats = {
    public: () => apiFetch<PublicStats>('/api/v1/stats'),
  }

  const peers = {
    creationStatus: () => apiFetch<{ enabled: boolean }>('/api/v1/user/peers/creation-status'),
    list: () => apiFetch<Peer[]>('/api/v1/user/peers'),
    summary: () => apiFetch<PeerSummaryItem[]>('/api/v1/user/peers/summary'),
    get: (id: string) => apiFetch<Peer>(`/api/v1/user/peers/${id}`),
    metrics: (id: string, hours = 24) => apiFetch<PeerMetrics>(`/api/v1/user/peers/${id}/metrics`, { query: { hours } }),
    create: (body: CreatePeerReq) => apiFetch<CreatePeerResp>('/api/v1/user/peers', { method: 'POST', body }),
    update: (id: string, body: UpdatePeerReq) => apiFetch<{ status: string }>(`/api/v1/user/peers/${id}`, { method: 'PUT', body }),
    remove: (id: string) => apiFetch<{ status: string }>(`/api/v1/user/peers/${id}`, { method: 'DELETE' }),
  }

  const account = {
    devices: () => apiFetch<AuthSession[]>('/api/v1/user/devices'),
    revokeOtherDevices: () => apiFetch<{ ok: boolean }>('/api/v1/user/devices', { method: 'DELETE' }),
    revokeDevice: (id: string) => apiFetch<{ ok: boolean }>(`/api/v1/user/devices/${id}`, { method: 'DELETE' }),
    audit: (query: { action?: string, page?: number, per_page?: number } = {}) =>
      apiFetch<AuditPage>('/api/v1/user/audit', { query }),
    emailPrefs: () => apiFetch<EmailPreferences>('/api/v1/user/email-preferences'),
    setEmailLevel: (email_level: number) => apiFetch<{ email_level: number }>('/api/v1/user/email-preferences', { method: 'PUT', body: { email_level } }),
    notificationPrefs: () => apiFetch<NotificationPreferences>('/api/v1/user/notification-preferences'),
    setNotificationPrefs: (body: { enabled_keys: string[], confirmed_disabled_critical_keys?: string[], seen_catalog_version?: number, wizard_completed?: boolean }) =>
      apiFetch<{ status: string, enabled_keys: string[], seen_catalog_version: number }>('/api/v1/user/notification-preferences', { method: 'PUT', body }),
  }

  const telegram = {
    binding: () => apiFetch<TelegramBinding>('/api/v1/user/telegram/binding'),
    bindToken: () => apiFetch<{ deeplink: string, expires_at: string }>('/api/v1/user/telegram/bind-token', { method: 'POST' }),
    unbind: () => apiFetch<{ status: string }>('/api/v1/user/telegram/binding', { method: 'DELETE' }),
    notificationPrefs: () => apiFetch<TelegramNotificationPrefs>('/api/v1/user/telegram/notification-preferences'),
    setNotificationPrefs: (enabled_keys: string[]) =>
      apiFetch<{ status: string, enabled_keys: string[] }>('/api/v1/user/telegram/notification-preferences', { method: 'PUT', body: { enabled_keys } }),
  }

  const lookingGlass = {
    run: (body: { node_id: string, type: LookingGlassType, target: string }) =>
      apiFetch<LookingGlassResult>('/api/v1/user/looking-glass/run', { method: 'POST', body }),
  }

  const mcp = {
    list: () => apiFetch<McpKey[]>('/api/v1/user/mcp-keys'),
    create: (body: { name: string, expires_at?: string | null, capabilities?: string[] }) =>
      apiFetch<McpKey>('/api/v1/user/mcp-keys', { method: 'POST', body }),
    remove: (id: string) => apiFetch<{ message: string }>(`/api/v1/user/mcp-keys/${id}`, { method: 'DELETE' }),
  }

  return { apiFetch, refreshOnce, nodes, stats, peers, account, telegram, lookingGlass, mcp }
}
