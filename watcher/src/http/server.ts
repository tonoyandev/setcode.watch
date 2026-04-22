import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { normaliseEoa } from '../lib/address.js';
import type { CheckService } from '../services/check.js';
import type { ConfirmationsService } from '../services/confirmations.js';
import type { ManageService } from '../services/manage.js';
import type { RegistryService } from '../services/registry.js';

export interface HttpServerOptions {
  service: ConfirmationsService;
  checkService: CheckService;
  manageService: ManageService;
  registryService: RegistryService;
  botUsername: string;
  corsOrigins: string[];
}

const createBody = z.object({
  eoa: z.string().min(1),
});

const removeBody = z.object({
  eoa: z.string().min(1),
});
const listRegistryQuery = z.object({
  classification: z.enum(['verified', 'unknown', 'malicious']).optional(),
  cursor: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// Tokens issued by the bot are UUIDv4. Accept anything in a reasonable
// opaque-token range so a future token format change doesn't force a
// regex update; resolve() is what actually gates access.
const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

export function createHttpApp({
  service,
  checkService,
  manageService,
  registryService,
  botUsername,
  corsOrigins,
}: HttpServerOptions) {
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: corsOrigins,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    }),
  );

  app.get('/health', (c) => c.json({ ok: true }));

  app.post('/confirmations', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const parsed = createBody.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const normalised = normaliseEoa(parsed.data.eoa);
    if (!normalised) return c.json({ error: 'invalid_eoa' }, 400);

    const { code, expiresAt } = await service.createPending({ eoa: normalised });
    const deepLink = `https://t.me/${botUsername}?start=${code}`;
    return c.json({
      code,
      deepLink,
      expiresAt: expiresAt.toISOString(),
    });
  });

  app.get('/manage/:token', async (c) => {
    const token = c.req.param('token');
    if (!TOKEN_RE.test(token)) return c.json({ error: 'invalid_token' }, 400);
    const lookup = await manageService.listSubscriptions(token);
    if (lookup.kind === 'not_found') return c.json({ error: 'not_found' }, 404);
    return c.json({
      subscriptions: lookup.subscriptions.map((s) => ({
        eoa: s.eoa,
        confirmedAt: s.confirmedAt.toISOString(),
      })),
    });
  });

  app.post('/manage/:token/remove', async (c) => {
    const token = c.req.param('token');
    if (!TOKEN_RE.test(token)) return c.json({ error: 'invalid_token' }, 400);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const parsed = removeBody.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const normalised = normaliseEoa(parsed.data.eoa);
    if (!normalised) return c.json({ error: 'invalid_eoa' }, 400);

    const result = await manageService.removeSubscription(token, normalised);
    if (result.kind === 'not_found') return c.json({ error: 'not_found' }, 404);
    return c.json({ removed: result.removed });
  });

  app.post('/check', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const parsed = createBody.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const normalised = normaliseEoa(parsed.data.eoa);
    if (!normalised) return c.json({ error: 'invalid_eoa' }, 400);

    const result = await checkService.check(normalised);
    return c.json({
      eoa: result.eoa,
      chainId: result.chainId,
      currentTarget: result.currentTarget,
      classification: result.classification,
      source: result.source,
      lastUpdated: result.lastUpdated,
    });
  });

  app.get('/registry', async (c) => {
    const parsed = listRegistryQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_query' }, 400);

    const input = {
      ...(parsed.data.classification ? { classification: parsed.data.classification } : {}),
      ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
      ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
    };
    const result = await registryService.list(input);
    return c.json({
      entries: result.entries.map((entry) => ({
        target: entry.target,
        classification: entry.classification,
        reason: entry.reason,
        lastClassifiedAt: entry.lastClassifiedAt,
      })),
      nextCursor: result.nextCursor,
    });
  });

  return app;
}
