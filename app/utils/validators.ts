/**
 * Client-side validators that MIRROR the backend (center) exactly, so we avoid
 * 4xx round-trips. See center docs/api/peers.md (createPeerReq).
 */

/** WireGuard public key: Base64 `^[A-Za-z0-9+/]+=*$`, at least 40 chars. */
export function isValidPubkey(v: string): boolean {
  const s = v.trim()
  return s.length >= 40 && /^[A-Za-z0-9+/]+=*$/.test(s)
}

/** Endpoint: `IP:Port` or `[IPv6]:Port`; host may be IP or hostname, port 1–65535. */
export function isValidEndpoint(v: string): boolean {
  const s = v.trim()
  if (!s) return false
  let host: string
  let portStr: string
  if (s.startsWith('[')) {
    const close = s.indexOf(']')
    if (close < 0 || s[close + 1] !== ':') return false
    host = s.slice(1, close)
    portStr = s.slice(close + 2)
  } else {
    const idx = s.lastIndexOf(':')
    if (idx < 0) return false
    host = s.slice(0, idx)
    portStr = s.slice(idx + 1)
  }
  if (!host) return false
  const port = Number(portStr)
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

/** Link-local address: must parse as IPv6 in fe80::/10. */
export function isValidLLA(v: string): boolean {
  const s = v.trim().toLowerCase()
  if (!s.includes(':')) return false
  // Rough IPv6 shape check, then the fe80::/10 prefix (fe80–febf).
  if (!/^[0-9a-f:]+$/.test(s.replace(/%.+$/, ''))) return false
  const head = s.split(':')[0] || ''
  if (head.length < 2) return false
  const first16 = parseInt(head.padEnd(4, '0').slice(0, 4), 16)
  if (Number.isNaN(first16)) return false
  return (first16 & 0xffc0) === 0xfe80
}

/** Optional MTU: empty is allowed; otherwise an integer 576–9000. */
export function isValidMtu(v: string): boolean {
  const s = v.trim()
  if (!s) return true
  const n = Number(s)
  return Number.isInteger(n) && n >= 576 && n <= 9000
}
