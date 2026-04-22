// Reown AppKit + Wagmi Vue bootstrap.
//
// Runs client-only (`.client.ts`) because wagmi's connectors reach for
// `window.ethereum`, IndexedDB, and WalletConnect Core on init — none of
// which exist under Nitro SSR. The rest of the app can stay isomorphic;
// any wallet-aware component just has to gate its use of `useAccount()`
// behind `<ClientOnly>` or an `import.meta.client` check.
//
// `createAppKit` registers a handful of custom elements (`<appkit-button>`,
// `<w3m-modal>`, …). We don't use the web-component button directly — the
// app owns its chrome — but the modal is what pops on `.open()`.

import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet } from '@reown/appkit/networks';
import { type ChainAdapter, createAppKit } from '@reown/appkit/vue';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { WagmiPlugin } from '@wagmi/vue';

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig();
  const projectId = config.public.reownProjectId || '';

  // Hard-crashing on missing projectId is worse UX than "connect still
  // works for injected wallets". AppKit tolerates an empty project ID
  // (WalletConnect v2 is just disabled) so we warn in dev and move on.
  if (!projectId && import.meta.dev) {
    console.warn(
      '[setcode/app] NUXT_PUBLIC_REOWN_PROJECT_ID is empty. Injected wallets only; WalletConnect v2 mobile flows disabled. Get a free ID at https://cloud.reown.com.',
    );
  }

  // One adapter, one chain (mainnet only — same scope as the watcher).
  // Multi-chain lands when other L1s/L2s activate EIP-7702.
  const networks = [mainnet] as const;

  const wagmiAdapter = new WagmiAdapter({
    networks: [...networks],
    projectId,
    ssr: false,
  });

  createAppKit({
    // Under exactOptionalPropertyTypes, WagmiAdapter's declared
    // `namespace: ChainNamespace | undefined` doesn't satisfy ChainAdapter's
    // required `namespace`. The runtime always sets it to 'eip155' in
    // WagmiAdapter's constructor, so we assert the narrower shape.
    adapters: [wagmiAdapter as unknown as ChainAdapter],
    networks: [...networks],
    projectId,
    metadata: {
      name: 'SetCode.watch',
      description: 'Monitoring and alerting for EIP-7702 delegated Ethereum accounts.',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://setcode.watch',
      icons: ['https://setcode.watch/favicon.svg'],
    },
    features: {
      analytics: false,
      email: false,
      socials: false,
    },
    themeMode: 'light',
  });

  // Wagmi's Vue plugin wires reactive `useAccount` etc. Vue Query is its
  // peer runtime for caching chain queries.
  nuxtApp.vueApp.use(WagmiPlugin, { config: wagmiAdapter.wagmiConfig });
  nuxtApp.vueApp.use(VueQueryPlugin);
});
