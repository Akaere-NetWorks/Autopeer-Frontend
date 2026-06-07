export interface JwtPayload {
  sub?: string
  role?: 'user' | 'admin'
  asn?: number
  email?: string
  login_method?: string
  exp?: number
  [key: string]: unknown
}

/** Decode a JWT payload without verifying the signature (display/routing only). */
export function decodeJwt(token: string | null | undefined): JwtPayload | null {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(b64)
    // Decode UTF-8 (handles non-ASCII emails) from the binary string.
    const json = decodeURIComponent(
      Array.prototype.map
        .call(binary, (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    )
    return JSON.parse(json) as JwtPayload
  } catch {
    return null
  }
}

export function isTokenExpiringSoon(payload: JwtPayload | null, skewSeconds = 90): boolean {
  if (!payload?.exp) return false
  return payload.exp * 1000 - Date.now() < skewSeconds * 1000
}
