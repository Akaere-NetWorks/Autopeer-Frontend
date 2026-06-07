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
  const { isAuthenticated } = useAuth()

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
    return [
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
        ],
      },
    ]
  })

  const route = useRoute()
  function isActive(to: string): boolean {
    if (to === '/peers') {
      return route.path === '/peers' || (route.path.startsWith('/peers/') && route.path !== '/peers/new')
    }
    if (to === '/') return route.path === '/'
    return route.path === to || route.path.startsWith(`${to}/`)
  }

  return { groups, isActive }
}
