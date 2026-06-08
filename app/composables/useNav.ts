export interface NavItem {
  icon: string
  label: string // i18n key
  to: string
}
export interface NavGroup {
  label: string | null // i18n key or null
  items: NavItem[]
}

/** Navigation model — guest vs authenticated. Atlas is intentionally absent
 *  (the OSS backend ships without the Atlas subsystem). */
export function useNav() {
  const { isAuthenticated, isAdmin } = useAuth()

  const groups = computed<NavGroup[]>(() => {
    if (!isAuthenticated.value) {
      return [
        {
          label: null,
          items: [
            { icon: 'home', label: 'nav.home', to: '/' },
            { icon: 'login', label: 'nav.signIn', to: '/login' },
          ],
        },
      ]
    }
    const base: NavGroup[] = [
      {
        label: 'nav.sections.peering',
        items: [
          { icon: 'swap_horiz', label: 'nav.myPeers', to: '/peers' },
          { icon: 'add_circle', label: 'nav.newPeering', to: '/peers/new' },
          { icon: 'travel_explore', label: 'nav.lookingGlass', to: '/looking-glass' },
        ],
      },
      {
        label: 'nav.sections.account',
        items: [
          { icon: 'shield', label: 'nav.security', to: '/account/security' },
          { icon: 'notifications', label: 'nav.notifications', to: '/account/notifications' },
          { icon: 'receipt_long', label: 'nav.auditLog', to: '/account/audit' },
          { icon: 'vpn_key', label: 'nav.mcpKeys', to: '/account/mcp-keys' },
          { icon: 'smart_toy', label: 'nav.assistant', to: '/account/assistant' },
        ],
      },
    ]
    if (!isAdmin.value) return base
    // Admins get a dedicated, admin-only navigation. We intentionally do NOT
    // merge the user groups (My Peers / New Peering / Looking Glass / Security /
    // Notifications / Audit / MCP Keys) — those rely on a populated user context
    // that admins don't have, so they would render empty/broken.
    return [
      {
        label: 'nav.sections.admin',
        items: [
          { icon: 'dashboard', label: 'nav.admin.overview', to: '/admin' },
          { icon: 'swap_horiz', label: 'nav.admin.peers', to: '/admin/peers' },
          { icon: 'dns', label: 'nav.admin.nodes', to: '/admin/nodes' },
          { icon: 'deployed_code', label: 'nav.admin.releases', to: '/admin/releases' },
          { icon: 'notifications', label: 'admin.notifications.title', to: '/admin/notifications' },
          { icon: 'receipt_long', label: 'nav.admin.audit', to: '/admin/audit' },
        ],
      },
      {
        label: 'nav.sections.adminSystem',
        items: [
          { icon: 'smart_toy', label: 'nav.admin.bot', to: '/admin/bot' },
          { icon: 'tune', label: 'nav.admin.settings', to: '/admin/settings' },
          { icon: 'devices', label: 'nav.admin.devices', to: '/admin/devices' },
          { icon: 'key', label: 'nav.admin.mcpKeys', to: '/admin/mcp-keys' },
          { icon: 'monitor_heart', label: 'nav.admin.system', to: '/admin/system' },
          { icon: 'lists', label: 'nav.admin.queue', to: '/admin/queue' },
        ],
      },
    ]
  })

  const route = useRoute()
  function isActive(to: string): boolean {
    if (to === '/peers') {
      return route.path === '/peers' || (route.path.startsWith('/peers/') && route.path !== '/peers/new')
    }
    if (to === '/' || to === '/admin') return route.path === to
    return route.path === to || route.path.startsWith(`${to}/`)
  }

  return { groups, isActive }
}
