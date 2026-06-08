// Typed shapes for the autopeer-center ADMIN HTTP API (OSS surface — no Atlas).
// Field names mirror the backend JSON exactly. See center cmd/center/routes.go
// and internal/handler/admin_*.go. Sourced from the live handler response structs.

import type { PeerStatus } from '~/types/api'

// ── Dashboard / stats ─────────────────────────────────────────────────────────
export interface AdminStats {
  peers_active: number
  peers_pending: number
  peers_suspended: number
  peers_rejected: number
  nodes_online: number
  nodes_total: number
  new_today: number
}

// ── Peers ───────────────────────────────────────────────────────────────────
export interface AdminPeerListItem {
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
  reject_reason?: string
  created_at: string
  updated_at: string
  node_name: string
  node_location: string
  mtu?: number
  latest_rtt?: number
  latest_bgp_state?: string
  rx_bytes_24h: number
  tx_bytes_24h: number
  endpoint_mismatch_since?: string
  bgp_suspended_by_endpoint?: boolean
}

export interface AdminPeerListResponse {
  peers: AdminPeerListItem[]
  total: number
  page: number
  per_page: number
}

export interface AdminPeerDetail {
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
  reject_reason: string | null
  endpoint_mismatch_since: string | null
  bgp_suspended_by_endpoint?: boolean
  created_at: string
  updated_at: string
  node_name: string
  node_location: string
  node_public_ip: string
  node_our_lla: string
  node_our_wg_pubkey: string
  mtu: number | null
  bgp_proto_name: string
  bird_config_filename: string
}

export interface PeerAgentSync {
  desired_state: string
  configuration_status: string
  agent_online: boolean
  node_agent_state?: string
  node_agent_version?: string
  node_agent_state_changed_at?: string
  checked_at: string
}

export interface PeerHistoryItem {
  id: string
  action: string
  operator: string
  detail?: unknown
  created_at: string
}

export interface AdminPeerGetResponse {
  peer: AdminPeerDetail
  metrics: {
    latest_rtt: number | null
    latest_bgp_state: string | null
    latest_handshake: string | null
    latest_bgp_uptime_secs: number | null
    latest_wg_actual_endpoint: string | null
  }
  agent_sync: PeerAgentSync
  history: PeerHistoryItem[]
}

export interface AdminUpdatePeerReq {
  remote_pubkey?: string
  remote_endpoint?: string
  remote_lla?: string
  mtu?: number | null
}

// ── Nodes ─────────────────────────────────────────────────────────────────────
export interface AdminNode {
  id: string
  name: string
  location: string
  public_ip: string
  our_asn: number
  our_lla: string
  our_wg_pubkey: string
  bird_peer_dir: string
  wg_dir: string
  wg_port_prefix: number
  online: boolean
  enabled: boolean
  agent_version: string
  agent_state: string
  created_at: string
  auth_mode: string
  active_peers: number
  avg_rtt_ms?: number
  last_seen?: string
  total_rx_mb?: number
  total_tx_mb?: number
  mem_alloc_mb?: number
  mem_sys_mb?: number
  num_goroutine?: number
  uptime_secs?: number
}

export interface CreateNodeReq {
  name: string
  location: string
  public_ip: string
  our_lla: string
  our_wg_pubkey: string
  our_asn?: number
  bird_peer_dir?: string
  wg_dir?: string
  wg_port_prefix?: number
}

export interface CreateNodeResp {
  id: string
  agent_token: string
  message: string
}

export interface UpdateNodeReq {
  name?: string
  location?: string
  public_ip?: string
  our_lla?: string
  our_wg_pubkey?: string
  enabled?: boolean
}

export interface UpdateAgentReq {
  version: string
  os?: string
  arch?: string
}

// ── Releases ──────────────────────────────────────────────────────────────────
export interface ReleaseItem {
  version: string
  os: string
  arch: string
  sha256: string
  size: number
  uploaded_by: string
  uploaded_at: string
}

// ── Bot ───────────────────────────────────────────────────────────────────────
export interface BotSettingItem {
  key: string
  value: string
  description: string
}

export interface BotStats {
  total_commands: number
  unique_users: number
  last_command_at: string | null
  command_breakdown: { command: string, count: number }[]
  bot_connected: boolean
}

export interface BotCommandEntry {
  id: string
  command: string
  tg_user_id: number
  username: string
  chat_id: number
  created_at: string
}

export interface BotBlockedUser {
  id: number
  tg_user_id: number
  username: string
  reason: string
  blocked_by: string
  blocked_at: string
}

// ── Site / notification settings ────────────────────────────────────────────
export interface SiteSettingItem {
  key: string
  value: string
  description: string
}

export interface NotificationSettingItem {
  key: string
  value: string
  threshold_value: string
  description: string
}

// ── Admin MCP keys ───────────────────────────────────────────────────────────
export interface AdminMcpKey {
  id: string
  admin_id: string
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

export interface McpAuditLogEntry {
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

// ── System status ────────────────────────────────────────────────────────────
export interface SystemStatus {
  build: { commit_hash: string, build_date: string, version: string, go_version: string }
  process: {
    started_at: string
    uptime_secs: number
    listen_addr: string
    external_url: string
    center_public_key: string
  }
  database: {
    ping_ms: number
    open_conns: number
    in_use: number
    idle: number
    max_open_conns: number
    wait_count: number
    wait_duration_ms: number
    migrations: { version: string, applied_at: string }[] | null
    migration_count: number
  }
  hub: {
    connected_agents: number
    pending_auth_count: number
    bot_connected: boolean
    bot_count: number
    pending_commands: Record<string, number>
  }
  redis: { enabled: boolean, available: boolean, last_error: string, key_prefix: string, required: boolean, configured: boolean }
  queue: {
    enabled: boolean
    available: boolean
    backend: string
    concurrency: number
    queues: Record<string, number>
    backoff_until: string | null
  }
  email: { backend: string, configured: boolean, host?: string, from?: string, tls?: string }
  lock: { enabled: boolean, available: boolean, backend: string }
  cache: {
    backend: string
    redis_available: boolean
    redis_last_error: string
    fallback_enabled: boolean
    file_size_bytes: number
    buckets: Record<string, number>
  }
  alerts: {
    bgp_down: number
    bgp_fail: number
    handshake_stale: number
    node_offline: number
    latency_high: number
    latency_active: number
  }
  request_log: {
    last_5min_count: number
    last_hour_count: number
    error_rate_5xx: number
    p95_duration_ms: number
  }
}

export interface DBTablesResponse {
  days: number
  request_logs: { total_size_bytes: number, row_estimate: number, pending_count: number }
  peer_metrics: {
    total_size_bytes: number
    row_estimate: number
    pending_count: number
    total_chunks: number
    number_compressed_chunks: number
    before_compression_bytes: number
    after_compression_bytes: number
  }
  node_metrics: { total_size_bytes: number, row_estimate: number, pending_count: number }
}

// ── Queue monitor ────────────────────────────────────────────────────────────
export interface QueueSnapshot {
  name: string
  paused: boolean
  size: number
  pending: number
  active: number
  scheduled: number
  retry: number
  archived: number
  completed: number
  processed: number
  failed: number
  processed_total: number
  failed_total: number
  latency_ms: number
  memory_usage_bytes: number
}

export interface TaskSnapshot {
  id: string
  type: string
  payload: string
  state: string
  queue: string
  retry_count: number
  max_retry: number
  last_failed_at?: string
  last_error?: string
  next_process_at?: string
  completed_at?: string
  result?: string
  timeout_seconds: number
  deadline?: string
}

export interface TaskListSnapshot {
  tasks: TaskSnapshot[]
  total_count: number
  page: number
  size: number
}

export interface ServerSnapshot {
  id: string
  host: string
  pid: number
  concurrency: number
  queues: Record<string, number>
  strict_priority: boolean
  started_at: string
  active_workers: { task_id: string, task_type: string, task_payload: string, queue: string, started_at: string, deadline: string }[] | null
  status: string
}

export interface SchedulerEntrySnapshot {
  id: string
  spec: string
  task_type: string
  task_payload: string
  next: string
  prev: string
}

/** One enqueue event for a scheduler entry (GET .../scheduler/{id}/events). */
export interface EnqueueEventSnapshot {
  task_id: string
  enqueued_at: string
}

/** A single entry inside a peers export/import dump (admin peers import/export). */
export interface PeerExportEntry {
  node_id: string
  node_name?: string
  remote_asn: number
  remote_pubkey: string
  remote_endpoint: string
  remote_lla: string
  contact_email: string
  wg_listen_port: number
  wg_interface_name: string
  bgp_proto_name?: string
  bird_config_filename?: string
  wg_managed: boolean
  mtu?: number | null
  wg_preshared_key?: string | null
  status: string
}

/** Export wrapper produced by GET /api/v1/admin/peers/export. */
export interface PeersExport {
  version: number
  exported_at: string
  peers: PeerExportEntry[]
}

/** Result of POST /api/v1/admin/peers/import. */
export interface PeersImportResult {
  status: string
  imported: number
  overwritten: number
  skipped: number
  total: number
  errors: { node_id: string, asn: number, reason: string }[]
}

export interface QueueOverview {
  enabled: boolean
  available: boolean
  queues: QueueSnapshot[]
  servers?: ServerSnapshot[]
  scheduler_entries?: SchedulerEntrySnapshot[]
}

export type TaskState = 'pending' | 'active' | 'scheduled' | 'retry' | 'archived' | 'completed'

// ── AI assistant ─────────────────────────────────────────────────────────────
export interface AssistantAuth {
  ok: boolean
  role: string
  asn: number
  session_id: string
}

export type AssistantTool =
  | 'nodes_list' | 'peer_creation_status' | 'peer_list' | 'peer_summary' | 'peer_get' | 'peer_get_metrics'

export interface AssistantApprovalResponse {
  approval_token: string
  expires_at: number
}

export interface AssistantToolCallResponse {
  tool_name: string
  conversation_id: string
  result: unknown
}
