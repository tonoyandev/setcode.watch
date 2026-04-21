import { ponder } from 'ponder:registry';
import { onChainSubscription, onChainSubscriptionState } from 'ponder:schema';

ponder.on('DelegationCanary:Subscribed', async ({ event, context }) => {
  await context.db.insert(onChainSubscription).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eoa: event.args.eoa,
    channelHash: event.args.channelHash,
    active: true,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });

  await context.db
    .insert(onChainSubscriptionState)
    .values({
      eoa: event.args.eoa,
      active: true,
      channelHash: event.args.channelHash,
      updatedAt: event.block.timestamp,
    })
    .onConflictDoUpdate({
      active: true,
      channelHash: event.args.channelHash,
      updatedAt: event.block.timestamp,
    });
});

ponder.on('DelegationCanary:Unsubscribed', async ({ event, context }) => {
  await context.db.insert(onChainSubscription).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eoa: event.args.eoa,
    channelHash: null,
    active: false,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });

  await context.db
    .insert(onChainSubscriptionState)
    .values({
      eoa: event.args.eoa,
      active: false,
      channelHash: null,
      updatedAt: event.block.timestamp,
    })
    .onConflictDoUpdate({
      active: false,
      channelHash: null,
      updatedAt: event.block.timestamp,
    });
});
