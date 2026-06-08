/**
 * Returns `value` only if it is a safe SAME-ORIGIN absolute path, otherwise `fallback`.
 *
 * Guards against open-redirect: a single leading slash NOT followed by another
 * slash or a backslash. This rejects protocol-relative (`//evil.com`), backslash
 * tricks the browser/ufo treat as external (`/\evil.com`, decoded from `/%5Cevil.com`),
 * `javascript:` and any non-string. Bare `/` is rejected too (falls back), which is
 * fine since the caller's fallback is the real landing route.
 */
export function safeInternalRedirect(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^\/[^/\\]/.test(value) ? value : fallback
}
