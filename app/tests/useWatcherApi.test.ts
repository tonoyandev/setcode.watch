import { describe, expect, it } from 'vitest';
import { WatcherApiException, mapError } from '~/composables/useWatcherApi';

describe('mapError', () => {
  it('maps watcher error bodies to their typed kind', () => {
    expect(mapError({ status: 400, data: { error: 'invalid_eoa' } })).toEqual({
      kind: 'invalid_eoa',
    });
    expect(mapError({ status: 400, data: { error: 'invalid_body' } })).toEqual({
      kind: 'invalid_body',
    });
    expect(mapError({ status: 400, data: { error: 'invalid_json' } })).toEqual({
      kind: 'invalid_json',
    });
    expect(mapError({ status: 400, data: { error: 'invalid_token' } })).toEqual({
      kind: 'invalid_token',
    });
    expect(mapError({ status: 400, data: { error: 'invalid_query' } })).toEqual({
      kind: 'invalid_query',
    });
    expect(mapError({ status: 400, data: { error: 'unsupported_chain' } })).toEqual({
      kind: 'unsupported_chain',
    });
    expect(mapError({ status: 404, data: { error: 'not_found' } })).toEqual({
      kind: 'not_found',
    });
  });

  it('falls back to "network" when the error has no status', () => {
    expect(mapError(new Error('fetch failed'))).toEqual({ kind: 'network' });
    expect(mapError(null)).toEqual({ kind: 'network' });
  });

  it('maps unexpected statuses to the unknown bucket with the status preserved', () => {
    expect(mapError({ status: 500, data: {} })).toEqual({ kind: 'unknown', status: 500 });
    expect(mapError({ status: 502 })).toEqual({ kind: 'unknown', status: 502 });
  });
});

describe('WatcherApiException', () => {
  it('carries the structured detail on the instance', () => {
    const ex = new WatcherApiException({ kind: 'invalid_eoa' });
    expect(ex).toBeInstanceOf(Error);
    expect(ex.detail).toEqual({ kind: 'invalid_eoa' });
    expect(ex.name).toBe('WatcherApiException');
  });
});
