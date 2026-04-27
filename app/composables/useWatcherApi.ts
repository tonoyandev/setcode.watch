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

// Response shape for watcher's GET /manage/:token endpoint. Mirror if
// server.ts changes.
export interface ManageSubscription {
  eoa: Address;
  chainId: number;
  confirmedAt: string;
}
export interface ManageListResponse {
  subscriptions: ManageSubscription[];
}

// Response shape for watcher's POST /manage/:token/remove endpoint.
export interface ManageRemoveResponse {
  removed: boolean;
}

export interface RegistryEntry {
  target: Address;
  classification: Classification;
  reason: string;
  lastClassifiedAt: number;
}
export interface RegistryListResponse {
  entries: RegistryEntry[];
  nextCursor: number | null;
}

// Error shape for the watcher API. `kind` matches the error strings the
// watcher returns so UI can branch on a stable enum rather than regex-match
// human-readable text.
export type WatcherApiError =
  | { kind: 'invalid_json' }
  | { kind: 'invalid_body' }
  | { kind: 'invalid_eoa' }
  | { kind: 'invalid_token' }
  | { kind: 'invalid_query' }
  | { kind: 'unsupported_chain' }
  | { kind: 'not_found' }
  | { kind: 'network' }
  | { kind: 'unknown'; status: number };

export class WatcherApiException extends Error {
  constructor(public readonly detail: WatcherApiError) {
    super(`watcher api error: ${detail.kind}`);
    this.name = 'WatcherApiException';
  }
}

interface WatcherApiClient {
  createConfirmation(eoa: Address, chainId: number): Promise<CreateConfirmationResponse>;
  check(eoa: Address, chainId: number): Promise<CheckResponse>;
  listManage(token: string): Promise<ManageListResponse>;
  removeManage(token: string, eoa: Address, chainId: number): Promise<ManageRemoveResponse>;
  listRegistry(input?: {
    classification?: Classification;
    cursor?: number;
    limit?: number;
  }): Promise<RegistryListResponse>;
}

// Thin wrapper over the watcher HTTP API. Uses Nuxt's ofetch under the hood
// (globally available as `$fetch`) so requests work identically on server and
// client. Base URL comes from runtimeConfig.public.watcherApiUrl so deploys
// can point at a prod watcher without rebuilding.
export function useWatcherApi(): WatcherApiClient {
  const config = useRuntimeConfig();
  const baseUrl = config.public.watcherApiUrl;

  async function createConfirmation(
    eoa: Address,
    chainId: number,
  ): Promise<CreateConfirmationResponse> {
    try {
      const response = await $fetch<CreateConfirmationResponse>('/confirmations', {
        baseURL: baseUrl,
        method: 'POST',
        body: { eoa, chainId },
      });
      return response;
    } catch (err: unknown) {
      throw new WatcherApiException(mapError(err));
    }
  }

  async function check(eoa: Address, chainId: number): Promise<CheckResponse> {
    try {
      return await $fetch<CheckResponse>('/check', {
        baseURL: baseUrl,
        method: 'POST',
        body: { eoa, chainId },
      });
    } catch (err: unknown) {
      throw new WatcherApiException(mapError(err));
    }
  }

  async function listManage(token: string): Promise<ManageListResponse> {
    try {
      return await $fetch<ManageListResponse>(`/manage/${token}`, {
        baseURL: baseUrl,
        method: 'GET',
      });
    } catch (err: unknown) {
      throw new WatcherApiException(mapError(err));
    }
  }

  async function removeManage(
    token: string,
    eoa: Address,
    chainId: number,
  ): Promise<ManageRemoveResponse> {
    try {
      return await $fetch<ManageRemoveResponse>(`/manage/${token}/remove`, {
        baseURL: baseUrl,
        method: 'POST',
        body: { eoa, chainId },
      });
    } catch (err: unknown) {
      throw new WatcherApiException(mapError(err));
    }
  }

  async function listRegistry(
    input: {
      classification?: Classification;
      cursor?: number;
      limit?: number;
    } = {},
  ): Promise<RegistryListResponse> {
    const params = new URLSearchParams();
    if (input.classification) params.set('classification', input.classification);
    if (input.cursor !== undefined) params.set('cursor', String(input.cursor));
    if (input.limit !== undefined) params.set('limit', String(input.limit));
    const query = params.toString();
    const path = query.length > 0 ? `/registry?${query}` : '/registry';

    try {
      return await $fetch<RegistryListResponse>(path, {
        baseURL: baseUrl,
        method: 'GET',
      });
    } catch (err: unknown) {
      throw new WatcherApiException(mapError(err));
    }
  }

  return { createConfirmation, check, listManage, removeManage, listRegistry };
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
  if (
    code === 'invalid_json' ||
    code === 'invalid_body' ||
    code === 'invalid_eoa' ||
    code === 'invalid_token' ||
    code === 'invalid_query' ||
    code === 'unsupported_chain' ||
    code === 'not_found'
  ) {
    return { kind: code };
  }
  return { kind: 'unknown', status };
}
