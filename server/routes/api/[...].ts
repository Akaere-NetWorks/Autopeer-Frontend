/**
 * Same-origin API proxy.
 *
 * Forwards every `/api/**` request to `${API_BASE}/api/**`, preserving method,
 * query, body, and the auth-relevant headers (Authorization, Content-Type,
 * Autopeer-Version, Cookie). The backend base URL stays server-side only, so the
 * browser never learns it and there is no CORS. Set-Cookie from the backend
 * (the `refresh_token` cookie) is rewritten to bind to this origin.
 *
 * This handles the JSON REST surface used by the web UI. The MCP SSE transport
 * is intentionally not used from the browser (it is for AI clients), so no
 * streaming is required here.
 */

// Request headers we forward upstream (allow-list; everything else is dropped).
const FORWARD_REQ_HEADERS = ['authorization', 'content-type', 'autopeer-version', 'cookie', 'accept']

// Response headers we must NOT copy verbatim (fetch already decoded the body).
const SKIP_RES_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'set-cookie',
])

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  // Resolve the backend base at RUNTIME. `runtimeConfig.apiBase` is frozen at
  // BUILD time; Nuxt only re-applies the `NUXT_`-prefixed override at runtime —
  // so a plain `API_BASE` set on the host (Netlify env, Docker, shell) would be
  // ignored. Read process.env directly (available on Node/Netlify-function/Vercel
  // presets) so the documented `API_BASE` works at runtime, falling back to
  // NUXT_API_BASE and then the build-time runtimeConfig value.
  const base = (process.env.API_BASE || process.env.NUXT_API_BASE || (config.apiBase as string) || '').replace(/\/+$/, '')
  if (!base) {
    setResponseStatus(event, 500)
    setResponseHeader(event, 'content-type', 'application/json')
    return JSON.stringify({
      error: 'misconfigured',
      message: 'API_BASE is not set. Configure the autopeer-center base URL on the frontend host.',
    })
  }
  const target = base + event.path // event.path includes the /api/v1/... path + query string

  const incoming = getRequestHeaders(event)
  const headers = new Headers()
  for (const name of FORWARD_REQ_HEADERS) {
    const v = incoming[name]
    if (v) headers.set(name, v)
  }

  // Tell the backend the real client IP + scheme so rate-limiting, Turnstile
  // remoteip, and the Secure-cookie decision all behave correctly.
  const proto = getRequestProtocol(event)
  headers.set('X-Forwarded-Proto', proto)
  const ip = getRequestIP(event, { xForwardedFor: true })
  if (ip) {
    headers.set('X-Forwarded-For', ip)
    headers.set('X-Real-IP', ip)
  }

  let body: Uint8Array | undefined
  const method = event.method
  if (method !== 'GET' && method !== 'HEAD') {
    const raw = await readRawBody(event, false) as Buffer | undefined
    if (raw && raw.length) body = new Uint8Array(raw)
  }

  let upstream: Response
  try {
    upstream = await fetch(target, { method, headers, body: body as RequestInit['body'], redirect: 'manual' })
  } catch (err) {
    // Log the real cause server-side (DNS, TLS, connection refused, …) — the
    // opaque client message stays generic, but operators get a diagnosable line.
    const e = err as { message?: string, cause?: { code?: string, message?: string } }
    console.error(`[api-proxy] upstream fetch failed: ${method} ${target} — ${e?.cause?.code || e?.cause?.message || e?.message || err}`)
    setResponseStatus(event, 502)
    setResponseHeader(event, 'content-type', 'application/json')
    return JSON.stringify({
      error: 'bad_gateway',
      message: 'The frontend could not reach the AutoPeer backend.',
    })
  }

  setResponseStatus(event, upstream.status)

  upstream.headers.forEach((value, key) => {
    if (SKIP_RES_HEADERS.has(key.toLowerCase())) return
    setResponseHeader(event, key, value)
  })

  // Rewrite Set-Cookie so the refresh cookie binds to THIS origin: strip any
  // upstream Domain attribute (→ host-only) and drop Secure when we are serving
  // over plain HTTP (local dev) so the browser will actually store it.
  const setCookies = typeof upstream.headers.getSetCookie === 'function'
    ? upstream.headers.getSetCookie()
    : []
  if (setCookies.length) {
    const stripSecure = proto !== 'https'
    const rewritten = setCookies.map((c) => {
      let out = c.replace(/;\s*Domain=[^;]+/gi, '')
      if (stripSecure) out = out.replace(/;\s*Secure/gi, '')
      return out
    })
    setResponseHeader(event, 'set-cookie', rewritten)
  }

  const buf = Buffer.from(await upstream.arrayBuffer())
  return buf
})
