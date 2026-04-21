export const en = {
  'welcome.noCode':
    'Welcome to SetCode.watch. This bot delivers alerts when an EOA you are watching is delegated to a new contract under EIP-7702.\n\nTo subscribe, enter an address on https://setcode.watch and follow the confirmation link back here.',
  'welcome.unknownPayload':
    "Sorry, I don't recognise that start parameter. Enter an address on https://setcode.watch to get a fresh confirmation link.",
  'confirm.notFound':
    'That confirmation link is not valid. It may have been used already, or it expired. Request a new one on https://setcode.watch.',
  'confirm.expired':
    'That confirmation link has expired. Confirmations are valid for 5 minutes. Request a new one on https://setcode.watch.',
  'confirm.capReached':
    'You already have the maximum of {max} addresses subscribed in this chat. Remove one with /remove <address> before adding another.',
  'confirm.alreadySubscribed': 'You are already receiving alerts for {eoa} in this chat.',
  'confirm.success':
    'Subscribed. You will now receive alerts here when {eoa} is delegated to a new contract.',
  help: 'SetCode.watch bot — available commands:\n/list — show the EOAs you are watching in this chat\n/remove <address> — unsubscribe from an EOA\n/help — show this message\n\nSubscribe by entering an address on https://setcode.watch.',
  'list.empty':
    'You have no confirmed subscriptions in this chat. Add one on https://setcode.watch.',
  'list.header': 'You are watching {count} address(es) in this chat:',
  'remove.usage': 'Usage: /remove 0xYourAddress',
  'remove.invalidEoa': 'That does not look like a valid Ethereum address.',
  'remove.success':
    'Unsubscribed from {eoa}. You will no longer receive alerts for this address in this chat.',
  'remove.notFound': 'You were not subscribed to {eoa} in this chat.',
  'error.generic': 'Something went wrong handling that command. Please try again.',
  'alert.title.malicious': '⚠️ Malicious delegation detected',
  'alert.title.verified': '✅ Verified delegation change',
  'alert.title.unknown': '❔ New delegation target',
  'alert.title.revoked': 'ℹ️ Delegation revoked',
  'alert.body':
    '<b>{title}</b>\n\nAddress: <code>{eoa}</code>\nOld target: {oldTarget}\nNew target: {newTarget}\nTx: {txLink}',
  'alert.target.none': '<i>(none)</i>',
  'alert.target.value': '<code>{target}</code> — {classification}',
} as const;

export type MessageKey = keyof typeof en;
