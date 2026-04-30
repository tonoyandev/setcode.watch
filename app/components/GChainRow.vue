<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';
import type { Address } from 'viem';
import { onMounted, ref, watch } from 'vue';
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
}
const props = defineProps<Props>();

const emit = defineEmits<{
  // Per-chain delegation result is bubbled up so the page can light up
  // the central Subscribe popover with chain-by-chain status badges.
  (e: 'classified', payload: { chainId: number; result: CheckResponse }): void;
  // Fired when the user clicks the "Enter an address above" hint in the
  // idle state — page focuses the lookup input so they can start typing
  // without scrolling back up.
  (e: 'focusInput'): void;
}>();

const api = useWatcherApi();
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
    // Address-changed-since-issue guard: if the user typed a new
    // address while we were "fake-loading", don't clobber the new
    // address's status with this one's "notDetected" outcome.
    if (props.address !== addr) return;
    status.value = { kind: 'notDetected' };
    return;
  }

  try {
    const result = await api.check(addr, props.chain.id);
    // Stale-response guard. A second performCheck for a newer address
    // may have started while this network call was in flight; if it
    // resolved first and wrote the row state, we mustn't overwrite it
    // with this older result. Comparing to the live `props.address` is
    // the cheapest correct check — Vue's prop reactivity guarantees it
    // tracks the page's `checkedAddress` exactly.
    if (props.address !== addr) return;
    if (!result.currentTarget) {
      status.value = { kind: 'notDetected' };
      return;
    }
    status.value = { kind: 'classified', classification: result.classification };
    emit('classified', { chainId: props.chain.id, result });
  } catch (err) {
    // Same staleness guard on the failure path: if the user has moved
    // on, swallow the error silently rather than flashing "notDetected"
    // over a freshly-classified result.
    if (props.address !== addr) return;
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

// Late-mount catch-up. Rows inside the testnets table only mount when
// the user expands it, which happens *after* an address was submitted.
// The address watch only fires on changes, so without this hook a
// late-mounting row would sit in 'idle' forever even though the page
// already has an address waiting. Mirror what the address watch would
// have done if it had fired: queue the row and kick the check if the
// row is already in view.
onMounted(() => {
  if (props.address && status.value.kind === 'idle') {
    status.value = { kind: 'queued' };
    if (hasBeenInView.value) void performCheck(props.address);
  }
});

// Note: this row used to render a per-chain "Watch in Telegram" CTA in
// an Actions column. We removed it because (a) the bell at the top of
// the page is the single Telegram entry point now, (b) the per-chain
// Watch deep-link just rendered the same status the row was already
// showing, and (c) twenty-five copies of the same button drowned out
// the actually-useful information in the Delegation column. The bot's
// w_<chainId>_<addr> handler is still wired up for direct/shared
// links, but the website doesn't surface it any more.
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
  .g-chain-row__faint--right {
    text-align: left;
  }
}
</style>
