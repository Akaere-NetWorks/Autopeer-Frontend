/**
 * Route guard: require an authenticated admin.
 *
 * Auth state comes from useAuth(), whose useState initializer synchronously
 * decodes the `token` cookie on both server and client, so this guard works
 * during SSR (no client flash) and after hydration without an awaited init.
 *
 * Unauthenticated users are bounced to /login with a redirect back to the
 * guarded path (mirroring the auth middleware). Note: unlike the closed app
 * there is no dedicated /admin/login — admin sign-in is the admin step of the
 * single consolidated /login page, so /login is the correct target here.
 *
 * Authenticated non-admins are sent to /peers, matching guest.ts which lands
 * non-admin users on /peers (admins on /admin).
 */
export default defineNuxtRouteMiddleware((to) => {
  const { isAuthenticated, isAdmin } = useAuth()
  if (!isAuthenticated.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
  if (!isAdmin.value) {
    return navigateTo('/peers')
  }
})
