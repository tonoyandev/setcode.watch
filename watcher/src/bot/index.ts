import { type Context, Telegraf } from 'telegraf';
import { t } from '../i18n/index.js';
import type { ConfirmationsService } from '../services/confirmations.js';
import { handleHelp, handleList, handleRemove, handleStart } from './handlers.js';

export interface BotOptions {
  token: string;
  service: ConfirmationsService;
}

function chatIdOf(ctx: Context): bigint | null {
  const id = ctx.chat?.id;
  return typeof id === 'number' ? BigInt(id) : null;
}

function commandArgs(ctx: Context, command: string): string {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const withoutSlash = text.slice(`/${command}`.length);
  return withoutSlash.replace(/^@[^\s]+/, '').trim();
}

export function createBot({ token, service }: BotOptions): Telegraf {
  const bot = new Telegraf(token);

  bot.start(async (ctx) => {
    const chatId = chatIdOf(ctx);
    if (chatId === null) return;
    const { reply } = await handleStart(service, {
      payload: ctx.startPayload || undefined,
      chatId,
      username: ctx.from?.username ?? null,
    });
    await ctx.reply(reply);
  });

  bot.help(async (ctx) => {
    const { reply } = await handleHelp();
    await ctx.reply(reply);
  });

  bot.command('list', async (ctx) => {
    const chatId = chatIdOf(ctx);
    if (chatId === null) return;
    const { reply } = await handleList(service, { chatId, args: commandArgs(ctx, 'list') });
    await ctx.reply(reply);
  });

  bot.command('remove', async (ctx) => {
    const chatId = chatIdOf(ctx);
    if (chatId === null) return;
    const { reply } = await handleRemove(service, { chatId, args: commandArgs(ctx, 'remove') });
    await ctx.reply(reply);
  });

  bot.catch(async (err, ctx) => {
    console.error('[setcode/watcher] bot handler error:', err);
    try {
      await ctx.reply(t('error.generic'));
    } catch (replyErr) {
      console.error('[setcode/watcher] failed to send error reply:', replyErr);
    }
  });

  return bot;
}
