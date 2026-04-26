<script setup lang="ts">
import type { ChainMeta } from '~/composables/useChainCatalog';

defineProps<{ chain: ChainMeta }>();
</script>

<template>
  <span class="g-chain-icon" :aria-hidden="true">
    <span
      v-if="chain.icon === 'eth'"
      class="g-chain-icon__circle g-chain-icon__circle--eth"
      :class="{ 'g-chain-icon__circle--faded': chain.group === 'testnet' }"
    >
      <!-- Ethereum diamond — re-used across mainnet + Sepolia/Holesky/Hoodi.
           Testnets render with reduced opacity so mainnet stays the visual
           anchor of the table. -->
      <svg
        viewBox="0 0 32 32"
        width="18"
        height="18"
        fill="currentColor"
      >
        <path d="M16 3 9 16.4 16 21l7-4.6L16 3Zm-7 15.3L16 29l7-10.7L16 23l-7-4.7Z" />
      </svg>
    </span>
    <span
      v-else
      class="g-chain-icon__circle g-chain-icon__circle--mark"
      :style="{ background: chain.bg, color: chain.fg }"
    >
      {{ chain.mark }}
    </span>
  </span>
</template>

<style scoped>
.g-chain-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.g-chain-icon__circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-pill);
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: var(--weight-semibold);
  letter-spacing: -0.02em;
  flex-shrink: 0;
}

.g-chain-icon__circle--eth {
  background: var(--color-bg-subtle);
  color: var(--color-ink-strong);
  border: var(--border-width) solid var(--color-border);
}

.g-chain-icon__circle--faded {
  opacity: 0.55;
}

.g-chain-icon__circle--mark {
  border: 0;
}
</style>
