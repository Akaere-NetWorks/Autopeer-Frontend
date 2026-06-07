export interface Toast {
  id: number
  message: string
  kind: 'normal' | 'error'
  requestId?: string
  timeout: number
}

let counter = 0

export function useToast() {
  const toasts = useState<Toast[]>('toasts', () => [])

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function show(message: string, opts: { kind?: 'normal' | 'error', requestId?: string, timeout?: number } = {}) {
    const id = ++counter
    const timeout = opts.timeout ?? (opts.kind === 'error' ? 7000 : 4000)
    toasts.value = [...toasts.value, { id, message, kind: opts.kind ?? 'normal', requestId: opts.requestId, timeout }]
    if (import.meta.client && timeout > 0) {
      setTimeout(() => dismiss(id), timeout)
    }
    return id
  }

  /** Surface an ApiError (or anything) as an error toast with the request id. */
  function error(err: unknown, fallback?: string) {
    if (err instanceof ApiError) {
      const { t, te } = useI18n()
      const localized = te(`errors.${err.code}`) ? t(`errors.${err.code}`) : err.message
      return show(localized || fallback || t('errors.generic'), { kind: 'error', requestId: err.requestId })
    }
    const msg = (err as Error)?.message || fallback || 'Something went wrong.'
    return show(msg, { kind: 'error' })
  }

  return { toasts, show, error, dismiss }
}
