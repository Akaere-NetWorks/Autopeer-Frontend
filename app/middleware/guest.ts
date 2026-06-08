import { safeInternalRedirect } from '~/utils/redirect'

/** Route guard: redirect already-authenticated users away from guest pages. */
export default defineNuxtRouteMiddleware((to) => {
  const { isAuthenticated, isAdmin } = useAuth()
  if (!isAuthenticated.value) return

  // Default landing depends on role; admins land on the admin area.
  const fallback = isAdmin.value ? '/admin' : '/peers'

  // Only honor an explicit same-origin path; safeInternalRedirect rejects
  // protocol-relative ('//evil.com') and backslash ('/\\evil.com') open-redirect
  // vectors (the latter is treated as external by ufo and would throw in middleware).
  return navigateTo(safeInternalRedirect(to.query.redirect, fallback))
})
