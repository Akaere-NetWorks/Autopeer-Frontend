<script setup lang="ts">
interface Turnstile {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id?: string) => void
  remove: (id?: string) => void
}
const props = defineProps<{ siteKey: string }>()
const emit = defineEmits<{ verified: [string], expired: [] }>()

const el = ref<HTMLElement | null>(null)
let widgetId: string | undefined

function ts(): Turnstile | undefined {
  return (window as unknown as { turnstile?: Turnstile }).turnstile
}

function render() {
  const api = ts()
  if (!api || !el.value) return
  widgetId = api.render(el.value, {
    sitekey: props.siteKey,
    callback: (token: string) => emit('verified', token),
    'expired-callback': () => emit('expired'),
    'error-callback': () => emit('expired'),
  })
}

onMounted(() => {
  if (ts()) return render()
  const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]')
  if (existing) {
    existing.addEventListener('load', render)
    return
  }
  const s = document.createElement('script')
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
  s.async = true
  s.defer = true
  s.dataset.turnstile = 'true'
  s.onload = render
  document.head.appendChild(s)
})

function reset() {
  const api = ts()
  if (api && widgetId) api.reset(widgetId)
}
defineExpose({ reset })
</script>

<template>
  <div ref="el" :style="{ minHeight: '65px' }" />
</template>
