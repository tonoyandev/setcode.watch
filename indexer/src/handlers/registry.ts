import { ponder } from 'ponder:registry';
import { registryClassification, registryClassificationState } from 'ponder:schema';

const CLASSIFICATION_LABELS = ['Unknown', 'Verified', 'Malicious'] as const;

function labelOf(raw: number): (typeof CLASSIFICATION_LABELS)[number] {
  const label = CLASSIFICATION_LABELS[raw];
  if (!label) throw new Error(`unknown classification enum value: ${raw}`);
  return label;
}

ponder.on('SetCodeRegistry:Classified', async ({ event, context }) => {
  const label = labelOf(Number(event.args.classification));

  await context.db.insert(registryClassification).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    target: event.args.target,
    classification: label,
    reason: event.args.reason,
    isDowngrade: false,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });

  await context.db
    .insert(registryClassificationState)
    .values({
      target: event.args.target,
      current: label,
      reason: event.args.reason,
      updatedAt: event.block.timestamp,
    })
    .onConflictDoUpdate({
      current: label,
      reason: event.args.reason,
      updatedAt: event.block.timestamp,
    });
});

ponder.on('SetCodeRegistry:MaliciousDowngraded', async ({ event, context }) => {
  const label = labelOf(Number(event.args.newClassification));

  await context.db.insert(registryClassification).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    target: event.args.target,
    classification: label,
    reason: event.args.reason,
    isDowngrade: true,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });

  await context.db
    .insert(registryClassificationState)
    .values({
      target: event.args.target,
      current: label,
      reason: event.args.reason,
      updatedAt: event.block.timestamp,
    })
    .onConflictDoUpdate({
      current: label,
      reason: event.args.reason,
      updatedAt: event.block.timestamp,
    });
});
