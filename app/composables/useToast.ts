export interface Toast {
  id: number
  message: string
  kind: 'normal' | 'error'
  requestId?: string
  timeout: number
  /** Unix ms when this toast was last (re)shown — used for de-dupe windowing. */
  shownAt: number
}

/** Maximum toasts kept on screen at once; oldest are evicted past this. */
const MAX_VISIBLE = 3
/** Identical message+kind within this window is collapsed onto the existing toast. */
const DEDUPE_WINDOW = 2500

let counter = 0

export function useToast() {
  const toasts = useState<Toast[]>('toasts', () => [])
  // Capture i18n helpers at setup time. error() is typically invoked from async
  // catch blocks (after `await`), where Vue's currentInstance is null and a lazy
  // useI18n() would throw "Must be called at the top of a setup function" — so
  // every ApiError toast would silently fail. All useToast() callers are in setup.
  const { t, te } = useI18n()

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function show(message: string, opts: { kind?: 'normal' | 'error', requestId?: string, timeout?: number } = {}) {
    const kind = opts.kind ?? 'normal'
    const timeout = opts.timeout ?? (kind === 'error' ? 7000 : 4000)
    const now = Date.now()

    // De-dupe: an identical message+kind shown within the window just refreshes the
    // existing toast (and its request id) instead of stacking a duplicate.
    const existing = toasts.value.find(
      (t) => t.message === message && t.kind === kind && now - t.shownAt < DEDUPE_WINDOW,
    )
    if (existing) {
      existing.shownAt = now
      if (opts.requestId) existing.requestId = opts.requestId
      // Re-arm dismissal so the refreshed toast lives out a full timeout.
      if (import.meta.client && timeout > 0) {
        setTimeout(() => {
          const cur = toasts.value.find((t) => t.id === existing.id)
          if (cur && Date.now() - cur.shownAt >= timeout) dismiss(existing.id)
        }, timeout)
      }
      return existing.id
    }

    const id = ++counter
    const next = [...toasts.value, { id, message, kind, requestId: opts.requestId, timeout, shownAt: now }]
    // Cap the queue: keep only the newest MAX_VISIBLE, evicting the oldest.
    toasts.value = next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next
    if (import.meta.client && timeout > 0) {
      setTimeout(() => {
        const cur = toasts.value.find((t) => t.id === id)
        // A de-dupe refresh may have pushed shownAt forward; only dismiss once the
        // full timeout has elapsed since the last show.
        if (cur && Date.now() - cur.shownAt >= timeout) dismiss(id)
        else if (cur) setTimeout(() => dismiss(id), Math.max(0, cur.shownAt + timeout - Date.now()))
      }, timeout)
    }
    return id
  }

  /** Surface an ApiError (or anything) as an error toast with the request id. */
  function error(err: unknown, fallback?: string) {
    if (err instanceof ApiError) {
      const localized = te(`errors.${err.code}`) ? t(`errors.${err.code}`) : err.message
      return show(localized || fallback || t('errors.generic'), { kind: 'error', requestId: err.requestId })
    }
    const msg = (err as Error)?.message || fallback || 'Something went wrong.'
    return show(msg, { kind: 'error' })
  }

  return { toasts, show, error, dismiss }
}
