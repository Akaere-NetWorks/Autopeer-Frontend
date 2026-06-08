// Shared body scroll-lock with a reference counter so stacked dialogs compose:
// only the first lock hides overflow and only the last unlock restores it.
export function useScrollLock() {
  const count = useState('md-modal-count', () => 0)

  function lock() {
    if (!import.meta.client) return
    count.value += 1
    if (count.value === 1) {
      document.documentElement.style.overflow = 'hidden'
    }
  }

  function unlock() {
    if (!import.meta.client) return
    if (count.value === 0) return
    count.value -= 1
    if (count.value === 0) {
      document.documentElement.style.overflow = ''
    }
  }

  return { lock, unlock }
}
