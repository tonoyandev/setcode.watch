import { CHAIN_ID_MAINNET } from '@setcode/shared/constants';

// Catalogue of EVM chains where EIP-7702 has shipped (Pectra-equivalent
// activation). Surfaced in the home-page table so users see breadth before
// pasting an address. Only `monitored: true` chains hit the watcher's
// `/check` API today — the rest resolve as "Not Detected" client-side until
// the indexer grows network coverage (see docs/ROADMAP.md "L2 support").
export interface ChainMeta {
  // Canonical chain id (used as the React/Vue key and for future per-chain
  // API calls).
  id: number;
  // Stable slug for analytics, route params, etc. — never displayed.
  slug: string;
  // User-facing label.
  name: string;
  // Coarse grouping for visual de-emphasis. Testnets render with a faded
  // icon to keep mainnet rows visually dominant.
  group: 'mainnet' | 'testnet';
  // Whether the watcher actually has indexer state for this chain. False
  // chains skip the network round-trip and resolve to "Not Detected" after
  // a short delay so the UI feels uniformly responsive.
  monitored: boolean;
  // Visual identity. 'eth' renders the Ethereum diamond; 'mark' renders a
  // colored circle with a 1–2 char glyph (good enough for L2s without
  // shipping vector logos for each).
  icon: 'eth' | 'mark';
  mark?: string;
  bg?: string;
  fg?: string;
}

export const CHAINS: readonly ChainMeta[] = [
  {
    id: CHAIN_ID_MAINNET,
    slug: 'eth',
    name: 'Ethereum Mainnet',
    group: 'mainnet',
    monitored: true,
    icon: 'eth',
  },
  {
    id: 11155111,
    slug: 'sepolia',
    name: 'Ethereum Sepolia',
    group: 'testnet',
    monitored: false,
    icon: 'eth',
  },
  {
    id: 17000,
    slug: 'holesky',
    name: 'Ethereum Holesky',
    group: 'testnet',
    monitored: false,
    icon: 'eth',
  },
  {
    id: 560048,
    slug: 'hoodi',
    name: 'Ethereum Hoodi',
    group: 'testnet',
    monitored: false,
    icon: 'eth',
  },
  {
    id: 56,
    slug: 'bnb',
    name: 'BNB',
    group: 'mainnet',
    monitored: false,
    icon: 'mark',
    mark: 'B',
    bg: '#F0B90B',
    fg: '#1A1A1A',
  },
  {
    id: 97,
    slug: 'bnb-testnet',
    name: 'BNB Testnet',
    group: 'testnet',
    monitored: false,
    icon: 'mark',
    mark: 'B',
    bg: '#F0B90B',
    fg: '#1A1A1A',
  },
  {
    id: 8453,
    slug: 'base',
    name: 'Base',
    group: 'mainnet',
    monitored: false,
    icon: 'mark',
    mark: 'B',
    bg: '#0052FF',
    fg: '#FFFFFF',
  },
  {
    id: 84532,
    slug: 'base-sepolia',
    name: 'Base Sepolia',
    group: 'testnet',
    monitored: false,
    icon: 'mark',
    mark: 'B',
    bg: '#0052FF',
    fg: '#FFFFFF',
  },
  {
    id: 10,
    slug: 'op',
    name: 'Optimism',
    group: 'mainnet',
    monitored: false,
    icon: 'mark',
    mark: 'OP',
    bg: '#FF0420',
    fg: '#FFFFFF',
  },
  {
    id: 11155420,
    slug: 'op-sepolia',
    name: 'Optimism Sepolia',
    group: 'testnet',
    monitored: false,
    icon: 'mark',
    mark: 'OP',
    bg: '#FF0420',
    fg: '#FFFFFF',
  },
  {
    id: 42161,
    slug: 'arb',
    name: 'Arbitrum One',
    group: 'mainnet',
    monitored: false,
    icon: 'mark',
    mark: 'A',
    bg: '#28A0F0',
    fg: '#FFFFFF',
  },
  {
    id: 421614,
    slug: 'arb-sepolia',
    name: 'Arbitrum Sepolia',
    group: 'testnet',
    monitored: false,
    icon: 'mark',
    mark: 'A',
    bg: '#28A0F0',
    fg: '#FFFFFF',
  },
  {
    id: 137,
    slug: 'polygon',
    name: 'Polygon',
    group: 'mainnet',
    monitored: false,
    icon: 'mark',
    mark: 'P',
    bg: '#8247E5',
    fg: '#FFFFFF',
  },
  {
    id: 130,
    slug: 'unichain',
    name: 'Unichain',
    group: 'mainnet',
    monitored: false,
    icon: 'mark',
    mark: 'U',
    bg: '#F50DB4',
    fg: '#FFFFFF',
  },
  {
    id: 59144,
    slug: 'linea',
    name: 'Linea',
    group: 'mainnet',
    monitored: false,
    icon: 'mark',
    mark: 'L',
    bg: '#121212',
    fg: '#61DFFF',
  },
];

export function useChainCatalog() {
  return { chains: CHAINS };
}
