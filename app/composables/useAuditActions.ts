/**
 * Shared mapping of audit action codes to localized labels and status tones,
 * used by both the user (account/audit) and admin (admin/audit) audit pages.
 */
export function useAuditActions() {
  const { t } = useI18n()

  const LABELS: Record<string, string> = {
    'user.login': 'userAudit.actionLogin',
    'user.login_gpg': 'userAudit.actionLoginGpg',
    'admin.login_as': 'userAudit.actionAdminLoginAs',
    'peer.create': 'userAudit.actionPeerCreate',
    'peer.approve': 'userAudit.actionPeerApprove',
    'peer.approve.diverged': 'userAudit.actionPeerApproveDiverged',
    'peer.reject': 'userAudit.actionPeerReject',
    'peer.suspend': 'userAudit.actionPeerSuspend',
    'peer.unsuspend': 'userAudit.actionPeerUnsuspend',
    'peer.update': 'userAudit.actionPeerUpdate',
    'peer.user_update': 'userAudit.actionPeerUpdate',
    'peer.email_updated': 'userAudit.actionEmailUpdate',
    'peer.delete': 'userAudit.actionPeerDelete',
    'peer.admin_delete': 'userAudit.actionPeerAdminDelete',
    'peer.import_peer': 'userAudit.actionPeerImport',
  }

  /** Title-cased fallback for unmapped codes, e.g. "node.update" → "Node Update". */
  function pretty(action: string): string {
    return action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  function label(action: string): string {
    const key = LABELS[action]
    return key ? t(key) : pretty(action)
  }

  function kind(action: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
    if (action.includes('delete') || action.includes('reject') || action.includes('suspend')) return 'error'
    if (action.includes('approve') || action.includes('create') || action.includes('unsuspend')) return 'success'
    if (action.includes('login')) return 'info'
    return 'neutral'
  }

  return { label, kind }
}
