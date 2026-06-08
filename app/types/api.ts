// Typed shapes for the autopeer-center HTTP API (OSS surface — no Atlas).
// Field names mirror the backend JSON exactly. See center docs/api/*.

export type PeerStatus = 'pending' | 'active' | 'suspended' | 'rejected'

export interface PublicNode {
  id: string
  name: string
  location: string
  public_ip: string
  our_asn: number
  our_lla: string
  our_wg_pubkey: string
  online: boolean
  enabled: boolean
  wg_port_prefix: number
}

export interface NodeStat {
  node_id: string
  name: string
  peers_active: number
  avg_rtt_ms: number
  rx_bytes_24h: number
  tx_bytes_24h: number
}

export interface PublicStats {
  nodes_online: number
  peers_active: number
  total_rx_bytes: number
  total_tx_bytes: number
  avg_rtt_ms: number
  nodes: NodeStat[]
}

export interface Peer {
  id: string
  node_id: string
  remote_asn: number
  remote_pubkey: string
  remote_endpoint: string
  remote_lla: string
  contact_email: string
  wg_listen_port: number
  wg_interface_name: string
  wg_managed: boolean
  status: PeerStatus
  reject_reason?: string | null
  endpoint_mismatch_since?: string | null
  bgp_suspended_by_endpoint?: boolean
  created_at: string
  updated_at: string
  node_name: string
  node_location: string
  node_public_ip?: string
  node_our_lla?: string
  node_our_wg_pubkey?: string
  mtu?: number | null
  wg_preshared_key?: string | null
}

export interface PeerSummaryItem {
  peer_id: string
  latest_rtt: number | null
  latest_bgp_state: string | null
  latest_handshake: string | null
  latest_bgp_uptime_secs: number | null
}

export interface PeerMetricPoint {
  time: string
  rx_bytes: number
  tx_bytes: number
  rtt_ms: number | null
  bgp_state: string | null
  last_handshake: string | null
}

export interface PeerMetrics {
  peer_id: string
  latest_rtt: number | null
  latest_bgp_state: string | null
  latest_handshake: string | null
  latest_wg_actual_endpoint: string | null
  points: PeerMetricPoint[]
}

export interface CreatePeerReq {
  node_id: string
  remote_pubkey: string
  remote_endpoint: string
  remote_lla: string
  mtu?: number | null
  enable_psk?: boolean
}

export interface CreatePeerResp {
  id: string
  status: PeerStatus
  wg_listen_port: number
  wg_interface_name: string
  mtu?: number | null
  wg_preshared_key?: string | null
}

export interface UpdatePeerReq {
  remote_pubkey?: string | null
  remote_endpoint?: string | null
  remote_lla?: string | null
  mtu?: number | null
}

export interface AuthSession {
  id: string
  subject_type?: 'user' | 'admin' | 'impersonation'
  asn?: number
  admin_id?: string
  email?: string
  parent_session_id?: string
  user_agent?: string
  ip_address?: string
  device_name?: string
  login_method?: 'email' | 'gpg' | 'passkey' | 'password' | 'device_cli' | 'impersonation'
  created_at: string
  last_used_at?: string
  expires_at: string
  revoked_at?: string
  revoked_reason?: string
}

export interface AuthUser {
  role: 'user' | 'admin'
  asn?: number
  email?: string
}

export interface AuthResponse {
  token: string
  access_token: string
  expires_in: number
  refresh_expires_in?: number
  asn?: number
  session?: AuthSession
  user?: AuthUser
}

export interface AuditLog {
  id: string
  action: string
  operator: string
  target_id?: string | null
  detail?: Record<string, unknown> | null
  created_at: string
}

export interface AuditPage {
  logs: AuditLog[]
  total: number
  page: number
  per_page: number
}

export interface EmailLevel {
  level: number
  name: string
  description: string
}

export interface EmailPreferences {
  email_level: number
  levels: EmailLevel[]
}

export interface NotificationOption {
  key: string
  channel: string
  group: string
  name: string
  description: string
  legacy_level: number
  introduced_version: number
  kind: 'normal' | 'critical' | 'required'
  requires_disable_confirmation: boolean
  enabled: boolean
  is_new?: boolean
}

export interface NotificationPreset {
  level: number
  name: string
  description: string
  enabled_keys: string[]
}

export interface NotificationPreferences {
  mode: 'legacy' | 'explicit'
  email_level: number
  seen_catalog_version: number
  current_catalog_version: number
  needs_wizard: boolean
  has_unseen_options: boolean
  options: NotificationOption[]
  presets: NotificationPreset[]
}

export interface TelegramBinding {
  bound: boolean
  tg_username?: string
  bound_at?: string
  bound_via?: string
  bot_username?: string
}

export interface TelegramNotificationPrefs {
  bound: boolean
  channel: string
  options?: NotificationOption[]
  presets?: NotificationPreset[]
}

export interface McpKey {
  id: string
  asn: number
  name: string
  key?: string // present only on creation
  key_prefix: string
  capabilities: string[]
  expires_at?: string | null
  last_used_at?: string | null
  revoked_at?: string | null
  scope_version?: number
  created_at: string
}

export interface LookingGlassResult {
  type: string
  node_id: string
  node_name: string
  target: string
  result: Record<string, unknown> & { output?: string }
}

export interface TurnstileConfig {
  enabled: boolean
  site_key: string
}

/** A registered passkey/WebAuthn credential (GET /api/v1/user/passkeys). */
export interface PasskeyInfo {
  id: string
  name: string
  aaguid: string
  created_at: string
  last_used_at?: string
}

/** DN42 registry ASN contact lookup (GET /api/v1/registry/asn/{asn}). */
export interface RegistryAsnLookup {
  asn: number
  masked_email: string
  /** Unmasked email — present only for admin callers. */
  email?: string
}

/** One MCP audit entry (shared shape for user + admin MCP audit logs). */
export interface McpAuditLog {
  id: string
  session_id?: string | null
  asn?: number | null
  admin_id?: string | null
  tool_name: string
  args?: unknown
  result_ok: boolean
  error_msg?: string | null
  called_at: string
}

export type LookingGlassType = 'ping' | 'traceroute' | 'mtr' | 'bgp_route'
