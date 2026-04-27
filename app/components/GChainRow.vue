<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';
import type { Address } from 'viem';
import { computed, ref, watch } from 'vue';
import type { ChainMeta } from '~/composables/useChainCatalog';
import { useInView } from '~/composables/useInView';
import {
  type CheckResponse,
  WatcherApiException,
  useWatcherApi,
} from '~/composables/useWatcherApi';
import { t } from '~/i18n';

interface Props {
  chain: ChainMeta;
  // null means "no address entered yet" — row stays in idle state.
  address: Address | null;
  // Monitored chains expose Subscribe/Watch CTAs in the actions cell.
  // Unmonitored chains hide them entirely — we have no indexer for those
  // so subscribing would never deliver alerts.
  subscribing?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  subscribing: false,
});

const emit = defineEmits<{
  // Subscribe carries chainId so the page can mint a confirmation scoped
  // to the right chain (multi-chain support — each row's CTA targets its
  // own chain, not just mainnet).
  (e: 'subscribe', payload: { chainId: number }): void;
  // Bubbled up so the page can disable the CTA when no delegation is
  // present on mainnet, without needing to peek into row internals.
  (e: 'classified', payload: { chainId: number; result: CheckResponse }): void;
  // Fired when the user clicks the "Enter an address above" hint in the
  // idle state — page focuses the lookup input so they can start typing
  // without scrolling back up.
  (e: 'focusInput'): void;
}>();

const api = useWatcherApi();
const config = useRuntimeConfig();
const botUsername = config.public.botUsername;
const rowEl = ref<HTMLTableRowElement | null>(null);
const { hasBeenInView } = useInView(rowEl);

// The visible state machine for one chain. Drives the status cell only.
type Status =
  | { kind: 'idle' } // no address yet
  | { kind: 'queued' } // address present, row not yet in viewport
  | { kind: 'checking' } // request in flight (or visual delay for unmonitored)
  | { kind: 'notDetected' }
  | { kind: 'classified'; classification: CheckResponse['classification'] };

const status = ref<Status>({ kind: 'idle' });

async function performCheck(addr: Address) {
  status.value = { kind: 'checking' };

  if (!props.chain.monitored) {
    // Non-indexed chain — we don't actually call the API, but a brief
    // delay keeps the row's UX in sync with monitored chains so the
    // table doesn't snap to "Not Detected" instantly (which reads as
    // "we didn't even try"). 220–420ms is short enough not to feel laggy.
    await new Promise((r) => setTimeout(r, 220 + Math.random() * 200));
    status.value = { kind: 'notDetected' };
    return;
  }

  try {
    const result = await api.check(addr, props.chain.id);
    if (!result.currentTarget) {
      status.value = { kind: 'notDetected' };
      return;
    }
    status.value = { kind: 'classified', classification: result.classification };
    emit('classified', { chainId: props.chain.id, result });
  } catch (err) {
    // Treat watcher errors as "Not Detected" at the row level — the
    // page-level error banner shows the human message; the row stays
    // visually consistent with chains that genuinely have no data.
    status.value = { kind: 'notDetected' };
    if (!(err instanceof WatcherApiException)) {
      // eslint-disable-next-line no-console
      console.error('[GChainRow] unexpected check error', err);
    }
  }
}

// Address changes (incl. clear): reset to either idle or queued. If the
// row is already in view, fire immediately; otherwise the visibility
// watcher below will pick it up when the user scrolls to it.
watch(
  () => props.address,
  (addr) => {
    if (!addr) {
      status.value = { kind: 'idle' };
      return;
    }
    status.value = { kind: 'queued' };
    if (hasBeenInView.value) {
      void performCheck(addr);
    }
  },
);

// Visibility transition: fire the check the first time the row scrolls
// into the viewport (only if there's an address waiting on it).
watch(
  hasBeenInView,
  (seen) => {
    if (seen && status.value.kind === 'queued' && props.address) {
      void performCheck(props.address);
    }
  },
  { immediate: true },
);

const showActions = computed(() => props.chain.monitored);
const subscribeDisabled = computed(() => status.value.kind !== 'classified' || props.subscribing);
const watchVisible = computed(() => status.value.kind === 'classified');

// Bot deep-link uses the multi-chain payload format `w_<chainId>_<addr>`.
// Built per-row so each chain's Watch CTA targets its own chainId; the
// bot resolves it back via parseWatchPayload(). Empty string until the
// row has both an address to watch and a classification (matches the
// previous "Watch" affordance which only appeared after classification).
const watchLink = computed(() => {
  const addr = props.address;
  if (!addr || !watchVisible.value) return '';
  return `https://t.me/${botUsername}?start=w_${props.chain.id}_${addr}`;
});
</script>

<template>
  <tr ref="rowEl" class="g-chain-row">
    <td class="g-chain-row__cell g-chain-row__cell--chain">
      <GChainIcon :chain="chain" />
      <span class="g-chain-row__name">{{ chain.name }}</span>
    </td>
    <td class="g-chain-row__cell g-chain-row__cell--status">
      <template v-if="status.kind === 'idle'">
        <button
          type="button"
          class="g-chain-row__faint g-chain-row__faintBtn"
          @click.stop="emit('focusInput')"
        >
          {{ t('home.table.awaitingInput') }}
        </button>
      </template>
      <template v-else-if="status.kind === 'queued' || status.kind === 'checking'">
        <span class="g-chain-row__muted">
          <Loader2 :size="14" class="g-chain-row__spin" aria-hidden="true" />
          {{ t('home.table.checking') }}
        </span>
      </template>
      <template v-else-if="status.kind === 'classified'">
        <GBadge :classification="status.classification" size="inline" />
      </template>
      <template v-else>
        <span class="g-chain-row__muted">
          <span class="g-chain-row__dot" aria-hidden="true" />
          {{ t('home.table.notDetected') }}
        </span>
      </template>
    </td>
    <td class="g-chain-row__cell g-chain-row__cell--actions">
      <div v-if="showActions" class="g-chain-row__actions">
        <GButton
          type="button"
          size="sm"
          variant="primary"
          :disabled="subscribeDisabled"
          :loading="subscribing ?? false"
          @click.stop="emit('subscribe', { chainId: chain.id })"
        >
          {{ t('home.cta.subscribe') }}
        </GButton>
        <GButton
          v-if="watchVisible && watchLink"
          as="a"
          :href="watchLink"
          size="sm"
          variant="secondary"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t('home.cta.watch') }}
        </GButton>
      </div>
      <span v-else class="g-chain-row__faint g-chain-row__faint--right">
        {{ t('home.table.alertsUnsupported') }}
      </span>
    </td>
  </tr>
</template>

<style scoped>
.g-chain-row {
  border-bottom: var(--border-width) solid var(--color-border);
}

.g-chain-row__cell {
  padding: var(--space-3) var(--space-4);
  vertical-align: middle;
  color: var(--color-ink-strong);
  font-size: var(--text-sm);
}

.g-chain-row__cell--chain {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  white-space: nowrap;
}

.g-chain-row__name {
  font-weight: var(--weight-medium);
}

.g-chain-row__cell--status {
  color: var(--color-ink-muted);
}

.g-chain-row__muted {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-ink-muted);
}

.g-chain-row__faint {
  color: var(--color-ink-subtle);
  font-style: italic;
  font-size: var(--text-xs);
}

/* Button variant of the faint hint — strips default <button> chrome and
   surfaces an underline-on-hover affordance so users learn they can
   click it to jump up to the lookup input. */
.g-chain-row__faintBtn {
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  text-decoration-color: var(--color-ink-subtle);
  font-family: inherit;
}
.g-chain-row__faintBtn:hover {
  color: var(--color-ink-strong);
  text-decoration-color: var(--color-ink-strong);
}
.g-chain-row__faintBtn:focus-visible {
  outline: 2px solid var(--color-brand);
  outline-offset: 2px;
  border-radius: 2px;
}

.g-chain-row__faint--right {
  display: inline-block;
  width: 100%;
  text-align: right;
}

.g-chain-row__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-ink-subtle);
  opacity: 0.5;
}

.g-chain-row__cell--actions {
  text-align: right;
}

.g-chain-row__actions {
  display: inline-flex;
  gap: var(--space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}

.g-chain-row__spin {
  animation: g-chain-row-spin 700ms linear infinite;
}

@keyframes g-chain-row-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .g-chain-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-2);
    padding: var(--space-3) 0;
  }
  .g-chain-row__cell {
    padding: 0;
  }
  .g-chain-row__cell--chain {
    grid-column: 1;
  }
  .g-chain-row__cell--status {
    grid-column: 2;
    text-align: right;
  }
  .g-chain-row__cell--actions {
    grid-column: 1 / -1;
    text-align: left;
  }
  .g-chain-row__actions {
    justify-content: flex-start;
  }
  .g-chain-row__faint--right {
    text-align: left;
  }
}
</style>
