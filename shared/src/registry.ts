import { getAddress, isAddress } from 'viem';
import type { Address } from 'viem';
import { z } from 'zod';
import registryData from './registry.json' with { type: 'json' };
import type { Classification, RegistryEntry, RegistryEntryVerified } from './types.js';

const addressSchema = z
  .string()
  .refine(isAddress, { message: 'invalid EVM address' })
  .transform((v) => getAddress(v) as Address);

const classificationSchema = z.enum(['unknown', 'verified', 'malicious']);

const verifiedEntrySchema = z.object({
  placeholder: z.literal(false),
  address: addressSchema,
  name: z.string().min(1),
  website: z.string().url().optional(),
  classification: classificationSchema,
  addedAt: z.string().datetime(),
  notes: z.string().optional(),
});

const placeholderEntrySchema = z.object({
  placeholder: z.literal(true),
  name: z.string().min(1),
  website: z.string().url().optional(),
  notes: z.string().min(1),
});

const entrySchema = z.discriminatedUnion('placeholder', [
  verifiedEntrySchema,
  placeholderEntrySchema,
]);

const registrySchema = z.array(entrySchema).superRefine((entries, ctx) => {
  const seen = new Set<string>();
  for (const [i, entry] of entries.entries()) {
    if (entry.placeholder) continue;
    const key = entry.address.toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [i, 'address'],
        message: `duplicate registry address: ${entry.address}`,
      });
    }
    seen.add(key);
  }
});

const parsed = registrySchema.parse(registryData);

export const REGISTRY: readonly RegistryEntry[] = parsed;

const addressIndex: Map<string, RegistryEntryVerified> = new Map();
for (const entry of parsed) {
  if (!entry.placeholder) {
    addressIndex.set(entry.address.toLowerCase(), entry);
  }
}

export function lookup(address: Address | string): RegistryEntryVerified | undefined {
  return addressIndex.get(address.toLowerCase());
}

export function classify(address: Address | string | null): Classification {
  if (address === null) return 'unknown';
  return lookup(address)?.classification ?? 'unknown';
}

export function getPendingRegistrations(): readonly RegistryEntry[] {
  return parsed.filter((e) => e.placeholder);
}

export function getVerifiedTargets(): readonly RegistryEntryVerified[] {
  return parsed.filter((e): e is RegistryEntryVerified => !e.placeholder);
}
