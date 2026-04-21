import { getChainById } from '@setcode/shared/chains';
import type { Classification } from '@setcode/shared/types';
import type { Address, Hex } from 'viem';
import { t } from '../i18n/index.js';

export interface AlertInput {
  eoa: Address;
  oldTarget: Address | null;
  newTarget: Address | null;
  oldClassification: Classification;
  newClassification: Classification;
  chainId: number;
  txHash: Hex;
}

export interface AlertMessage {
  html: string;
}

// Alert headline is driven by the *new* target's classification, except when
// the delegation has been revoked (newTarget === null) — that is always a
// neutral "revoked" notice regardless of how the old target was classified.
function pickTitleKey(input: AlertInput) {
  if (input.newTarget === null) return 'alert.title.revoked' as const;
  switch (input.newClassification) {
    case 'malicious':
      return 'alert.title.malicious' as const;
    case 'verified':
      return 'alert.title.verified' as const;
    default:
      return 'alert.title.unknown' as const;
  }
}

function renderTarget(target: Address | null, classification: Classification): string {
  if (target === null) return t('alert.target.none');
  return t('alert.target.value', { target, classification });
}

function renderTxLink(chainId: number, txHash: Hex): string {
  const chain = getChainById(chainId);
  if (!chain) return `<code>${txHash}</code>`;
  const url = chain.explorerTxPath(txHash);
  return `<a href="${url}">${chain.shortName}:${txHash.slice(0, 10)}…</a>`;
}

export function buildAlertMessage(input: AlertInput): AlertMessage {
  const title = t(pickTitleKey(input));
  const html = t('alert.body', {
    title,
    eoa: input.eoa,
    oldTarget: renderTarget(input.oldTarget, input.oldClassification),
    newTarget: renderTarget(input.newTarget, input.newClassification),
    txLink: renderTxLink(input.chainId, input.txHash),
  });
  return { html };
}
