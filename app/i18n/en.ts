// Single-locale catalog for the Nuxt app. Same shape as watcher/src/i18n/en.ts
// so a future i18n library can swap in behind the `t()` helper without
// touching callers. Keys are dot-namespaced by screen.

export const en = {
  // --------------------------------------------------------------------
  // Global nav + footer
  // --------------------------------------------------------------------
  'nav.registry': 'Registry',
  'nav.docs': 'Docs',
  'footer.tagline': 'Open-source monitoring for EIP-7702 delegated accounts.',
  'footer.github': 'GitHub',

  // --------------------------------------------------------------------
  // Theme toggle
  // --------------------------------------------------------------------
  'theme.switchToLight': 'Switch to light theme',
  'theme.switchToDark': 'Switch to dark theme',

  // --------------------------------------------------------------------
  // Wallet connect chip
  // --------------------------------------------------------------------
  'wallet.connect': 'Connect Wallet',
  'wallet.connected': 'Connected',
  'wallet.copy': 'Copy',
  'wallet.copied': 'Copied',
  'wallet.disconnect': 'Disconnect',

  // --------------------------------------------------------------------
  // Landing / home page — the unified hub for lookup + subscribe + watch
  // --------------------------------------------------------------------
  'landing.hero.headline': 'Know when your wallet gets delegated.',
  'landing.hero.subhead':
    'Paste an address or connect your wallet. Get the current EIP-7702 delegation, its classification, and one-tap subscribe + watch in Telegram.',

  'home.lookup.label': 'Ethereum address',
  'home.lookup.placeholder': '0x… or click Connect Wallet',
  'home.lookup.submit': 'Look up delegation',
  'home.lookup.checking': 'Checking…',
  'home.lookup.reset': 'Clear',
  'home.lookup.clearAria': 'Clear address',
  'home.lookup.hint':
    'Tip: connect a wallet to auto-fill this field and watch for account switches.',
  'home.lookup.autofilled': 'Filled from your connected wallet',

  // Table-style results, one row per chain. Only Ethereum mainnet is in
  // scope today; L2s are tracked in docs/ROADMAP.md.
  'home.table.chain': 'Chain',
  'home.table.delegation': 'EIP-7702 Delegation',
  'home.table.actions': 'Actions',
  'home.table.notDetected': 'Not Detected',
  'home.table.checking': 'Checking…',
  'home.table.awaitingInput': 'Enter an address above',
  'home.table.alertsUnsupported': 'Alerts not yet available',
  'home.table.mainnetsHeading': 'Mainnets',
  'home.table.testnetsHeading': 'Testnets',
  'home.chain.ethereumMainnet': 'Ethereum Mainnet',

  'home.result.title': 'Current delegation',
  'home.result.eoa': 'EOA',
  'home.result.delegatesTo': 'Delegates to',
  'home.result.noDelegation': 'This address has no active EIP-7702 delegation.',
  'home.result.lastUpdated': 'Last updated',
  'home.result.source.registry': 'Match from the on-chain SetCodeRegistry.',
  'home.result.source.static': 'Match from the committed static registry.',
  'home.result.source.unknown': 'No match in either registry — treat with caution.',

  'home.cta.subscribe': 'Subscribe',
  'home.cta.subscribe.tooltip':
    'Get a Telegram alert every time this address is delegated or the target changes. Requires a one-time confirmation in Telegram; you can unsubscribe any time with /remove.',
  'home.cta.watch': 'Watch in Telegram',
  'home.cta.watch.tooltip':
    'Open the bot and see the current classification for this address — no subscription, no binding. Good for a one-off check or sharing a link.',

  'home.confirm.title': 'Almost there — confirm in Telegram',
  'home.confirm.body':
    'Tap the button to open a pre-filled chat with the bot. The chat you confirm from becomes the subscriber for this address.',
  'home.confirm.cta': 'Open Telegram',
  'home.confirm.copyCode': 'Copy code',
  'home.confirm.copied': 'Copied',
  'home.confirm.expiresIn': 'Expires in {seconds}s',
  'home.confirm.expired': 'This link has expired. Tap Subscribe again to get a fresh one.',
  'home.confirm.fallback':
    'If the button does not work, send this to @{bot} as a message starting with /start.',

  'home.subscribe.error': 'Could not create a confirmation link. Try again in a moment.',

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
  // Manage page (token-gated list + remove for a chat's subscriptions)
  // --------------------------------------------------------------------
  'manage.title': 'Manage your subscriptions',
  'manage.intro':
    'This page is authorised by the token in the URL your bot handed you. It lists the confirmed EOAs for that chat and lets you unsubscribe.',
  'manage.loading': 'Loading your subscriptions…',
  'manage.empty': 'No confirmed subscriptions for this chat. Add one from the home page.',
  'manage.count': 'Watching {count} address(es):',
  'manage.confirmedAt': 'Confirmed {when}',
  'manage.onChain': 'on {chain}',
  'manage.remove': 'Remove',
  'manage.removing': 'Removing…',
  'manage.removed': 'Removed {eoa} on {chain}.',
  'manage.removeFailed': 'Could not remove {eoa} on {chain}. Try again.',
  'manage.invalidToken':
    'This manage link is not valid. Request a fresh one with /manage in the bot.',
  'manage.notFound': 'This manage link was revoked. Request a fresh one with /manage in the bot.',
  'manage.refresh': 'Refresh',

  // --------------------------------------------------------------------
  // Registry page
  // --------------------------------------------------------------------
  'registry.title': 'Registry browser',
  'registry.intro':
    'Browse current SetCodeRegistry classifications indexed from mainnet. Sort is newest-first by last classification update.',
  'registry.filter.all': 'All',
  'registry.filter.verified': 'Verified',
  'registry.filter.unknown': 'Unknown',
  'registry.filter.malicious': 'Malicious',
  'registry.loading': 'Loading registry entries…',
  'registry.empty': 'No registry entries match this filter yet.',
  'registry.reason': 'Reason',
  'registry.lastClassifiedAt': 'Last classified',
  'registry.prev': 'Previous',
  'registry.next': 'Next',
  'registry.page': 'Page {page}',
  'registry.refresh': 'Refresh',

  // --------------------------------------------------------------------
  // Shared errors
  // --------------------------------------------------------------------
  'error.network': 'Could not reach the service. Check your connection and try again.',
  'error.invalidAddress': 'That does not look like a valid Ethereum address.',
  'error.generic': 'Something went wrong. Please try again.',
} as const;

export type MessageKey = keyof typeof en;
