// Single-locale catalog for the Nuxt app. Same shape as watcher/src/i18n/en.ts
// so the step 14 i18n refactor can swap a proper library in behind the `t()`
// helper without touching callers. Keys are dot-namespaced by screen.

export const en = {
  // --------------------------------------------------------------------
  // Global nav + footer
  // --------------------------------------------------------------------
  'nav.check': 'Check',
  'nav.subscribe': 'Subscribe',
  'nav.registry': 'Registry',
  'nav.docs': 'Docs',
  'footer.tagline': 'Open-source monitoring for EIP-7702 delegated accounts.',
  'footer.github': 'GitHub',

  // --------------------------------------------------------------------
  // Landing page
  // --------------------------------------------------------------------
  'landing.hero.headline': 'Know when your wallet gets delegated.',
  'landing.hero.subhead':
    'Continuous monitoring for EIP-7702 authorizations. Verified, unknown, or malicious — get alerted before damage spreads.',
  'landing.hero.primaryCta': 'Check an address',
  'landing.hero.secondaryCta': 'Subscribe for alerts',

  'landing.how.title': 'How it works',
  'landing.how.step1.title': '1. Ponder indexes EIP-7702 delegations',
  'landing.how.step1.body':
    'A dedicated indexer watches every mainnet block for type-0x04 transactions and 0xef0100-prefixed account code.',
  'landing.how.step2.title': '2. Targets are classified',
  'landing.how.step2.body':
    'Delegation targets resolve against an on-chain registry first, then a reviewed static list, then fall back to "unknown" — never a false green.',
  'landing.how.step3.title': '3. Alerts land in Telegram',
  'landing.how.step3.body':
    'Confirm an EOA via a one-time link; every delegation change pings the chat you bound, including for addresses you do not control.',

  'landing.why.title': 'Why this matters',
  'landing.why.body':
    'EIP-7702 lets any externally-owned account adopt smart-contract code with a single signed authorisation. That same mechanism is how phishing kits drain wallets minutes after a victim signs. Passive monitoring is the cheapest watchtower you can own.',

  // --------------------------------------------------------------------
  // Classification labels (shared across pages)
  // --------------------------------------------------------------------
  'classification.verified': 'Verified',
  'classification.unknown': 'Unknown',
  'classification.malicious': 'Malicious',
  'classification.verified.tooltip': 'Reviewed and listed in the SetCode.watch registry.',
  'classification.unknown.tooltip':
    'Not yet classified. Absence of a label is not a safety guarantee.',
  'classification.malicious.tooltip':
    'Flagged as malicious by the registry or an on-chain downgrade.',

  // --------------------------------------------------------------------
  // Shared errors
  // --------------------------------------------------------------------
  'error.network': 'Could not reach the service. Check your connection and try again.',
  'error.invalidAddress': 'That does not look like a valid Ethereum address.',
  'error.generic': 'Something went wrong. Please try again.',
} as const;

export type MessageKey = keyof typeof en;
