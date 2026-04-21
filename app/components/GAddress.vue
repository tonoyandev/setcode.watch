<script setup lang="ts">
import type { Address } from 'viem';
import { computed } from 'vue';

// Displays an EOA or contract address in monospace, truncated for long-form
// reading but with a native title attribute exposing the full value on hover.
// The full address is always selectable.
interface Props {
  address: Address | string;
  truncate?: boolean;
  leading?: number;
  trailing?: number;
}

const props = withDefaults(defineProps<Props>(), {
  truncate: true,
  leading: 6,
  trailing: 4,
});

const display = computed(() => {
  if (!props.truncate) return props.address;
  const full = props.address;
  if (full.length <= props.leading + props.trailing + 2) return full;
  return `${full.slice(0, props.leading)}…${full.slice(-props.trailing)}`;
});
</script>

<template>
  <code class="g-address" :title="address">{{ display }}</code>
</template>

<style scoped>
.g-address {
  font-family: var(--font-mono);
  font-size: 0.95em;
  padding: 2px var(--space-2);
  background: var(--color-bg-inset);
  border-radius: var(--radius-sm);
  color: var(--color-ink-strong);
  user-select: all;
  cursor: text;
}
</style>
