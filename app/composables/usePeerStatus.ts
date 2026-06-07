import type { PeerStatus } from '~/types/api'

export interface PeerStatusMeta {
  kind: 'success' | 'warning' | 'error' | 'neutral' | 'info'
  icon: string
  label: string
}

/** Maps a peer status to its MD3 badge kind, icon, and localized label. */
export function usePeerStatus() {
  const { t, te } = useI18n()
  const base: Record<string, { kind: PeerStatusMeta['kind'], icon: string }> = {
    active: { kind: 'success', icon: 'check_circle' },
    pending: { kind: 'info', icon: 'hourglass_top' },
    suspended: { kind: 'neutral', icon: 'pause_circle' },
    rejected: { kind: 'error', icon: 'cancel' },
  }
  function meta(status: PeerStatus | string): PeerStatusMeta {
    const m = base[status] || { kind: 'neutral' as const, icon: 'help' }
    const key = `peers.status.${status}`
    return { ...m, label: te(key) ? t(key) : String(status) }
  }
  return { meta }
}
