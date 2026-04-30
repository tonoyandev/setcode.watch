<script setup lang="ts">
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Bell,
  ChevronDown,
  Loader2,
  Search,
  X,
} from 'lucide-vue-next';
import { type Address, isAddress } from 'viem';
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { useChainCatalog } from '~/composables/useChainCatalog';
import { useWallet } from '~/composables/useWallet';
import {
  type CheckResponse,
  type CreateConfirmationResponse,
  WatcherApiException,
  useWatcherApi,
} from '~/composables/useWatcherApi';
import { t } from '~/i18n';

useHead({ title: 'SetCode.watch — monitoring for EIP-7702 delegations' });

const api = useWatcherApi();
const wallet = useWallet();
const config = useRuntimeConfig();
const botUsername = config.public.botUsername;

const { mainnets, testnets } = useChainCatalog();

const inputId = useId();
const input = ref('');
// Template ref to the lookup <input> so rows can request focus when the
// user clicks the "Enter an address above" hint inside an idle row.
const inputEl = ref<HTMLInputElement | null>(null);
// The address rows are checking against. Null = "no lookup yet" (every row
// renders its idle state). Set when the user submits or the wallet connects.
const checkedAddress = ref<Address | null>(null);
// Latched per-chain results bubbled up by GChainRow. Keyed by chain id.
// Each row renders its own Subscribe/Watch CTA based on its entry here,
// so the page just needs to remember the latest classification per
// chain — no page-level "is this chain delegated?" gate any more.
const chainResults = ref<Record<number, CheckResponse>>({});
const clientError = ref<string | null>(null);
const focused = ref(false);
// Mirrors the in-flight state of the form submit button. We can't easily
// know when every row has finished, but the form submit itself is
// synchronous (just validation + setting checkedAddress), so this stays
// false except during the brief click handler.
const checking = ref(false);

// Testnets are collapsed by default — they're rarely the user's focus and
// would otherwise dominate the table by row count. The toggle lives at
// the same indent level as the Mainnets header for symmetry.
const testnetsOpen = ref(false);

// Two sortable columns: Chain (alphabetical) and Delegation (status).
// Only one can be active at a time — clicking either column header
// resets the other to default. That keeps the data shape predictable
// and matches the standard "one active sort key" pattern users expect
// from data tables.
//
//   chain:       default → name-asc (A→Z) → name-desc (Z→A) → default
//   delegation:  default → found-first → unfound-first → default
//
// Both tables (mainnets + testnets) share the same modes so a click on
// either header re-orders both consistently. Sort is applied within
// each table separately — testnets never mingle with mainnets.
type DelegationSortMode = 'default' | 'found-first' | 'unfound-first';
type ChainSortMode = 'default' | 'name-asc' | 'name-desc';

const delegationSortMode = ref<DelegationSortMode>('default');
const chainSortMode = ref<ChainSortMode>('default');

function cycleDelegationSort(): void {
  delegationSortMode.value =
    delegationSortMode.value === 'default'
      ? 'found-first'
      : delegationSortMode.value === 'found-first'
        ? 'unfound-first'
        : 'default';
  // Mutually exclusive with chain sort — only one column drives order.
  chainSortMode.value = 'default';
}

function cycleChainSort(): void {
  chainSortMode.value =
    chainSortMode.value === 'default'
      ? 'name-asc'
      : chainSortMode.value === 'name-asc'
        ? 'name-desc'
        : 'default';
  delegationSortMode.value = 'default';
}

function applySort<T extends { id: number; name: string }>(chains: readonly T[]): T[] {
  if (chainSortMode.value !== 'default') {
    // localeCompare gives correct A/Á/Z ordering for any UTF-8 names.
    const sorted = [...chains].sort((a, b) => a.name.localeCompare(b.name));
    return chainSortMode.value === 'name-asc' ? sorted : sorted.reverse();
  }
  if (delegationSortMode.value !== 'default') {
    const found = (c: T) => Boolean(chainResults.value[c.id]?.currentTarget);
    // Stable sort: equal-status entries keep their catalog order.
    return [...chains].sort((a, b) => {
      const fa = found(a);
      const fb = found(b);
      if (fa === fb) return 0;
      if (delegationSortMode.value === 'found-first') return fa ? -1 : 1;
      return fa ? 1 : -1;
    });
  }
  return [...chains];
}

const sortedMainnets = computed(() => applySort(mainnets));
const sortedTestnets = computed(() => applySort(testnets));

// Aria-label cycles describe the *next* state's effect, not the
// current — that's the SR convention for sort buttons.
const delegationSortAriaLabel = computed(() =>
  delegationSortMode.value === 'default'
    ? t('home.table.sort.toFoundFirst')
    : delegationSortMode.value === 'found-first'
      ? t('home.table.sort.toUnfoundFirst')
      : t('home.table.sort.toDefault'),
);

const chainSortAriaLabel = computed(() =>
  chainSortMode.value === 'default'
    ? t('home.table.sort.toNameAsc')
    : chainSortMode.value === 'name-asc'
      ? t('home.table.sort.toNameDesc')
      : t('home.table.sort.toDefault'),
);

// One-click subscribe state. The bell mints a single confirmation that
// the watcher fans out to every monitored chain at /start time, so we
// don't need per-chain tracking up here — a plain in-flight bool is
// enough.
const subscribing = ref(false);
const confirmation = ref<CreateConfirmationResponse | null>(null);
const subscribeError = ref<string | null>(null);
const copied = ref(false);

function closeConfirmModal(): void {
  confirmation.value = null;
  copied.value = false;
}

function onConfirmKeydown(ev: KeyboardEvent): void {
  if (ev.key === 'Escape' && confirmation.value) closeConfirmModal();
}

// Real-time validity gate. Single source of truth for both button
// states — arrow (submit), bell (subscribe), and the input's own
// border colour. `strict: false` skips EIP-55 checksum casing because
// the watcher lower-cases everything before lookup anyway, so a
// checksum mismatch at this boundary has no semantic effect — and
// users frequently paste from CLI / wallets that preserve casing
// imperfectly.
const trimmedInput = computed(() => input.value.trim());
const inputDirty = computed(() => trimmedInput.value.length > 0);
const inputValid = computed(() => isAddress(trimmedInput.value, { strict: false }));

// Mirrors the bell's enabled state with a friendlier name on the page.
// Both buttons now disable on the same condition: valid 0x40-hex.
const subscribeReady = inputValid;

// User-facing hint shown beneath the input as the user types. Stays
// silent until the user has entered something but it doesn't yet form
// a valid address, then nudges them toward the missing piece. Goes
// away the moment the address becomes valid.
const inputHint = computed<string | null>(() => {
  if (!inputDirty.value) return null;
  if (inputValid.value) return null;
  const raw = trimmedInput.value;
  // Strip a leading 0x (case-insensitive) so we can count the body.
  const body = raw.replace(/^0x/i, '');
  if (!raw.toLowerCase().startsWith('0x')) {
    return t('home.lookup.hint.needs0x');
  }
  if (body.length < 40) {
    return t('home.lookup.hint.tooShort', { have: body.length });
  }
  if (body.length > 40) {
    return t('home.lookup.hint.tooLong', { have: body.length });
  }
  // Right length, must contain non-hex chars.
  return t('home.lookup.hint.notHex');
});

const now = ref(Date.now());
let tickHandle: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  tickHandle = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onBeforeUnmount(() => {
  if (tickHandle) clearInterval(tickHandle);
  // Defensive: if the user navigates away while the modal is open,
  // make sure we don't leak the global keydown listener.
  document.removeEventListener('keydown', onConfirmKeydown);
});

// Toggle the document-level ESC listener whenever the modal opens or
// closes. Component-scoped @keydown.esc only fires when the modal has
// focus; this approach catches Escape from anywhere on the page.
watch(confirmation, (val) => {
  if (val) {
    document.addEventListener('keydown', onConfirmKeydown);
    // Lock body scroll so the page underneath doesn't jitter while the
    // modal sits over it.
    document.body.style.overflow = 'hidden';
  } else {
    document.removeEventListener('keydown', onConfirmKeydown);
    document.body.style.overflow = '';
  }
});

// Auto-populate the input on the *first* wallet connect (zero-friction
// for the common "paste my own address" case). Once the user has
// anything in the box — auto-filled or manual — subsequent wallet
// events leave the input alone. This prevents the previously-observed
// race where wagmi finishing its auto-reconnect after a page reload
// silently overwrote whatever the user had just pasted.
watch(
  () => wallet.address.value,
  (addr, prev) => {
    if (!addr) return;
    // Only act on the *initial* transition to a connected wallet
    // (prev was nullish AND the box is currently empty). Account
    // switching, deliberate disconnects, and post-paste auto-reconnect
    // all carry a non-null prev or non-empty input, which means user
    // intent has already taken hold and we leave them alone.
    if (!prev && input.value.trim().length === 0) {
      input.value = addr;
      void runCheck(addr);
    }
  },
  { immediate: true },
);

// Submit-arrow enabled iff the address is well-formed AND we're not
// already mid-submission. Aligning with `inputValid` rather than just
// length means the button reacts in real time as the user edits — no
// more "click submit then get an inline error".
const canCheck = computed(() => inputValid.value && !checking.value);

async function onCheck() {
  clientError.value = null;
  const candidate = input.value.trim();
  // Match `subscribeReady` — accept any 0x40-hex regardless of EIP-55
  // checksum casing. The watcher lower-cases everything before lookup
  // anyway, so a checksum mismatch on input has no semantic effect.
  if (!isAddress(candidate, { strict: false })) {
    clientError.value = t('error.invalidAddress');
    return;
  }
  await runCheck(candidate as Address);
}

async function runCheck(addr: Address) {
  checking.value = true;
  try {
    chainResults.value = {};
    confirmation.value = null;
    subscribeError.value = null;
    checkedAddress.value = addr.toLowerCase() as Address;
  } finally {
    // Form-side state. Per-row spinners are owned by GChainRow.
    checking.value = false;
  }
}

function onReset() {
  input.value = '';
  checkedAddress.value = null;
  chainResults.value = {};
  confirmation.value = null;
  clientError.value = null;
  subscribeError.value = null;
}

function onChainClassified(payload: { chainId: number; result: CheckResponse }) {
  chainResults.value = { ...chainResults.value, [payload.chainId]: payload.result };
}

function focusLookup() {
  // Smooth-scroll the input into view first — rows live below it, so a
  // blunt focus() would jump the page. `block: 'center'` lands the field
  // comfortably in the viewport, then we focus on the next frame so the
  // browser's caret placement isn't fighting the scroll animation.
  const el = inputEl.value;
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  requestAnimationFrame(() => el.focus());
}

// --- Subscribe flow (the differentiator).
//
// One click on the bell mints a single pending confirmation that the
// watcher will fan out into one subscription per monitored chain when
// the user redeems it in Telegram. No chain picker, no per-row buttons:
// the architectural shape is "watch this address everywhere we index."
//
// The bell can fire before the arrow has, so we snapshot `input` into
// `checkedAddress` here too — that way the table starts classifying in
// parallel and the deep-link card below it lines up visually.
async function onSubscribe() {
  if (subscribing.value) return;
  let addr = checkedAddress.value;
  if (!addr) {
    const candidate = input.value.trim();
    // Same permissive validation as the bell-readiness gate.
    if (!isAddress(candidate, { strict: false })) {
      clientError.value = t('error.invalidAddress');
      return;
    }
    addr = candidate.toLowerCase() as Address;
    checkedAddress.value = addr;
  }
  subscribing.value = true;
  subscribeError.value = null;
  confirmation.value = null;
  copied.value = false;
  try {
    // No chainIds → watcher defaults to every supported chain.
    confirmation.value = await api.createConfirmation(addr);
    // The deep-link is now a modal (teleported to body), so we don't
    // need to scroll it into view — Vue will mount it center-screen
    // over a backdrop the moment `confirmation` becomes non-null.
  } catch (err) {
    if (err instanceof WatcherApiException && err.detail.kind === 'invalid_eoa') {
      subscribeError.value = t('error.invalidAddress');
    } else {
      // unsupported_chain shouldn't reach here (we never send one), but
      // any other failure collapses to the generic message.
      subscribeError.value = t('home.subscribe.error');
    }
  } finally {
    subscribing.value = false;
  }
}

async function onCopyCode() {
  const c = confirmation.value;
  if (!c) return;
  try {
    await navigator.clipboard.writeText(c.code);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    /* clipboard denied — code is still visible in the block */
  }
}

const secondsRemaining = computed(() => {
  const c = confirmation.value;
  if (!c) return null;
  const exp = Date.parse(c.expiresAt);
  if (Number.isNaN(exp)) return null;
  return Math.max(0, Math.floor((exp - now.value) / 1000));
});
const expired = computed(() => secondsRemaining.value === 0);

// --- Watch flow: each GChainRow now builds its own deep-link
// (`w_<chainId>_<addr>`) since the format is per-chain. The page no
// longer computes a single shared watchLink — see GChainRow's own
// `watchLink` computed.
</script>

<template>
  <div class="home">
    <section class="hero">
      <div class="hero__inner">
        <p class="hero__eyebrow">EIP-7702 · Multi-chain coverage</p>
        <h1 class="hero__headline">{{ t('landing.hero.headline') }}</h1>
        <p class="hero__subhead">{{ t('landing.hero.subhead') }}</p>

        <form class="lookup" @submit.prevent="onCheck">
          <label :for="inputId" class="lookup__srlabel">
            {{ t('home.lookup.label') }}
          </label>
          <div
            class="lookup__field"
            :class="{
              'lookup__field--error': !!clientError,
              'lookup__field--focus': focused,
              'lookup__field--ok': inputValid,
              'lookup__field--warn': inputDirty && !inputValid && !clientError,
            }"
          >
            <Search class="lookup__leadIcon" :size="18" aria-hidden="true" />
            <input
              :id="inputId"
              ref="inputEl"
              v-model="input"
              type="text"
              class="lookup__input"
              :placeholder="t('home.lookup.placeholder')"
              autocomplete="off"
              spellcheck="false"
              @focus="focused = true"
              @blur="focused = false"
            />
            <button
              v-if="input.length > 0"
              type="button"
              class="lookup__clearBtn"
              :aria-label="t('home.lookup.clearAria')"
              @click.stop="onReset"
            >
              <X :size="16" aria-hidden="true" />
            </button>
            <button
              type="submit"
              class="lookup__submitBtn"
              :disabled="!canCheck"
              :aria-label="t('home.lookup.submit')"
              :title="t('home.lookup.submit')"
            >
              <Loader2 v-if="checking" :size="18" class="lookup__spin" aria-hidden="true" />
              <ArrowRight v-else :size="18" aria-hidden="true" />
            </button>
            <!-- The differentiator: most explorers can only check —
                 we *watch*. One click here mints a confirmation that
                 subscribes to every monitored chain at once, no
                 picker. Rainbow-gradient hover advertises the action;
                 the tooltip on the right side spells out the flow so
                 the bell doesn't read as decoration. -->
            <div class="lookup__bellWrap">
              <button
                type="button"
                class="lookup__bellBtn"
                :class="{
                  'lookup__bellBtn--ready': subscribeReady && !subscribing,
                  'lookup__bellBtn--busy': subscribing,
                }"
                :disabled="!subscribeReady || subscribing"
                :aria-label="t('home.cta.subscribe.bellAria')"
                @click.stop="onSubscribe"
              >
                <Loader2 v-if="subscribing" :size="18" class="lookup__spin" aria-hidden="true" />
                <Bell v-else :size="18" aria-hidden="true" />
              </button>
              <div class="lookup__bellTooltip" role="tooltip">
                <p class="lookup__bellTooltipTitle">
                  {{ t('home.cta.subscribe.bellTooltipTitle') }}
                </p>
                <p class="lookup__bellTooltipBody">
                  {{
                    subscribeReady
                      ? t('home.cta.subscribe.bellTooltipBody')
                      : t('home.cta.subscribe.bellTooltipDisabled')
                  }}
                </p>
              </div>
            </div>
          </div>
          <!-- Below-input feedback row. Hard error (clientError) wins
               over the soft live hint, but both are mutually exclusive
               with the empty/valid resting state. The hint role is
               'status' (aria-polite) so screen readers don't shout on
               every keystroke; the error is 'alert' (aria-assertive)
               for genuine submit failures. -->
          <p v-if="clientError" class="lookup__inlineError" role="alert">
            {{ clientError }}
          </p>
          <p v-else-if="inputHint" class="lookup__inlineHint" role="status">
            {{ inputHint }}
          </p>
        </form>

        <div class="results">
          <section class="results__group">
            <h2 class="results__heading">{{ t('home.table.mainnetsHeading') }}</h2>
            <table class="results__table">
              <thead>
                <tr>
                  <th
                    class="results__th results__th--chain"
                    :aria-sort="
                      chainSortMode === 'name-asc'
                        ? 'ascending'
                        : chainSortMode === 'name-desc'
                          ? 'descending'
                          : 'none'
                    "
                  >
                    <button
                      type="button"
                      class="results__sortBtn"
                      :class="{ 'results__sortBtn--active': chainSortMode !== 'default' }"
                      :aria-label="chainSortAriaLabel"
                      @click="cycleChainSort"
                    >
                      <span>{{ t('home.table.chain') }}</span>
                      <ArrowUp
                        v-if="chainSortMode === 'name-asc'"
                        :size="14"
                        class="results__sortIcon"
                        aria-hidden="true"
                      />
                      <ArrowDown
                        v-else-if="chainSortMode === 'name-desc'"
                        :size="14"
                        class="results__sortIcon"
                        aria-hidden="true"
                      />
                      <ArrowUpDown
                        v-else
                        :size="14"
                        class="results__sortIcon results__sortIcon--idle"
                        aria-hidden="true"
                      />
                    </button>
                  </th>
                  <th
                    class="results__th"
                    :aria-sort="
                      delegationSortMode === 'found-first'
                        ? 'descending'
                        : delegationSortMode === 'unfound-first'
                          ? 'ascending'
                          : 'none'
                    "
                  >
                    <button
                      type="button"
                      class="results__sortBtn"
                      :class="{
                        'results__sortBtn--active': delegationSortMode !== 'default',
                      }"
                      :aria-label="delegationSortAriaLabel"
                      @click="cycleDelegationSort"
                    >
                      <span>{{ t('home.table.delegation') }}</span>
                      <ArrowUp
                        v-if="delegationSortMode === 'found-first'"
                        :size="14"
                        class="results__sortIcon"
                        aria-hidden="true"
                      />
                      <ArrowDown
                        v-else-if="delegationSortMode === 'unfound-first'"
                        :size="14"
                        class="results__sortIcon"
                        aria-hidden="true"
                      />
                      <ArrowUpDown
                        v-else
                        :size="14"
                        class="results__sortIcon results__sortIcon--idle"
                        aria-hidden="true"
                      />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <GChainRow
                  v-for="chain in sortedMainnets"
                  :key="chain.id"
                  :chain="chain"
                  :address="checkedAddress"
                  @classified="onChainClassified"
                  @focus-input="focusLookup"
                />
              </tbody>
            </table>
          </section>

          <section class="results__group results__group--testnets">
            <button
              type="button"
              class="results__toggle"
              :aria-expanded="testnetsOpen"
              aria-controls="testnets-table"
              @click="testnetsOpen = !testnetsOpen"
            >
              <span class="results__heading">
                {{ t('home.table.testnetsHeading') }}
              </span>
              <ChevronDown
                :size="18"
                class="results__caret"
                :class="{ 'results__caret--open': testnetsOpen }"
                aria-hidden="true"
              />
            </button>
            <!-- v-show (not v-if) so collapsing the section doesn't unmount
                 the rows. Each GChainRow caches its classified state in
                 component-local refs that would otherwise be discarded on
                 collapse, forcing a re-fetch on every re-open. With v-show
                 the rows survive the toggle, so /check fires once per
                 (address, chain) pair until the user enters a new address. -->
            <table v-show="testnetsOpen" id="testnets-table" class="results__table">
              <thead>
                <tr>
                  <th
                    class="results__th results__th--chain"
                    :aria-sort="
                      chainSortMode === 'name-asc'
                        ? 'ascending'
                        : chainSortMode === 'name-desc'
                          ? 'descending'
                          : 'none'
                    "
                  >
                    <button
                      type="button"
                      class="results__sortBtn"
                      :class="{ 'results__sortBtn--active': chainSortMode !== 'default' }"
                      :aria-label="chainSortAriaLabel"
                      @click="cycleChainSort"
                    >
                      <span>{{ t('home.table.chain') }}</span>
                      <ArrowUp
                        v-if="chainSortMode === 'name-asc'"
                        :size="14"
                        class="results__sortIcon"
                        aria-hidden="true"
                      />
                      <ArrowDown
                        v-else-if="chainSortMode === 'name-desc'"
                        :size="14"
                        class="results__sortIcon"
                        aria-hidden="true"
                      />
                      <ArrowUpDown
                        v-else
                        :size="14"
                        class="results__sortIcon results__sortIcon--idle"
                        aria-hidden="true"
                      />
                    </button>
                  </th>
                  <th
                    class="results__th"
                    :aria-sort="
                      delegationSortMode === 'found-first'
                        ? 'descending'
                        : delegationSortMode === 'unfound-first'
                          ? 'ascending'
                          : 'none'
                    "
                  >
                    <button
                      type="button"
                      class="results__sortBtn"
                      :class="{
                        'results__sortBtn--active': delegationSortMode !== 'default',
                      }"
                      :aria-label="delegationSortAriaLabel"
                      @click="cycleDelegationSort"
                    >
                      <span>{{ t('home.table.delegation') }}</span>
                      <ArrowUp
                        v-if="delegationSortMode === 'found-first'"
                        :size="14"
                        class="results__sortIcon"
                        aria-hidden="true"
                      />
                      <ArrowDown
                        v-else-if="delegationSortMode === 'unfound-first'"
                        :size="14"
                        class="results__sortIcon"
                        aria-hidden="true"
                      />
                      <ArrowUpDown
                        v-else
                        :size="14"
                        class="results__sortIcon results__sortIcon--idle"
                        aria-hidden="true"
                      />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <GChainRow
                  v-for="chain in sortedTestnets"
                  :key="chain.id"
                  :chain="chain"
                  :address="checkedAddress"
                  @classified="onChainClassified"
                  @focus-input="focusLookup"
                />
              </tbody>
            </table>
          </section>

          <p v-if="subscribeError" class="home__error" role="alert">
            {{ subscribeError }}
          </p>

        </div>
      </div>
    </section>

    <!-- Confirmation modal. Teleported to <body> so it escapes the
         page's stacking contexts and overflow:hidden parents, and so
         a single backdrop covers the whole viewport regardless of
         scroll position. The modal is the only side effect of clicking
         the bell — no inline section under the table any more. -->
    <Teleport to="body">
      <div
        v-if="confirmation"
        class="confirmModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmModalTitle"
        @click.self="closeConfirmModal"
      >
        <div class="confirmModal__card">
          <button
            type="button"
            class="confirmModal__close"
            :aria-label="t('home.confirm.close')"
            @click="closeConfirmModal"
          >
            <X :size="18" aria-hidden="true" />
          </button>

          <h3 id="confirmModalTitle" class="confirmModal__title">
            {{ t('home.confirm.title') }}
          </h3>
          <p class="confirmModal__body">{{ t('home.confirm.body') }}</p>

          <GButton
            v-if="!expired"
            as="a"
            :href="confirmation.deepLink"
            variant="primary"
            size="md"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ t('home.confirm.cta') }}
          </GButton>
          <p v-else class="home__error" role="alert">
            {{ t('home.confirm.expired') }}
          </p>

          <p
            v-if="secondsRemaining !== null && !expired"
            class="confirmModal__countdown"
          >
            {{ t('home.confirm.expiresIn', { seconds: secondsRemaining }) }}
          </p>

          <div class="confirmModal__fallback">
            <p>{{ t('home.confirm.fallback', { bot: botUsername }) }}</p>
            <GCodeBlock>/start {{ confirmation.code }}</GCodeBlock>
            <GButton type="button" variant="ghost" size="sm" @click.stop="onCopyCode">
              {{ copied ? t('home.confirm.copied') : t('home.confirm.copyCode') }}
            </GButton>
          </div>
        </div>
      </div>
    </Teleport>

    <section class="how">
      <div class="how__inner">
        <h2 class="how__title">{{ t('landing.how.title') }}</h2>
        <div class="how__grid">
          <GCard class="how__card">
            <h3 class="how__stepTitle">{{ t('landing.how.step1.title') }}</h3>
            <p class="how__stepBody">{{ t('landing.how.step1.body') }}</p>
          </GCard>
          <GCard class="how__card">
            <h3 class="how__stepTitle">{{ t('landing.how.step2.title') }}</h3>
            <p class="how__stepBody">{{ t('landing.how.step2.body') }}</p>
          </GCard>
          <GCard class="how__card">
            <h3 class="how__stepTitle">{{ t('landing.how.step3.title') }}</h3>
            <p class="how__stepBody">{{ t('landing.how.step3.body') }}</p>
          </GCard>
        </div>
      </div>
    </section>

    <section class="why">
      <div class="why__inner">
        <h2 class="why__title">{{ t('landing.why.title') }}</h2>
        <p class="why__body">{{ t('landing.why.body') }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  width: 100%;
}

/* Hero -------------------------------------------------------------- */

.hero {
  padding: var(--space-16) var(--space-6) var(--space-10);
  background:
    radial-gradient(ellipse at top, rgba(168, 90, 28, 0.06), transparent 60%),
    var(--color-bg-page);
}

.hero__inner {
  max-width: var(--width-content);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-5);
}

.hero__eyebrow {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
  letter-spacing: 0.02em;
  margin: 0;
}

.hero__headline {
  font-size: clamp(var(--text-3xl), 5vw, var(--text-4xl));
  max-width: 22ch;
  margin: 0;
}

.hero__subhead {
  font-size: var(--text-lg);
  color: var(--color-ink-muted);
  max-width: 60ch;
  margin: 0;
}

/* Search-style lookup field with submit/clear icons baked into the box.
   Replaces the old label + input + button-row layout for a tighter,
   table-aligned search affordance. */
.lookup {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.lookup__srlabel {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.lookup__field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  background: var(--color-bg-surface);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  transition: border-color var(--duration-fast) var(--ease);
}

.lookup__field--focus {
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px rgba(168, 90, 28, 0.12);
}

/* Live validity tints. --ok wins over --warn (Vue applies them in
   class-binding order but specificity is identical, so we order the
   rules below for the cascade). --error (a hard submit failure)
   trumps both via the rule that follows. */
.lookup__field--warn {
  border-color: var(--color-ink-subtle);
}

.lookup__field--ok {
  border-color: rgba(34, 197, 94, 0.55); /* soft success-green */
}

.lookup__field--error {
  border-color: var(--color-error);
}

.lookup__leadIcon {
  flex-shrink: 0;
  color: var(--color-ink-muted);
}

.lookup__input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  outline: 0;
  padding: var(--space-2) 0;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  letter-spacing: -0.01em;
  color: var(--color-ink-strong);
}

.lookup__input::placeholder {
  color: var(--color-ink-subtle);
  font-family: var(--font-sans);
  letter-spacing: 0;
}

.lookup__clearBtn,
.lookup__submitBtn,
.lookup__bellBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: var(--radius-pill);
  border: var(--border-width) solid transparent;
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);
}

.lookup__clearBtn {
  background: transparent;
  color: var(--color-ink-muted);
}
.lookup__clearBtn:hover {
  background: var(--color-bg-subtle);
  color: var(--color-ink-strong);
}

.lookup__submitBtn {
  background: var(--color-bg-surface);
  border-color: var(--color-border-strong);
  color: var(--color-ink-strong);
}
.lookup__submitBtn:hover:not(:disabled) {
  background: var(--color-brand);
  border-color: var(--color-brand);
  color: var(--color-brand-ink);
}
.lookup__submitBtn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.lookup__spin {
  animation: lookup-spin 700ms linear infinite;
}

@keyframes lookup-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Bell button: the differentiator. Most explorers can only check;
   we *watch*. The rainbow gradient on hover is intentional eye-candy
   to advertise that this action is the one that matters. The tooltip
   sits in a sibling div anchored to .lookup__bellWrap so it can render
   without being clipped by the button's overflow:hidden. */
.lookup__bellWrap {
  position: relative;
  display: inline-flex;
}

.lookup__bellBtn {
  background: var(--color-bg-surface);
  border-color: var(--color-border-strong);
  color: var(--color-ink-strong);
  position: relative;
  overflow: hidden;
  z-index: 0;
}

/* The rainbow lives on a ::before so we can fade it in without
   touching the icon's own colour transition. Conic gradient gives a
   smoother spectrum than linear at small sizes, and animating
   rotation is GPU-cheap. */
.lookup__bellBtn::before {
  content: '';
  position: absolute;
  inset: -2px;
  background: conic-gradient(
    from 0deg,
    #ef4444,
    #f59e0b,
    #eab308,
    #22c55e,
    #06b6d4,
    #3b82f6,
    #8b5cf6,
    #ec4899,
    #ef4444
  );
  opacity: 0;
  transition: opacity 180ms var(--ease);
  z-index: -1;
  border-radius: inherit;
}

.lookup__bellBtn--ready:hover::before,
.lookup__bellBtn--busy::before {
  opacity: 1;
  animation: lookup-bell-rainbow 4s linear infinite;
}

.lookup__bellBtn--ready:hover,
.lookup__bellBtn--busy {
  border-color: transparent;
  color: #ffffff;
  background: transparent;
}

/* Subtle "this is the action" pulse when an address has been entered
   but the user hasn't clicked the bell yet. Stops the bell from
   reading as decoration in the resting state. */
.lookup__bellBtn--ready:not(:hover) {
  box-shadow: 0 0 0 0 rgba(168, 90, 28, 0.45);
  animation: lookup-bell-attention 2.4s ease-out infinite;
}

@keyframes lookup-bell-rainbow {
  to {
    transform: rotate(360deg);
  }
}

@keyframes lookup-bell-attention {
  0% {
    box-shadow: 0 0 0 0 rgba(168, 90, 28, 0.35);
  }
  60%,
  100% {
    box-shadow: 0 0 0 8px rgba(168, 90, 28, 0);
  }
}

.lookup__bellBtn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

/* Tooltip: positioned to the right of the bell on desktop. Colours
   come from theme tokens (`--color-ink-strong` flips light↔dark with
   the theme; `--color-bg-surface` flips inversely) so the tooltip is
   always dark-on-light or light-on-dark — never the same-on-same case
   that previous hardcoded rgba(255,255,255,…) hit in dark theme. */
.lookup__bellTooltip {
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%) translateX(4px);
  width: min(320px, calc(100vw - 32px));
  padding: var(--space-3) var(--space-4);
  background: var(--color-ink-strong);
  color: var(--color-bg-surface);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 160ms var(--ease),
    transform 160ms var(--ease);
  z-index: 10;
}
/* Tail points back at the bell from the left edge of the tooltip. */
.lookup__bellTooltip::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 100%;
  transform: translateY(-50%);
  border: 6px solid transparent;
  border-right-color: var(--color-ink-strong);
}
.lookup__bellWrap:hover .lookup__bellTooltip,
.lookup__bellBtn:focus-visible + .lookup__bellTooltip {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}

.lookup__bellTooltipTitle {
  margin: 0 0 var(--space-1) 0;
  font-weight: var(--weight-semibold);
  font-size: var(--text-sm);
  color: var(--color-bg-surface);
}
.lookup__bellTooltipBody {
  margin: 0;
  color: var(--color-bg-surface);
  /* 0.82 opacity dims the body relative to the title without changing
     hue — works in both themes because it's the same theme-driven
     foreground colour just slightly faded. */
  opacity: 0.82;
}

/* Narrow viewports: there's no horizontal room to the right of the
   bell, so the tooltip drops below the field instead. The tail moves
   to the top edge accordingly. */
@media (max-width: 640px) {
  .lookup__bellTooltip {
    left: auto;
    right: 0;
    top: calc(100% + 10px);
    transform: translateY(4px);
    width: min(320px, calc(100vw - 32px));
  }
  .lookup__bellTooltip::after {
    top: auto;
    bottom: 100%;
    right: 14px;
    transform: none;
    border-right-color: transparent;
    border-bottom-color: var(--color-ink-strong);
  }
  .lookup__bellWrap:hover .lookup__bellTooltip,
  .lookup__bellBtn:focus-visible + .lookup__bellTooltip {
    transform: translateY(0);
  }
}

.lookup__inlineError {
  margin: 0 0 0 var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-error);
}

/* Soft live-validation hint. Same indent as the error so they can
   swap places without the layout jumping. Muted ink so it reads as
   neutral guidance ("you're on your way") rather than a failure. */
.lookup__inlineHint {
  margin: 0 0 0 var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
}

/* Results table ------------------------------------------------------ */

.results {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-top: var(--space-3);
}

.results__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.results__heading {
  margin: 0;
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--color-ink-strong);
  letter-spacing: -0.01em;
}

/* Collapsible testnets group — same indent as the Mainnets header but
   the heading itself is a button, with a chevron on the right that
   rotates to indicate expanded state. */
.results__group--testnets {
  margin-top: var(--space-3);
}

.results__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-2) var(--space-4);
  background: transparent;
  border: 0;
  border-top: var(--border-width) solid var(--color-border);
  cursor: pointer;
  color: var(--color-ink-strong);
  text-align: left;
}
.results__toggle:hover {
  background: var(--color-bg-subtle);
}
.results__toggle:focus-visible {
  outline: 2px solid var(--color-brand);
  outline-offset: -2px;
}

.results__caret {
  color: var(--color-ink-muted);
  transition: transform var(--duration-fast) var(--ease);
}
.results__caret--open {
  transform: rotate(180deg);
}

.results__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.results__th {
  text-align: left;
  padding: var(--space-3) var(--space-4);
  font-weight: var(--weight-medium);
  color: var(--color-ink-muted);
  border-bottom: var(--border-width) solid var(--color-border);
  font-size: var(--text-sm);
}

/* Sort button lives inside the Delegation <th>. Looks like a label
   until you hover — then the icon brightens and the cursor signals
   it's clickable. Active state (sort applied) bumps the icon to the
   brand colour so users see at a glance the rows are reordered. */
.results__sortBtn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0;
  background: transparent;
  border: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  user-select: none;
}

.results__sortBtn:hover {
  color: var(--color-ink-strong);
}

.results__sortBtn:focus-visible {
  outline: 2px solid var(--color-brand);
  outline-offset: 2px;
  border-radius: 2px;
}

.results__sortBtn--active {
  color: var(--color-brand);
}

.results__sortIcon {
  flex-shrink: 0;
  transition: color var(--duration-fast) var(--ease);
}

.results__sortIcon--idle {
  opacity: 0.5;
}
.results__sortBtn:hover .results__sortIcon--idle {
  opacity: 1;
}

.home__error {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-malicious-bg);
  border: var(--border-width) solid var(--color-malicious-border);
  color: var(--color-malicious);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

/* Confirmation modal styles live in a separate non-scoped block at
   the bottom of this file. They have to be global because <Teleport>
   moves the modal into <body>, where Vue's scoped attribute selectors
   would not necessarily reach. */

/* How --------------------------------------------------------------- */

.how {
  /* Pin the bg explicitly. Without it, .how has a transparent bg and
     reveals whatever's underneath (html bg, layout bg, paint glitches
     under the radial gradient on .hero). In dark mode that read as
     the section being lighter than its neighbours; in light mode it
     was visually fine but architecturally inconsistent — same fix
     covers both. */
  background: var(--color-bg-page);
  padding: var(--space-12) var(--space-6);
}

.how__inner {
  max-width: var(--width-page);
  margin: 0 auto;
}

.how__title {
  margin-bottom: var(--space-8);
}

.how__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-5);
}

.how__stepTitle {
  margin-bottom: var(--space-3);
  color: var(--color-ink-strong);
}

.how__stepBody {
  color: var(--color-ink-muted);
  margin: 0;
  font-size: var(--text-base);
}

/* Why --------------------------------------------------------------- */

.why {
  padding: var(--space-12) var(--space-6) var(--space-16);
  background: var(--color-bg-subtle);
  border-top: var(--border-width) solid var(--color-border);
  border-bottom: var(--border-width) solid var(--color-border);
}

.why__inner {
  max-width: var(--width-page);
  margin: 0 auto;
}

.why__title {
  margin-bottom: var(--space-4);
}

.why__body {
  font-size: var(--text-lg);
  color: var(--color-ink);
  max-width: 72ch;
  margin: 0;
}

/* Mobile ------------------------------------------------------------ */

@media (max-width: 640px) {
  .results__table thead {
    display: none;
  }
}
</style>

<!-- Confirmation modal styles. NOT scoped: <Teleport to="body"> moves
     the modal out of this component's subtree, where Vue's scoped
     attribute selectors don't reach. The class names are unique enough
     (`confirmModal*`) that global rules don't risk colliding. -->
<style>
.confirmModal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  /* Slightly transparent dark backdrop with a subtle blur so the page
     behind reads as receded, not gone. backdrop-filter is GPU-cheap on
     a single fixed layer. */
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 1000;
  animation: confirmModal-fade 160ms ease-out;
}

.confirmModal__card {
  position: relative;
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
  background: var(--color-bg-surface);
  border-radius: var(--radius-lg);
  border: var(--border-width) solid var(--color-border-strong);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32);
  animation: confirmModal-pop 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.confirmModal__close {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
  cursor: pointer;
  color: var(--color-ink-muted);
  transition:
    background var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);
}
.confirmModal__close:hover {
  background: var(--color-bg-subtle);
  color: var(--color-ink-strong);
}
.confirmModal__close:focus-visible {
  outline: 2px solid var(--color-brand);
  outline-offset: 2px;
}

.confirmModal__title {
  margin: 0;
  padding-right: var(--space-8); /* clear the close button */
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-ink-strong);
}

.confirmModal__body {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

.confirmModal__countdown {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-ink-subtle);
}

.confirmModal__fallback {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: var(--border-width) solid var(--color-border);
}

.confirmModal__fallback p {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

@keyframes confirmModal-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes confirmModal-pop {
  from {
    transform: translateY(8px) scale(0.97);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .confirmModal,
  .confirmModal__card {
    animation: none;
  }
}
</style>
