import type { Address } from 'viem';
import { t } from '../i18n/index.js';
import { normaliseEoa } from '../lib/address.js';
import { CONFIRMATION_CODE_PREFIX, isConfirmationCode } from '../lib/code.js';
import type { ConfirmationsService } from '../services/confirmations.js';

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

export async function handleStart(
  service: ConfirmationsService,
  input: StartInput,
): Promise<HandlerReply> {
  const payload = input.payload?.trim();
  if (!payload) return { reply: t('welcome.noCode') };
  if (!payload.startsWith(CONFIRMATION_CODE_PREFIX) || !isConfirmationCode(payload)) {
    return { reply: t('welcome.unknownPayload') };
  }

  const result = await service.confirm({
    code: payload,
    chatId: input.chatId,
    username: input.username,
  });

  switch (result.kind) {
    case 'ok':
      return { reply: t('confirm.success', { eoa: result.eoa }) };
    case 'already_subscribed':
      return { reply: t('confirm.alreadySubscribed', { eoa: result.eoa }) };
    case 'cap_reached':
      return { reply: t('confirm.capReached', { max: result.max }) };
    case 'expired':
      return { reply: t('confirm.expired') };
    case 'not_found':
      return { reply: t('confirm.notFound') };
  }
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
  const body = rows.map((r) => `• ${r.eoa}`).join('\n');
  return { reply: `${header}\n${body}` };
}

export async function handleRemove(
  service: ConfirmationsService,
  input: CommandInput,
): Promise<HandlerReply> {
  const arg = input.args.trim();
  if (!arg) return { reply: t('remove.usage') };
  const addr: Address | null = normaliseEoa(arg);
  if (!addr) return { reply: t('remove.invalidEoa') };
  const removed = await service.remove({ eoa: addr, chatId: input.chatId });
  return {
    reply: removed ? t('remove.success', { eoa: addr }) : t('remove.notFound', { eoa: addr }),
  };
}
