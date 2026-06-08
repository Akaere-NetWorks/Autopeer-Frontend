import { decodeJwt, isTokenExpiringSoon } from '~/utils/jwt'
import type {
  PublicNode, PublicStats, Peer, PeerSummaryItem, PeerMetrics,
  CreatePeerReq, CreatePeerResp, UpdatePeerReq, AuthSession, AuditPage,
  EmailPreferences, NotificationPreferences, TelegramBinding, TelegramNotificationPrefs,
  McpKey, McpAuditLog, LookingGlassResult, LookingGlassType, AuthResponse,
  PasskeyInfo, RegistryAsnLookup,
} from '~/types/api'
import type {
  AdminStats, AdminPeerListResponse, AdminPeerGetResponse, AdminUpdatePeerReq,
  AdminNode, CreateNodeReq, CreateNodeResp, UpdateNodeReq, UpdateAgentReq,
  ReleaseItem, BotSettingItem, BotStats, BotCommandEntry, BotBlockedUser,
  SiteSettingItem, NotificationSettingItem, AdminMcpKey, McpAuditLogEntry,
  SystemStatus, DBTablesResponse, QueueOverview, QueueSnapshot, TaskListSnapshot,
  TaskSnapshot, ServerSnapshot, SchedulerEntrySnapshot, EnqueueEventSnapshot, TaskState,
  AssistantAuth, AssistantApprovalResponse, AssistantToolCallResponse, AssistantTool,
  PeersImportResult,
} from '~/types/admin'

/** Pre-expiry skew (seconds) for the proactive refresh before authed requests. */
const REFRESH_SKEW_SECONDS = 120
/** Per-request timeout (ms) — resolves spinners/disabled buttons on a stalled fetch. */
const REQUEST_TIMEOUT_MS = 30000

/**
 * Module-scoped single-flight refresh promise. N concurrent 401s (or proactive
 * pre-expiry checks) collapse into exactly ONE POST /auth/refresh; everyone
 * awaits the same rotated token instead of clobbering each other's rotation
 * (parallel refreshes previously raced and spuriously logged the user out).
 */
let refreshPromise: Promise<boolean> | null = null

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
  /**
   * Set ONLY on the refresh call itself so it never recurses into refresh-retry.
   * Every other authenticated path participates in proactive + reactive refresh.
   */
  skipRefresh?: boolean
  /**
   * Public/anonymous endpoint (landing, stats): on 401 strip Authorization,
   * clear the stale `token` cookie and retry once anonymously so a logged-out-
   * but-stale cookie never blanks the page.
   */
  public?: boolean
  /** When set, parse the response as a Blob (binary downloads, e.g. exports). */
  responseType?: 'blob'
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  // AbortSignal.timeout() rejects with a DOMException named 'TimeoutError'
  // (older runtimes: 'AbortError'); surface it as a deterministic timeout so
  // spinners and disabled buttons resolve instead of hanging forever. ofetch
  // wraps the original abort in a FetchError, so also inspect err.cause.name.
  const e0 = err as { name?: string, cause?: { name?: string } }
  const abortName = e0?.name === 'TimeoutError' || e0?.name === 'AbortError'
    ? e0.name
    : (e0?.cause?.name === 'TimeoutError' || e0?.cause?.name === 'AbortError' ? e0.cause.name : null)
  if (abortName) {
    return new ApiError(0, 'timeout', 'Request timed out')
  }
  const e = err as { response?: { status?: number }, status?: number, statusCode?: number, data?: Record<string, unknown> }
  const status = e?.response?.status ?? e?.statusCode ?? e?.status ?? 0
  const data = (e?.data ?? {}) as Record<string, unknown>
  const code = typeof data.error === 'string' ? data.error : (status === 0 ? 'network' : 'error')
  const message = typeof data.message === 'string' ? data.message : (status === 0 ? 'Network error' : 'Request failed')
  const requestId = typeof data.request_id === 'string' ? data.request_id : undefined
  return new ApiError(status, code, message, requestId, data)
}

export function useApi() {
  const token = useCookie<string | null>('token', { sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
  const cfg = useRuntimeConfig()
  const apiVersion = cfg.public.apiVersion as string
  // Shared with useAuth via the same key. While impersonating, `token` is a
  // user-scoped login-as token whose refresh cookie belongs to the admin, so
  // refreshing would mint the WRONG identity — skip it entirely.
  const isImpersonating = useState<boolean>('auth-impersonating', () => false)

  /**
   * Perform a single POST /auth/refresh and rotate the `token` cookie.
   * Wrapped by `refresh()` so concurrent callers share one in-flight request.
   */
  async function doRefresh(): Promise<boolean> {
    try {
      const res = await $fetch<{ access_token?: string, token?: string }>('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Autopeer-Version': apiVersion },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

  /**
   * Single-flight refresh: collapses concurrent refresh attempts into ONE POST
   * /auth/refresh shared via the module-scoped `refreshPromise`. Skips entirely
   * while impersonating (the refresh cookie belongs to the admin, not the
   * impersonated user — refreshing would mint the wrong identity).
   */
  function refresh(): Promise<boolean> {
    if (isImpersonating.value) return Promise.resolve(false)
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => { refreshPromise = null })
    }
    return refreshPromise
  }

  /** Back-compat alias kept on the return surface for existing callers. */
  const refreshOnce = refresh

  async function apiFetch<T>(path: string, opts: FetchOpts = {}, _retry = false): Promise<T> {
    const headers: Record<string, string> = { 'Autopeer-Version': apiVersion, ...(opts.headers || {}) }

    // (2) Proactive pre-expiry refresh before an authenticated request: if the
    // current access token is within REFRESH_SKEW_SECONDS of expiry, rotate it
    // first (single-flight) and use the fresh token. Falls back to the reactive
    // 401 path below if this refresh fails. Skipped for the refresh call itself,
    // public endpoints, retries, and on the server.
    if (
      import.meta.client && !opts.skipRefresh && !opts.public && !_retry
      && token.value && isTokenExpiringSoon(decodeJwt(token.value), REFRESH_SKEW_SECONDS)
    ) {
      await refresh()
    }

    if (token.value) headers.Authorization = `Bearer ${token.value}`
    try {
      const res = await $fetch(path, {
        method: opts.method,
        body: opts.body as never,
        query: opts.query,
        headers,
        responseType: opts.responseType,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      return res as T
    } catch (err) {
      const apiErr = toApiError(err)
      if (apiErr.status === 401 && !_retry && import.meta.client) {
        // (4) Reactive refresh-retry — gated by an explicit skipRefresh flag set
        // ONLY on the refresh call, so /auth/admin/devices and admin login-as
        // still participate (the old broad `/auth/` path check excluded them).
        if (!opts.skipRefresh && !opts.public && token.value) {
          const ok = await refresh()
          if (ok) return apiFetch<T>(path, opts, true)
        }
        // (5) Public endpoint with a stale cookie: drop the bad token, clear the
        // cookie, and retry once anonymously so the landing/stats never blank.
        // Clearing token.value means the retry omits the Authorization header.
        if (opts.public && token.value) {
          token.value = null
          return apiFetch<T>(path, opts, true)
        }
      }
      throw apiErr
    }
  }

  // ── Endpoint groups (typed) ────────────────────────────────────────────────
  const nodes = {
    listPublic: () => apiFetch<PublicNode[]>('/api/v1/nodes', { public: true }),
  }

  const stats = {
    public: () => apiFetch<PublicStats>('/api/v1/stats', { public: true }),
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
    // USER scope: latest 200 MCP audit entries for the caller's own ASN. The
    // backend returns a bare array and ignores filters (admin.mcpKeys.auditLogs
    // is the paginated/filterable variant); `query` is accepted to mirror that
    // shape and is harmless when the server ignores it.
    auditLogs: (query: { tool?: string, page?: number, per_page?: number } = {}) =>
      apiFetch<McpAuditLog[]>('/api/v1/user/mcp-audit-logs', { query }),
  }

  const passkeys = {
    list: () => apiFetch<{ passkeys: PasskeyInfo[] }>('/api/v1/user/passkeys'),
    remove: (id: string) => apiFetch<{ success: boolean }>(`/api/v1/user/passkeys/${id}`, { method: 'DELETE' }),
  }

  const registry = {
    // Public DN42 registry ASN lookup; `email` is unmasked only for admins.
    lookupASN: (asn: number) => apiFetch<RegistryAsnLookup>(`/api/v1/registry/asn/${asn}`, { public: true }),
  }

  // ── Admin endpoint groups ──────────────────────────────────────────────────
  const A = '/api/v1/admin'
  const admin = {
    stats: () => apiFetch<AdminStats>(`${A}/stats`),

    peers: {
      list: (query: { status?: string, asn?: number, node_id?: string, page?: number, per_page?: number } = {}) =>
        apiFetch<AdminPeerListResponse>(`${A}/peers`, { query }),
      get: (id: string) => apiFetch<AdminPeerGetResponse>(`${A}/peers/${id}`),
      metrics: (id: string, hours = 24) => apiFetch<PeerMetrics>(`${A}/peers/${id}/metrics`, { query: { hours } }),
      approve: (id: string) => apiFetch<{ status: string }>(`${A}/peers/${id}/approve`, { method: 'POST' }),
      reject: (id: string, reason: string) => apiFetch<{ status: string }>(`${A}/peers/${id}/reject`, { method: 'POST', body: { reason } }),
      suspend: (id: string, reason?: string) => apiFetch<{ status: string }>(`${A}/peers/${id}/suspend`, { method: 'POST', body: { reason } }),
      unsuspend: (id: string) => apiFetch<{ status: string }>(`${A}/peers/${id}/unsuspend`, { method: 'POST' }),
      remove: (id: string) => apiFetch<{ status: string }>(`${A}/peers/${id}`, { method: 'DELETE' }),
      update: (id: string, body: AdminUpdatePeerReq) => apiFetch<{ status: string }>(`${A}/peers/${id}`, { method: 'PUT', body }),
      setContactEmail: (id: string, body: { email?: string, retry?: boolean }) =>
        apiFetch<{ email: string }>(`${A}/peers/${id}/contact-email`, { method: 'PUT', body }),
      exportUrl: () => `${A}/peers/export`,
      // Import a peers dump (export wrapper object or a bare array of entries).
      // `overwrite=true` updates existing peers; otherwise existing peers skip.
      import: (payload: unknown, overwrite = false) =>
        apiFetch<PeersImportResult>(`${A}/peers/import`, { method: 'POST', body: payload, query: { overwrite: String(overwrite) } }),
      // Fetch the export WITH the admin auth header and return a Blob (the bare
      // URL from exportUrl() is unauthenticated and would 401). Callers turn the
      // Blob into a download via URL.createObjectURL.
      exportBlob: () => apiFetch<Blob>(`${A}/peers/export`, { responseType: 'blob' }),
    },

    nodes: {
      list: () => apiFetch<AdminNode[]>(`${A}/nodes`),
      create: (body: CreateNodeReq) => apiFetch<CreateNodeResp>(`${A}/nodes`, { method: 'POST', body }),
      update: (id: string, body: UpdateNodeReq) => apiFetch<{ status: string }>(`${A}/nodes/${id}`, { method: 'PUT', body }),
      remove: (id: string) => apiFetch<{ status: string }>(`${A}/nodes/${id}`, { method: 'DELETE' }),
      importPeers: (id: string) => apiFetch<{ status: string, inserted: number, skipped: number, db_errors: number, total: number }>(`${A}/nodes/${id}/import`, { method: 'POST' }),
      birdRefresh: (id: string) => apiFetch<{ protocols: number, updated: number }>(`${A}/nodes/${id}/bird-refresh`, { method: 'POST' }),
      updateAgent: (id: string, body: UpdateAgentReq) => apiFetch<{ status: string, version: string, update_id: string }>(`${A}/nodes/${id}/update`, { method: 'POST', body }),
      rollback: (id: string) => apiFetch<{ status: string }>(`${A}/nodes/${id}/rollback`, { method: 'POST' }),
      regenerateToken: (id: string) => apiFetch<{ agent_token: string, node_id: string, message: string }>(`${A}/nodes/${id}/regenerate-token`, { method: 'POST' }),
      resetPubkey: (id: string) => apiFetch<{ status: string }>(`${A}/nodes/${id}/reset-pubkey`, { method: 'POST' }),
    },

    releases: {
      list: () => apiFetch<{ releases: ReleaseItem[] }>(`${A}/releases`),
      upload: (form: FormData) => apiFetch<ReleaseItem>(`${A}/releases`, { method: 'POST', body: form as unknown }),
      remove: (version: string, os = 'linux', arch = 'amd64') =>
        apiFetch<{ status: string }>(`${A}/releases/${version}`, { method: 'DELETE', query: { os, arch } }),
    },

    bot: {
      settings: () => apiFetch<{ settings: BotSettingItem[] }>(`${A}/bot/settings`),
      setSetting: (key: string, value: string) => apiFetch<{ status: string }>(`${A}/bot/settings`, { method: 'PUT', body: { key, value } }),
      resetToken: () => apiFetch<{ status: string, new_token: string }>(`${A}/bot/token/reset`, { method: 'POST' }),
      stats: () => apiFetch<BotStats>(`${A}/bot/stats`),
      commands: (page = 1) => apiFetch<{ commands: BotCommandEntry[], total: number, page: number, per_page: number }>(`${A}/bot/commands`, { query: { page } }),
      blocked: () => apiFetch<{ blocked_users: BotBlockedUser[] }>(`${A}/bot/blocked`),
      block: (body: { tg_user_id: number, username?: string, reason?: string }) => apiFetch<{ status: string }>(`${A}/bot/blocked`, { method: 'POST', body }),
      unblock: (id: number | string) => apiFetch<{ status: string }>(`${A}/bot/blocked/${id}`, { method: 'DELETE' }),
    },

    settings: {
      list: () => apiFetch<{ settings: SiteSettingItem[] }>(`${A}/settings`),
      set: (key: string, value: string) => apiFetch<{ status: string }>(`${A}/settings`, { method: 'PUT', body: { key, value } }),
    },

    notifications: {
      list: () => apiFetch<{ settings: NotificationSettingItem[] }>(`${A}/notifications`),
      set: (key: string, body: { value?: string | null, threshold_value?: string | null }) =>
        apiFetch<{ status: string }>(`${A}/notifications`, { method: 'PUT', body: { key, ...body } }),
      testEmail: (to: string, message?: string) => apiFetch<{ status: string, message: string }>(`${A}/test/email`, { method: 'POST', body: { to, message } }),
    },

    audit: (query: { action?: string, operator?: string, page?: number, per_page?: number } = {}) =>
      apiFetch<AuditPage>(`${A}/audit`, { query }),

    devices: {
      list: () => apiFetch<AuthSession[]>(`${A}/auth/devices`),
      revoke: (id: string) => apiFetch<{ ok: boolean }>(`${A}/auth/devices/${id}`, { method: 'DELETE' }),
      loginAs: (asn: number, persist = false) => apiFetch<AuthResponse>(`${A}/auth/login-as`, { method: 'POST', body: { asn, persist } }),
    },

    mcpKeys: {
      list: () => apiFetch<AdminMcpKey[]>(`${A}/mcp-keys`),
      create: (body: { name: string, expires_at?: string | null, capabilities?: string[] }) =>
        apiFetch<AdminMcpKey>(`${A}/mcp-keys`, { method: 'POST', body }),
      remove: (id: string) => apiFetch<{ message: string }>(`${A}/mcp-keys/${id}`, { method: 'DELETE' }),
      userKeys: (asn?: number) => apiFetch<McpKey[]>(`${A}/user-mcp-keys`, { query: asn ? { asn } : {} }),
      forceRemoveUserKey: (id: string) => apiFetch<{ message: string }>(`${A}/user-mcp-keys/${id}`, { method: 'DELETE' }),
      auditLogs: (query: { asn?: number, tool?: string, page?: number, per_page?: number } = {}) =>
        apiFetch<{ logs: McpAuditLogEntry[], page: number, per_page: number }>(`${A}/mcp-audit-logs`, { query }),
    },

    system: {
      status: () => apiFetch<SystemStatus>(`${A}/system-status`),
      dbTables: (days = 30) => apiFetch<DBTablesResponse>(`${A}/system-status/db-tables`, { query: { days } }),
      rotateTables: (tables: string[], days: number) =>
        apiFetch<{ results: Record<string, { deleted_count?: number, dropped_chunks?: number, error?: string }> }>(
          `${A}/system-status/rotate-tables`, { method: 'POST', body: { tables, days } }),
    },

    queue: {
      overview: () => apiFetch<QueueOverview>(`${A}/queue/overview`),
      queues: () => apiFetch<QueueSnapshot[]>(`${A}/queue/queues`),
      queue: (name: string, days = 30) => apiFetch<{ queue: QueueSnapshot, history: { queue: string, processed: number, failed: number, date: string }[] | null }>(`${A}/queue/queues/${name}`, { query: { days } }),
      tasks: (name: string, state: TaskState = 'pending', page = 1, size = 20) =>
        apiFetch<TaskListSnapshot>(`${A}/queue/queues/${name}/tasks`, { query: { state, page, size } }),
      task: (name: string, taskID: string) => apiFetch<TaskSnapshot>(`${A}/queue/queues/${name}/tasks/${taskID}`),
      servers: () => apiFetch<ServerSnapshot[]>(`${A}/queue/servers`),
      scheduler: () => apiFetch<SchedulerEntrySnapshot[]>(`${A}/queue/scheduler`),
      // Paginated enqueue events for one scheduler entry; returns a bare array.
      schedulerEvents: (entryID: string, page = 1, size = 20) =>
        apiFetch<EnqueueEventSnapshot[]>(`${A}/queue/scheduler/${entryID}/events`, { query: { page, size } }),
      deleteTask: (name: string, taskID: string) => apiFetch<{ status: string }>(`${A}/queue/queues/${name}/tasks/${taskID}`, { method: 'DELETE' }),
      runTask: (name: string, taskID: string) => apiFetch<{ status: string }>(`${A}/queue/queues/${name}/tasks/${taskID}:run`, { method: 'POST' }),
      archiveTask: (name: string, taskID: string) => apiFetch<{ status: string }>(`${A}/queue/queues/${name}/tasks/${taskID}:archive`, { method: 'POST' }),
      deleteAll: (name: string, state: TaskState = 'pending') => apiFetch<{ status: string }>(`${A}/queue/queues/${name}/tasks:delete_all`, { method: 'DELETE', query: { state } }),
      pause: (name: string) => apiFetch<{ status: string }>(`${A}/queue/queues/${name}:pause`, { method: 'POST' }),
      resume: (name: string) => apiFetch<{ status: string }>(`${A}/queue/queues/${name}:resume`, { method: 'POST' }),
      cancelActive: (taskID: string) => apiFetch<{ status: string }>(`${A}/queue/active-tasks/${taskID}:cancel`, { method: 'POST' }),
    },
  }

  const assistant = {
    auth: () => apiFetch<AssistantAuth>('/api/v1/user/assistant/auth'),
    approve: (tool_name: AssistantTool, args: unknown, conversation_id: string) =>
      apiFetch<AssistantApprovalResponse>('/api/v1/user/assistant/tools/approval', { method: 'POST', body: { tool_name, arguments: args, conversation_id } }),
    call: (tool_name: AssistantTool, args: unknown, conversation_id: string, approval_token: string) =>
      apiFetch<AssistantToolCallResponse>('/api/v1/user/assistant/tools/call', { method: 'POST', body: { tool_name, arguments: args, conversation_id, approval_token } }),
  }

  return { apiFetch, refreshOnce, nodes, stats, peers, account, telegram, lookingGlass, mcp, passkeys, registry, admin, assistant }
}
