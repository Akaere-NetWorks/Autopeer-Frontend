// https://nuxt.com/docs/api/configuration/nuxt-config
const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'https://autopeer.su'

// Pin one Autopeer-Version (Stripe-style header). See center docs/api/versioning.md.
const apiVersion = process.env.NUXT_PUBLIC_API_VERSION || '2026-06-07'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  modules: ['@nuxtjs/i18n', '@nuxtjs/color-mode'],

  // Nitro auto-detects Netlify; NITRO_PRESET=netlify (set in netlify.toml) forces
  // it for explicit/local builds. Left unset → node-server for local verification.
  nitro: {
    preset: process.env.NITRO_PRESET || undefined,
  },

  devtools: { enabled: true },

  css: [
    '~/assets/css/md3-tokens.css',
    '~/assets/css/base.css',
    '~/assets/css/components.css',
    '~/assets/css/app.css',
  ],

  colorMode: {
    preference: 'system',
    fallback: 'light',
    classPrefix: '',
    classSuffix: '',
    storageKey: 'ap-color-mode',
  },

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    locales: [
      { code: 'en', name: 'English', language: 'en', file: 'en.json' },
      { code: 'zh-CN', name: '简体中文', language: 'zh-CN', file: 'zh-CN.json' },
      { code: 'zh-TW', name: '繁體中文', language: 'zh-TW', file: 'zh-TW.json' },
    ],
    langDir: 'locales',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'ap-locale',
      redirectOn: 'root',
      alwaysRedirect: false,
    },
  },

  runtimeConfig: {
    // server-only: the backend base URL stays off the client bundle.
    apiBase: process.env.API_BASE || process.env.NUXT_API_BASE || 'https://api.autopeer.su',
    public: {
      siteUrl,
      apiVersion,
      appName: process.env.NUXT_PUBLIC_APP_NAME || 'AutoPeer',
      operator: process.env.NUXT_PUBLIC_OPERATOR || 'Akaere Networks',
      commitHash: process.env.COMMIT_HASH || process.env.NUXT_PUBLIC_COMMIT_HASH || 'dev',
    },
  },

  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'AutoPeer — free automated DN42 BGP peering. Connect to the DN42 network in minutes with zero manual configuration: WireGuard tunnels, multi-node redundancy, instant peering.' },
        { name: 'keywords', content: 'DN42, BGP, peering, WireGuard, networking, autonomous system, routing, tunnel' },
        { name: 'theme-color', content: '#6750A4' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'AutoPeer' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,100..1000&family=Roboto+Mono:wght@400;500&display=swap',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block',
        },
      ],
    },
  },
})
