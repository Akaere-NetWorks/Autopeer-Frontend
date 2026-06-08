# AutoPeer Frontend (open-source)

> [!WARNING]
> **This frontend was built autonomously by Claude (AI) — "on autopilot", with no human authoring the code.**
> Review the source and **assess the risks yourself before using or deploying it.**

A production-quality, server-side-rendered web frontend for **[AutoPeer](https://autopeer.su)** —
an automated [DN42](https://dn42.dev) BGP peering control plane. Built with **Nuxt 4 (Vue 3) +
Nitro**, styled in **Material Design 3**, trilingual (English / 简体中文 / 繁體中文), and ready to
deploy on **Netlify**.

This is an open-source frontend that talks to the open-source
[`autopeer-center`](https://github.com/Akaere-NetWorks/Autopeer-Center) backend. It targets the
**OSS backend surface** — the Atlas measurement subsystem is intentionally **not** included.

## Features

- **Landing** — live public network stats and peering-node table (SSR).
- **Sign in** — DN42 ASN auth via **email code**, **GPG signature**, or **passkey/WebAuthn**, with
  optional Cloudflare Turnstile. CLI/TUI **device-flow** approval at `/cli/activate`.
- **My Peers** — list (cards or table), **create-peer wizard** with client-side validation
  mirroring the backend, **peer detail** with RTT/traffic charts, edit, and delete.
- **Looking Glass** — run ping / traceroute / MTR / BGP-route diagnostics from a node.
- **Account** — active sessions/devices, email + Telegram notification preferences, audit log,
  and MCP API-key management.
- **Material Design 3** — light/dark + system, four selectable accent palettes, ripples, state
  layers, and motion. No UI framework dependency; the design system is plain CSS + small Vue SFCs.

## Stack

| Concern | Choice |
|---|---|
| Framework | Nuxt 4 (Vue 3) + Nitro (SSR) |
| Deploy | Netlify (Nitro `netlify` preset) — also works on Cloudflare/Vercel/Node via other presets |
| i18n | `@nuxtjs/i18n` (en, zh-CN, zh-TW) |
| Theming | `@nuxtjs/color-mode` + generated MD3 token CSS |
| Auth (passkey) | `@simplewebauthn/browser` |
| Charts | dependency-free inline SVG |

## Architecture

- **Same-origin API proxy.** `server/routes/api/[...].ts` forwards every `/api/**` request to
  `${API_BASE}/api/**`, preserving method/body and the auth headers/cookies. The backend base URL
  stays server-side only — the browser never sees it and there is **no CORS**. The backend's
  `refresh_token` cookie is rewritten to bind to this origin.
- **Typed API client.** `app/composables/useApi.ts` is the single fetch wrapper: it injects the
  `Authorization` Bearer token and the pinned `Autopeer-Version` header, retries once on `401`
  after refreshing, and parses the backend `{error, message, request_id}` shape into a typed
  `ApiError` surfaced as a toast (with copyable request id).
- **Auth/session.** The access token lives in a readable cookie (so SSR can forward it as a
  Bearer header); the refresh token is the backend's HttpOnly cookie, used transparently through
  the proxy. Route guards live in `app/middleware/{auth,guest}.ts`.

```
app/
  assets/css/      MD3 tokens (generated) + base + components + app CSS
  components/      MD3 primitives (MdButton, MdTextField, …), charts, app shell
  composables/     useApi, useAuth, useToast, useSeed, useFormat, useNav, usePeerStatus
  layouts/         default app shell (nav drawer + top bar + footer)
  middleware/      auth / guest route guards
  pages/           landing, login, cli/activate, peers/*, looking-glass, account/*
  plugins/         ripple directive, client auth bootstrap
  types/           API response types
  utils/           jwt, validators, chart math
server/routes/api/ same-origin backend proxy
i18n/locales/      en.json, zh-CN.json, zh-TW.json
scripts/           gen-md3-tokens.mjs (regenerates the token CSS)
```

## Prerequisites

- Node.js ≥ 20 (CI/Netlify use 22)
- A running `autopeer-center` backend reachable from the frontend server

## Setup

```bash
npm install
cp .env.example .env     # then edit API_BASE (required)
npm run dev              # http://localhost:3000
```

All dependencies are managed via npm (see `package.json`). To add one, use `npm install <pkg>`.

## Environment

See [`.env.example`](./.env.example). The important one:

| Variable | Required | Description |
|---|---|---|
| `API_BASE` | **yes** | Base URL of `autopeer-center` (e.g. `https://api.autopeer.su`). Server-only. |
| `NUXT_PUBLIC_SITE_URL` | no | Public site URL for OG tags / MCP config snippet. |
| `NUXT_PUBLIC_API_VERSION` | no | Pinned `Autopeer-Version` (default `2026-06-07`). |
| `NUXT_PUBLIC_APP_NAME` / `NUXT_PUBLIC_OPERATOR` | no | Branding. |
| `COMMIT_HASH` | no | Build marker shown in the footer (set in CI). |

## Scripts

```bash
npm run dev         # dev server
npm run build       # production build (Nitro)
npm run preview     # preview the built node server
npm run typecheck   # vue-tsc type check
npm run generate    # static generation (if desired)
```

## Deploy to Netlify

1. Connect this repo to a Netlify site.
2. Build command `npm run build`, publish directory `dist` (already set in
   [`netlify.toml`](./netlify.toml), which also sets `NITRO_PRESET=netlify`).
3. In **Site settings → Environment variables**, set **`API_BASE`** (and any other vars above).
4. Deploy. The Nitro Netlify function serves SSR and the `/api/**` proxy; static assets come from
   `dist`.

> Deploying elsewhere? Nitro presets cover it: Cloudflare (`cloudflare_module`), Vercel (`vercel`),
> Node/Docker (`node-server`), Deno Deploy (`deno-deploy`). Set `NITRO_PRESET` accordingly and keep
> `API_BASE` server-side.

## Theming

MD3 color tokens are generated into `app/assets/css/md3-tokens.css` by
`scripts/gen-md3-tokens.mjs` (run `node scripts/gen-md3-tokens.mjs` after changing the palette).
The active palette is selected by the `.light` / `.dark` class (color-mode) plus the
`[data-seed]` attribute on `<html>` — both set during SSR, so there is no flash.

## Smoke test

Load the home page → sign in (email/GPG/passkey) → create a peer → open its detail (charts) →
run a Looking Glass query → toggle theme/accent/language → sign out.

## License

MIT — see [LICENSE](./LICENSE).
