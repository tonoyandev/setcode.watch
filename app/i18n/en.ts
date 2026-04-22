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
  // Check page
  // --------------------------------------------------------------------
  'check.title': 'Check an address',
  'check.intro':
    'Paste any Ethereum EOA. We will return its current EIP-7702 delegation target, if any, and the classification from our registry.',
  'check.input.label': 'Address',
  'check.input.placeholder': '0x…',
  'check.submit': 'Check',
  'check.submitting': 'Checking…',
  'check.reset': 'Check another',

  'check.result.title': 'Result',
  'check.result.delegatesTo': 'Delegates to',
  'check.result.noDelegation': 'This address has no active EIP-7702 delegation.',
  'check.result.lastUpdated': 'Last updated',
  'check.result.source.registry': 'Match from the on-chain SetCodeRegistry.',
  'check.result.source.static': 'Match from the committed static registry.',
  'check.result.source.unknown': 'No match in either registry — treat with caution.',
  'check.result.subscribeCta': 'Subscribe to alerts for this address',

  // --------------------------------------------------------------------
  // Subscribe page
  // --------------------------------------------------------------------
  'subscribe.title': 'Subscribe to alerts',
  'subscribe.intro':
    'Paste an EOA and confirm it from Telegram. The chat you confirm from starts receiving a note every time this address is delegated or revoked.',
  'subscribe.input.label': 'Address to watch',
  'subscribe.input.placeholder': '0x…',
  'subscribe.submit': 'Generate confirmation link',
  'subscribe.submitting': 'Preparing link…',
  'subscribe.reset': 'Start over',

  'subscribe.result.title': 'Open this link in Telegram',
  'subscribe.result.body':
    'Tap the button to open a pre-filled conversation with the bot. The chat you confirm from becomes the subscriber for this address.',
  'subscribe.result.cta': 'Open in Telegram',
  'subscribe.result.copyCode': 'Copy code',
  'subscribe.result.copied': 'Copied',
  'subscribe.result.expiresIn': 'Expires in {seconds}s',
  'subscribe.result.expired': 'This link has expired. Generate a new one.',
  'subscribe.result.fallback':
    'If the button does not work, send this code to @{bot} as a message starting with /start.',

  'subscribe.error.cannotSendTelegram':
    'We could not create a confirmation link. Try again in a moment.',

  // --------------------------------------------------------------------
  // Manage page (token-gated list + remove for a chat's subscriptions)
  // --------------------------------------------------------------------
  'manage.title': 'Manage your subscriptions',
  'manage.intro':
    'This page is authorised by the token in the URL your bot handed you. It lists the confirmed EOAs for that chat and lets you unsubscribe.',
  'manage.loading': 'Loading your subscriptions…',
  'manage.empty': 'No confirmed subscriptions for this chat. Add one from the subscribe page.',
  'manage.count': 'Watching {count} address(es):',
  'manage.confirmedAt': 'Confirmed {when}',
  'manage.remove': 'Remove',
  'manage.removing': 'Removing…',
  'manage.removed': 'Removed {eoa}.',
  'manage.removeFailed': 'Could not remove {eoa}. Try again.',
  'manage.invalidToken':
    'This manage link is not valid. Request a fresh one with /manage in the bot.',
  'manage.notFound': 'This manage link was revoked. Request a fresh one with /manage in the bot.',
  'manage.refresh': 'Refresh',

  // --------------------------------------------------------------------
  // Shared errors
  // --------------------------------------------------------------------
  'error.network': 'Could not reach the service. Check your connection and try again.',
  'error.invalidAddress': 'That does not look like a valid Ethereum address.',
  'error.generic': 'Something went wrong. Please try again.',
} as const;

export type MessageKey = keyof typeof en;
