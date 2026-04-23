// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-11-01',
  future: {
    compatibilityVersion: 3,
  },
  typescript: {
    strict: true,
    typeCheck: false,
  },
  devtools: { enabled: true },
  app: {
    head: {
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
      title: 'SetCode.watch',
      // Default <html data-theme="dark"> so SSR markup already matches the
      // dark palette — a pre-hydration script below flips to "light" if the
      // user has previously saved that preference in localStorage.
      htmlAttrs: {
        'data-theme': 'dark',
      },
      meta: [
        {
          name: 'description',
          content:
            'Know when your wallet gets delegated. Continuous monitoring for EIP-7702 authorizations — verified, unknown, or malicious.',
        },
        { name: 'theme-color', content: '#1a1815' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      script: [
        {
          // Pre-hydration theme reconciliation. Runs before Nuxt boots, before
          // any CSS paints. Without it, a user who previously chose "light"
          // would see a dark flash on every page load. Ignored on failure so
          // privacy-locked contexts (Safari private mode) still render.
          innerHTML:
            "try{var t=localStorage.getItem('setcode-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}",
          tagPosition: 'head',
        },
      ],
    },
  },
  css: ['~/assets/css/tokens.css', '~/assets/css/reset.css', '~/assets/css/base.css'],
  runtimeConfig: {
    public: {
      // Watcher HTTP API base URL. Override at runtime via
      // NUXT_PUBLIC_WATCHER_API_URL — see app/.env.example.
      watcherApiUrl: 'http://localhost:8787',
      botUsername: 'setcode_watch_bot',
      // Reown (formerly WalletConnect) project ID. Create one at
      // https://cloud.reown.com — it's free for open-source projects.
      // Without it the Connect Wallet button falls back to injected-only
      // (MetaMask / Rabby / browser wallets) and WalletConnect v2 is off.
      reownProjectId: '',
    },
  },
  // Vite/Rollup: force CJS deep-imports used by wagmi/viem internals to be
  // treated as ESM so SSR doesn't choke on `require`.
  vite: {
    ssr: {
      noExternal: ['@reown/appkit', '@reown/appkit-adapter-wagmi', '@wagmi/vue', '@wagmi/core'],
    },
  },
  nitro: {
    // Landing + flows are fully client-side today; SSR enabled for /check/:addr
    // in step 10 to make shareable pre-rendered pages (and for social preview
    // cards). Keeping SSR on by default so nothing has to flip later.
    preset: 'node-server',
  },
  // Auto-import filter: only primitives prefixed G* are auto-imported as
  // components so page files read explicitly.
  components: [{ path: '~/components', prefix: '', pathPrefix: false }],
});
