import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { normaliseEoa } from '../lib/address.js';
import type { ConfirmationsService } from '../services/confirmations.js';

export interface HttpServerOptions {
  service: ConfirmationsService;
  botUsername: string;
  corsOrigins: string[];
}

const createBody = z.object({
  eoa: z.string().min(1),
});

export function createHttpApp({ service, botUsername, corsOrigins }: HttpServerOptions) {
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

  return app;
}
