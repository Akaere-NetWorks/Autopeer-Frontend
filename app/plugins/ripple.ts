/**
 * `v-ripple` — MD3 touch ripple. Spawns an expanding circle on pointerdown,
 * tinted by the element's `--slc` (state-layer color).
 *
 * Registered universally so Vue can resolve the directive during SSR; the actual
 * DOM work happens only in `mounted`/`unmounted`, which never run on the server.
 */
interface RippleEl extends HTMLElement {
  _rippleHandler?: (e: PointerEvent) => void
}

function spawnRipple(el: HTMLElement, e: PointerEvent) {
  const rect = el.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height)
  const x = (e.clientX || rect.left + rect.width / 2) - rect.left - size / 2
  const y = (e.clientY || rect.top + rect.height / 2) - rect.top - size / 2
  const span = document.createElement('span')
  span.className = 'ripple'
  span.style.width = span.style.height = `${size}px`
  span.style.left = `${x}px`
  span.style.top = `${y}px`
  el.appendChild(span)
  const cleanup = () => span.remove()
  span.addEventListener('animationend', cleanup)
  setTimeout(cleanup, 800)
}

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('ripple', {
    // No SSR props to emit; defining this avoids any server-side directive lookup issues.
    getSSRProps: () => ({}),
    mounted(el: RippleEl) {
      el._rippleHandler = (e: PointerEvent) => {
        if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return
        spawnRipple(el, e)
      }
      el.addEventListener('pointerdown', el._rippleHandler)
    },
    unmounted(el: RippleEl) {
      if (el._rippleHandler) el.removeEventListener('pointerdown', el._rippleHandler)
    },
  })
})
