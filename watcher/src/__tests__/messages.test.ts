import type { Address, Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { buildAlertMessage } from '../services/messages.js';

const EOA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const OLD = '0x1111111111111111111111111111111111111111' as Address;
const NEW = '0x2222222222222222222222222222222222222222' as Address;
const TX = `0x${'d'.repeat(64)}` as Hex;

describe('buildAlertMessage', () => {
  it('headlines malicious when the new target is malicious', () => {
    const { html } = buildAlertMessage({
      eoa: EOA,
      oldTarget: OLD,
      newTarget: NEW,
      oldClassification: 'unknown',
      newClassification: 'malicious',
      chainId: 1,
      txHash: TX,
    });
    expect(html).toMatch(/Malicious delegation detected/);
    expect(html).toContain(EOA);
    expect(html).toContain(NEW);
    expect(html).toContain('malicious');
  });

  it('headlines verified for a verified upgrade', () => {
    const { html } = buildAlertMessage({
      eoa: EOA,
      oldTarget: null,
      newTarget: NEW,
      oldClassification: 'unknown',
      newClassification: 'verified',
      chainId: 1,
      txHash: TX,
    });
    expect(html).toMatch(/Verified delegation change/);
    expect(html).toMatch(/\(none\)/);
  });

  it('headlines revoked when the new target is null regardless of old class', () => {
    const { html } = buildAlertMessage({
      eoa: EOA,
      oldTarget: OLD,
      newTarget: null,
      oldClassification: 'malicious',
      newClassification: 'unknown',
      chainId: 1,
      txHash: TX,
    });
    expect(html).toMatch(/Delegation revoked/);
  });

  it('renders the etherscan tx link for mainnet', () => {
    const { html } = buildAlertMessage({
      eoa: EOA,
      oldTarget: null,
      newTarget: NEW,
      oldClassification: 'unknown',
      newClassification: 'unknown',
      chainId: 1,
      txHash: TX,
    });
    expect(html).toMatch(/https:\/\/etherscan.io\/tx\//);
  });

  it('falls back to a code tag on an unknown chain', () => {
    const { html } = buildAlertMessage({
      eoa: EOA,
      oldTarget: null,
      newTarget: NEW,
      oldClassification: 'unknown',
      newClassification: 'unknown',
      chainId: 999,
      txHash: TX,
    });
    expect(html).not.toMatch(/etherscan/);
    expect(html).toContain(TX);
  });
});
