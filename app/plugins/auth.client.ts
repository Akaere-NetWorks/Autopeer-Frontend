import { decodeJwt, isTokenExpiringSoon } from '~/utils/jwt'

/** On client boot: hydrate user state from the token cookie and proactively
 *  refresh an access token that's about to expire. */
export default defineNuxtPlugin(async () => {
  const { token, hydrate, refreshOnce } = useAuth()
  hydrate()
  if (token.value && isTokenExpiringSoon(decodeJwt(token.value))) {
    await refreshOnce()
    hydrate()
  }
})
