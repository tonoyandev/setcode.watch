// Thin Vue composable wrapping wagmi + AppKit so pages never import either
// directly. Keeps the wallet integration swappable — if we ditch Reown for
// something else tomorrow, only this file changes.
//
// SSR note: wagmi's composables assume their plugin was installed, which
// only happens on the client (see plugins/appkit.client.ts). This composable
// short-circuits on the server with dead refs so callers can still call it
// unconditionally — but wallet-aware chrome should still render inside
// <ClientOnly> to avoid hydration mismatches on dynamic labels.

import { useAppKit } from '@reown/appkit/vue';
import { useAccount, useDisconnect } from '@wagmi/vue';
import { type Address, isAddress } from 'viem';
import { type ComputedRef, computed } from 'vue';

export interface UseWalletReturn {
  address: ComputedRef<Address | null>;
  isConnected: ComputedRef<boolean>;
  chainId: ComputedRef<number | null>;
  open: () => Promise<void>;
  disconnect: () => Promise<void>;
}

function stub(): UseWalletReturn {
  return {
    address: computed(() => null),
    isConnected: computed(() => false),
    chainId: computed(() => null),
    open: async () => {},
    disconnect: async () => {},
  };
}

export function useWallet(): UseWalletReturn {
  // Server-side we skip wagmi entirely — its plugin is client-only, so
  // calling useAccount() there would throw "no wagmi config provided".
  if (!import.meta.client) return stub();

  const account = useAccount();
  const { disconnectAsync } = useDisconnect();
  const modal = useAppKit();

  return {
    address: computed(() => {
      const v = account.address.value;
      return v && isAddress(v) ? (v.toLowerCase() as Address) : null;
    }),
    isConnected: computed(() => Boolean(account.isConnected.value)),
    chainId: computed(() => {
      const id = account.chainId.value;
      return typeof id === 'number' ? id : null;
    }),
    open: async () => {
      await modal.open();
    },
    disconnect: async () => {
      await disconnectAsync();
    },
  };
}
