/** Route guard: require an authenticated admin. Non-admins are bounced to /peers,
 *  unauthenticated users to /login (mirroring the auth middleware). */
export default defineNuxtRouteMiddleware((to) => {
  const { isAuthenticated, isAdmin } = useAuth()
  if (!isAuthenticated.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
  if (!isAdmin.value) {
    return navigateTo('/peers')
  }
})
