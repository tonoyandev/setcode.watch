// Hardcoded public RPC URLs for chains we want to *read* from but
// don't index. The CheckService falls back to these URLs when looking
// up an EOA's current 7702 delegation via eth_getCode, so the website
// can light up rows for chains we have no Ponder process on.
//
// Architectural rules:
//   - These chains are READ-ONLY. Subscriptions, alerts, and the bot's
//     /confirmations endpoint stay restricted to SUPPORTED_CHAIN_IDS
//     (the 4 indexed chains). Live RPC lookups are best-effort UI
//     enrichment, not a guarantee of delivery.
//   - URLs come from publicnode.com (rate-limited but free) or each
//     chain's official documented public endpoint. Operators with paid
//     keys can override any of these by setting an env var that
//     `chainRpcUrls()` reads first — env always wins.
//   - Missing chains silently fall back to "Not Detected" in the UI;
//     no error path needs to know about which chains are configured.

export interface PublicRpc {
  id: number;
  shortName: string;
  rpcUrl: string;
}

export const PUBLIC_RPCS: readonly PublicRpc[] = [
  // ---- Ethereum testnets ------------------------------------------------
  { id: 11155111, shortName: 'sepolia', rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com' },
  { id: 17000, shortName: 'holesky', rpcUrl: 'https://ethereum-holesky-rpc.publicnode.com' },
  { id: 560048, shortName: 'hoodi', rpcUrl: 'https://ethereum-hoodi-rpc.publicnode.com' },

  // ---- L2 testnets ------------------------------------------------------
  { id: 84532, shortName: 'base-sepolia', rpcUrl: 'https://base-sepolia-rpc.publicnode.com' },
  {
    id: 11155420,
    shortName: 'op-sepolia',
    rpcUrl: 'https://optimism-sepolia-rpc.publicnode.com',
  },
  {
    id: 421614,
    shortName: 'arb-sepolia',
    rpcUrl: 'https://arbitrum-sepolia-rpc.publicnode.com',
  },
  { id: 1301, shortName: 'unichain-sepolia', rpcUrl: 'https://sepolia.unichain.org' },
  { id: 534351, shortName: 'scroll-sepolia', rpcUrl: 'https://sepolia-rpc.scroll.io' },

  // ---- Other EVM mainnets we don't index but still want a live read ---
  { id: 56, shortName: 'bnb', rpcUrl: 'https://bsc-rpc.publicnode.com' },
  { id: 137, shortName: 'polygon', rpcUrl: 'https://polygon-bor-rpc.publicnode.com' },
  { id: 100, shortName: 'gnosis', rpcUrl: 'https://gnosis-rpc.publicnode.com' },
  { id: 43114, shortName: 'avalanche', rpcUrl: 'https://avalanche-c-chain-rpc.publicnode.com' },
  { id: 59144, shortName: 'linea', rpcUrl: 'https://linea-rpc.publicnode.com' },
  { id: 534352, shortName: 'scroll', rpcUrl: 'https://scroll-rpc.publicnode.com' },
  { id: 42220, shortName: 'celo', rpcUrl: 'https://celo-rpc.publicnode.com' },
  { id: 130, shortName: 'unichain', rpcUrl: 'https://mainnet.unichain.org' },
  { id: 5000, shortName: 'mantle', rpcUrl: 'https://mantle-rpc.publicnode.com' },

  // ---- Other testnets ---------------------------------------------------
  { id: 97, shortName: 'bnb-testnet', rpcUrl: 'https://bsc-testnet-rpc.publicnode.com' },
  {
    id: 80002,
    shortName: 'polygon-amoy',
    rpcUrl: 'https://polygon-amoy-bor-rpc.publicnode.com',
  },
  {
    id: 43113,
    shortName: 'avalanche-fuji',
    rpcUrl: 'https://avalanche-fuji-c-chain-rpc.publicnode.com',
  },
  { id: 10200, shortName: 'gnosis-chiado', rpcUrl: 'https://gnosis-chiado-rpc.publicnode.com' },
];

export const PUBLIC_RPC_BY_ID: ReadonlyMap<number, string> = new Map(
  PUBLIC_RPCS.map((c) => [c.id, c.rpcUrl]),
);
