/** Route guard: redirect already-authenticated users away from guest pages. */
export default defineNuxtRouteMiddleware((to) => {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated.value) {
    const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '/peers'
    return navigateTo(redirect)
  }
})
