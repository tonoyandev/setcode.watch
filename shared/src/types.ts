import type { Address, Hex } from 'viem';

export const CLASSIFICATIONS = ['unknown', 'verified', 'malicious'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const CLASSIFICATION_ENUM: Record<Classification, 0 | 1 | 2> = {
  unknown: 0,
  verified: 1,
  malicious: 2,
};

export interface DelegationState {
  eoa: Address;
  chainId: number;
  target: Address | null;
  updatedAt: bigint;
}

export interface DelegationEvent {
  id: string;
  eoa: Address;
  previousTarget: Address | null;
  newTarget: Address | null;
  chainId: number;
  blockNumber: bigint;
  timestamp: bigint;
  txHash: Hex;
}

export interface Subscription {
  id: number;
  eoa: Address;
  telegramChatId: bigint;
  telegramUsername: string | null;
  confirmed: boolean;
  createdAt: Date;
}

export interface PendingConfirmation {
  code: string;
  eoa: Address;
  telegramChatId: bigint;
  expiresAt: Date;
}

export interface AlertEvent {
  eoa: Address;
  oldTarget: Address | null;
  newTarget: Address | null;
  oldClassification: Classification;
  newClassification: Classification;
  chainId: number;
  txHash: Hex;
  blockNumber: bigint;
  detectedAt: Date;
}

export type RegistryEntry = RegistryEntryVerified | RegistryEntryPlaceholder;

export interface RegistryEntryVerified {
  placeholder: false;
  address: Address;
  name: string;
  website?: string | undefined;
  classification: Classification;
  addedAt: string;
  notes?: string | undefined;
}

export interface RegistryEntryPlaceholder {
  placeholder: true;
  name: string;
  website?: string | undefined;
  notes: string;
}
