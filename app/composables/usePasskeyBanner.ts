import { ApiError } from '~/composables/useApi'

const STORAGE_PREFIX = 'passkey_dismissed_'

/**
 * Drives the dismissible "bind a passkey" banner. State lives in `useState` so
 * every call-site shares one instance — the banner can be mounted once in the
 * layout while pages call `markRegistered()` after a successful flow elsewhere.
 *
 * The banner only appears for a logged-in `user` (with an ASN) that has no
 * passkey yet and hasn't dismissed the prompt for that ASN. The async status
 * check gates visibility behind `checked` to avoid a flicker on first paint.
 */
export function usePasskeyBanner() {
  const auth = useAuth()

  const dismissed = useState('passkey-banner-dismissed', () => false)
  const hasPasskey = useState('passkey-banner-has-passkey', () => false)
  const checking = useState('passkey-banner-checking', () => false)
  // `checked` flips to true once the first status round-trip completes, keeping
  // the banner hidden while the check is still in flight.
  const checked = useState('passkey-banner-checked', () => false)

  function storageKey(asn: number) {
    return `${STORAGE_PREFIX}${asn}`
  }

  function isDismissed(asn: number): boolean {
    if (!import.meta.client) return true
    return localStorage.getItem(storageKey(asn)) === '1'
  }

  function dismiss() {
    const asn = auth.user.value?.asn
    if (asn && import.meta.client) {
      localStorage.setItem(storageKey(asn), '1')
    }
    dismissed.value = true
  }

  // Only show once the async check has completed (checked === true) to avoid a
  // layout shift / flicker while the status is loading.
  const shouldShow = computed(() => {
    const user = auth.user.value
    return !!(
      checked.value
      && user?.role === 'user'
      && user.asn
      && !dismissed.value
      && !hasPasskey.value
    )
  })

  async function checkStatus() {
    if (!import.meta.client) return
    const user = auth.user.value
    if (!user || user.role !== 'user' || !user.asn) return
    if (isDismissed(user.asn)) {
      dismissed.value = true
      checked.value = true
      return
    }
    // `checking` is set synchronously before the first await, so a second
    // concurrent invocation (another component that also called this composable)
    // sees it as true and skips the redundant request.
    checking.value = true
    try {
      const status = await auth.passkeyStatus()
      hasPasskey.value = status.has_passkey
    }
    catch (e: unknown) {
      // Only permanently suppress for genuine auth failures (401). Transient
      // network errors shouldn't silence the banner for the whole session.
      if (e instanceof ApiError && e.status === 401) {
        dismissed.value = true
      }
    }
    finally {
      checking.value = false
      checked.value = true
    }
  }

  function markRegistered() {
    hasPasskey.value = true
  }

  // Watch for the active identity changing so state stays consistent across
  // login / logout / re-login as a different ASN.
  if (import.meta.client) {
    watch(
      () => auth.user.value,
      (user, prevUser) => {
        // Reset all state when the active identity changes.
        if (user?.asn !== prevUser?.asn) {
          dismissed.value = false
          hasPasskey.value = false
          checked.value = false
          checking.value = false
        }

        // Trigger a check when a user session becomes available and we haven't
        // checked yet. The `!checking` guard avoids parallel requests when
        // multiple components call this composable.
        if (user?.role === 'user' && user.asn && !checked.value && !checking.value) {
          checkStatus()
        }
      },
      { immediate: true },
    )
  }

  return { shouldShow, checking, dismiss, checkStatus, markRegistered, hasPasskey }
}
