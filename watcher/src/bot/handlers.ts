import { CHAIN_ID_MAINNET, SUPPORTED_CHAINS, getChainById } from '@setcode/shared';
import { type Address, isAddress } from 'viem';
import { t } from '../i18n/index.js';
import { normaliseEoa } from '../lib/address.js';
import {
  CONFIRMATION_CODE_PREFIX,
  WATCH_PAYLOAD_PREFIX,
  isConfirmationCode,
  parseWatchPayload,
} from '../lib/code.js';
import type { CheckService } from '../services/check.js';
import type { ConfirmationsService } from '../services/confirmations.js';
import type { ManageService } from '../services/manage.js';

function chainLabel(chainId: number): string {
  return getChainById(chainId)?.name ?? `chain ${chainId}`;
}

function resolveChainShortName(raw: string | undefined): number | null {
  if (!raw) return null;
  const needle = raw.toLowerCase();
  const hit = SUPPORTED_CHAINS.find((c) => c.shortName.toLowerCase() === needle);
  return hit?.id ?? null;
}

function formatSubscriptionLine(eoa: string, chainId: number): string {
  // Mainnet rows omit the chain suffix to match the legacy display
  // (subscribers from before this change all default to chain 1, so the
  // chain prefix would be visual noise on the common path).
  if (chainId === CHAIN_ID_MAINNET) return `• ${eoa}`;
  return `• ${eoa} (${chainLabel(chainId)})`;
}

export interface StartInput {
  payload: string | undefined;
  chatId: bigint;
  username: string | null;
}

export interface CommandInput {
  chatId: bigint;
  args: string;
}

export interface HandlerReply {
  reply: string;
}

// The bot accepts two start-payload families:
//   c_<16-chars>  — confirmation of a pending web-initiated subscription
//   w_<0x40-hex>  — one-off "Watch" peek: reply with current classification
// Anything else falls to the generic unknown-payload message.
export async function handleStart(
  confirmations: ConfirmationsService,
  check: CheckService,
  input: StartInput,
): Promise<HandlerReply> {
  const payload = input.payload?.trim();
  if (!payload) return { reply: t('welcome.noCode') };

  if (payload.startsWith(CONFIRMATION_CODE_PREFIX)) {
    if (!isConfirmationCode(payload)) return { reply: t('welcome.unknownPayload') };
    const result = await confirmations.confirm({
      code: payload,
      chatId: input.chatId,
      username: input.username,
    });
    switch (result.kind) {
      case 'ok':
        return {
          reply: t('confirm.success', {
            eoa: result.eoa,
            chain: chainLabel(result.chainId),
          }),
        };
      case 'already_subscribed':
        return {
          reply: t('confirm.alreadySubscribed', {
            eoa: result.eoa,
            chain: chainLabel(result.chainId),
          }),
        };
      case 'cap_reached':
        return { reply: t('confirm.capReached', { max: result.max }) };
      case 'expired':
        return { reply: t('confirm.expired') };
      case 'not_found':
        return { reply: t('confirm.notFound') };
    }
  }

  if (payload.startsWith(WATCH_PAYLOAD_PREFIX)) {
    const body = parseWatchPayload(payload);
    if (!body || !isAddress(body.address)) return { reply: t('welcome.unknownPayload') };
    const eoa = body.address as Address;
    const result = await check.check(eoa, body.chainId);
    const targetLine =
      result.currentTarget === null
        ? t('watch.noDelegation')
        : t('watch.delegatesTo', { target: result.currentTarget });
    const classificationLabel =
      result.classification === 'verified'
        ? t('watch.class.verified')
        : result.classification === 'malicious'
          ? t('watch.class.malicious')
          : t('watch.class.unknown');
    return {
      reply: t('watch.reply', {
        eoa,
        chain: chainLabel(body.chainId),
        classification: classificationLabel,
        target: targetLine,
      }),
    };
  }

  return { reply: t('welcome.unknownPayload') };
}

export async function handleHelp(): Promise<HandlerReply> {
  return { reply: t('help') };
}

export async function handleList(
  service: ConfirmationsService,
  input: CommandInput,
): Promise<HandlerReply> {
  const rows = await service.list(input.chatId);
  if (rows.length === 0) return { reply: t('list.empty') };
  const header = t('list.header', { count: rows.length });
  const body = rows.map((r) => formatSubscriptionLine(r.eoa, r.chainId)).join('\n');
  return { reply: `${header}\n${body}` };
}

export async function handleManage(
  service: ManageService,
  input: CommandInput,
): Promise<HandlerReply> {
  const { url } = await service.issue(input.chatId);
  return { reply: `${t('manage.revoked')}\n\n${t('manage.link', { url })}` };
}

export async function handleRemove(
  service: ConfirmationsService,
  input: CommandInput,
): Promise<HandlerReply> {
  const args = input.args.trim().split(/\s+/).filter(Boolean);
  const [rawAddr, rawChain] = args;
  if (!rawAddr) return { reply: t('remove.usage') };
  const addr: Address | null = normaliseEoa(rawAddr);
  if (!addr) return { reply: t('remove.invalidEoa') };

  // Second arg is the chain shortName from SUPPORTED_CHAINS (e.g. `base`,
  // `op`, `arb1`, `eth`). Omitted → mainnet, matching the pre-multi-chain
  // shorthand. Unknown short names fall back to mainnet rather than
  // erroring so users don't get tripped up by capitalisation; the lookup
  // miss simply won't match any row and reports "not subscribed".
  const chainId = resolveChainShortName(rawChain) ?? CHAIN_ID_MAINNET;
  const removed = await service.remove({ eoa: addr, chainId, chatId: input.chatId });
  return {
    reply: removed
      ? t('remove.success', { eoa: addr, chain: chainLabel(chainId) })
      : t('remove.notFound', { eoa: addr, chain: chainLabel(chainId) }),
  };
}
