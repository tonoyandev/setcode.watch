import type { Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  authorizationTargetToDelegation,
  decodeDelegationTarget,
  isDelegationDesignator,
} from '../delegation.js';

const TARGET = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const ZERO = '0x0000000000000000000000000000000000000000';

describe('isDelegationDesignator', () => {
  it('accepts valid designator', () => {
    const code = `0xef0100${TARGET.slice(2)}` as Hex;
    expect(isDelegationDesignator(code)).toBe(true);
  });

  it('rejects wrong prefix', () => {
    const code = `0xef0200${TARGET.slice(2)}` as Hex;
    expect(isDelegationDesignator(code)).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isDelegationDesignator('0xef0100ab' as Hex)).toBe(false);
  });

  it('rejects empty or null', () => {
    expect(isDelegationDesignator(null)).toBe(false);
    expect(isDelegationDesignator(undefined)).toBe(false);
    expect(isDelegationDesignator('0x' as Hex)).toBe(false);
  });
});

describe('decodeDelegationTarget', () => {
  it('returns checksummed target for valid designator', () => {
    const code = `0xef0100${TARGET.slice(2)}` as Hex;
    const result = decodeDelegationTarget(code);
    expect(result).toBeTruthy();
    expect(result?.toLowerCase()).toBe(TARGET.toLowerCase());
  });

  it('returns null for zero target', () => {
    const code = `0xef0100${ZERO.slice(2)}` as Hex;
    expect(decodeDelegationTarget(code)).toBeNull();
  });

  it('returns null for non-designator', () => {
    expect(decodeDelegationTarget('0x1234' as Hex)).toBeNull();
    expect(decodeDelegationTarget(null)).toBeNull();
  });
});

describe('authorizationTargetToDelegation', () => {
  it('returns null for zero address', () => {
    expect(authorizationTargetToDelegation(ZERO)).toBeNull();
  });

  it('returns checksummed address otherwise', () => {
    const result = authorizationTargetToDelegation(TARGET);
    expect(result?.toLowerCase()).toBe(TARGET.toLowerCase());
  });
});
