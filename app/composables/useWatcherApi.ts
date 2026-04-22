import type { Address } from 'viem';

// Response shape returned by watcher's POST /confirmations endpoint.
// Kept minimal — mirror changes here if watcher/src/http/server.ts changes.
export interface CreateConfirmationResponse {
  code: string;
  deepLink: string;
  expiresAt: string;
}

export type Classification = 'verified' | 'unknown' | 'malicious';
export type CheckSource = 'registry' | 'static' | 'unknown';

// Response shape for watcher's POST /check endpoint. Mirror if server.ts
// changes.
export interface CheckResponse {
  eoa: Address;
  chainId: number;
  currentTarget: Address | null;
  classification: Classification;
  source: CheckSource;
  lastUpdated: number | null;
}

// Error shape for the watcher API. `kind` matches the error strings the
// watcher returns so UI can branch on a stable enum rather than regex-match
// human-readable text.
export type WatcherApiError =
  | { kind: 'invalid_json' }
  | { kind: 'invalid_body' }
  | { kind: 'invalid_eoa' }
  | { kind: 'network' }
  | { kind: 'unknown'; status: number };

export class WatcherApiException extends Error {
  constructor(public readonly detail: WatcherApiError) {
    super(`watcher api error: ${detail.kind}`);
    this.name = 'WatcherApiException';
  }
}

interface WatcherApiClient {
  createConfirmation(eoa: Address): Promise<CreateConfirmationResponse>;
  check(eoa: Address): Promise<CheckResponse>;
}

// Thin wrapper over the watcher HTTP API. Uses Nuxt's ofetch under the hood
// (globally available as `$fetch`) so requests work identically on server and
// client. Base URL comes from runtimeConfig.public.watcherApiUrl so deploys
// can point at a prod watcher without rebuilding.
export function useWatcherApi(): WatcherApiClient {
  const config = useRuntimeConfig();
  const baseUrl = config.public.watcherApiUrl;

  async function createConfirmation(eoa: Address): Promise<CreateConfirmationResponse> {
    try {
      const response = await $fetch<CreateConfirmationResponse>('/confirmations', {
        baseURL: baseUrl,
        method: 'POST',
        body: { eoa },
      });
      return response;
    } catch (err: unknown) {
      throw new WatcherApiException(mapError(err));
    }
  }

  async function check(eoa: Address): Promise<CheckResponse> {
    try {
      return await $fetch<CheckResponse>('/check', {
        baseURL: baseUrl,
        method: 'POST',
        body: { eoa },
      });
    } catch (err: unknown) {
      throw new WatcherApiException(mapError(err));
    }
  }

  return { createConfirmation, check };
}

// Exported for unit tests. Keeping this as a pure function lets us verify the
// error classification without booting a Nuxt runtime just to exercise the
// composable shell.
export function mapError(err: unknown): WatcherApiError {
  if (typeof err !== 'object' || err === null) {
    return { kind: 'network' };
  }
  const { status, data } = err as {
    status?: number;
    data?: { error?: string };
  };

  if (status === undefined) return { kind: 'network' };

  const code = data?.error;
  if (code === 'invalid_json' || code === 'invalid_body' || code === 'invalid_eoa') {
    return { kind: code };
  }
  return { kind: 'unknown', status };
}
