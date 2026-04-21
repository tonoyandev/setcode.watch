export const DelegationCanaryAbi = [
  {
    type: 'event',
    name: 'Subscribed',
    inputs: [
      { name: 'eoa', type: 'address', indexed: true },
      { name: 'channelHash', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Unsubscribed',
    inputs: [{ name: 'eoa', type: 'address', indexed: true }],
    anonymous: false,
  },
] as const;
