export const SetCodeRegistryAbi = [
  {
    type: 'event',
    name: 'Classified',
    inputs: [
      { name: 'target', type: 'address', indexed: true },
      { name: 'classification', type: 'uint8', indexed: true },
      { name: 'reason', type: 'string', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MaliciousDowngraded',
    inputs: [
      { name: 'target', type: 'address', indexed: true },
      { name: 'newClassification', type: 'uint8', indexed: true },
      { name: 'reason', type: 'string', indexed: false },
    ],
    anonymous: false,
  },
] as const;
