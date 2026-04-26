<script setup lang="ts">
import { ArrowRight, ChevronDown, Loader2, Search, X } from 'lucide-vue-next';
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

const { chains, mainnets, testnets } = useChainCatalog();

const inputId = useId();
const input = ref('');
// Template ref to the lookup <input> so rows can request focus when the
// user clicks the "Enter an address above" hint inside an idle row.
const inputEl = ref<HTMLInputElement | null>(null);
// The address rows are checking against. Null = "no lookup yet" (every row
// renders its idle state). Set when the user submits or the wallet connects.
const checkedAddress = ref<Address | null>(null);
// Latched per-chain results bubbled up by GChainRow. Keyed by chain id.
// Currently only mainnet drives the page-level Subscribe gate, but the
// shape generalises cleanly when more chains become monitored.
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

const subscribing = ref(false);
const confirmation = ref<CreateConfirmationResponse | null>(null);
const subscribeError = ref<string | null>(null);
const copied = ref(false);

const now = ref(Date.now());
let tickHandle: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  tickHandle = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onBeforeUnmount(() => {
  if (tickHandle) clearInterval(tickHandle);
});

// When the wallet connects or switches account, auto-populate the input
// and re-check. If the user typed something manually, we don't overwrite —
// but the common case (empty input + connect) is zero-friction.
watch(
  () => wallet.address.value,
  (addr, prev) => {
    if (!addr) return;
    if (input.value.trim().length === 0 || input.value.trim() === prev) {
      input.value = addr;
      void runCheck(addr);
    }
  },
  { immediate: true },
);

const canCheck = computed(() => input.value.trim().length > 0 && !checking.value);

// Mainnet is the only chain that drives the Subscribe flow today.
// Hide if we don't have a classified result for it yet.
const mainnetChainId = computed(() => {
  const m = chains.find((c) => c.monitored);
  return m?.id ?? null;
});
const mainnetResult = computed<CheckResponse | null>(() => {
  const id = mainnetChainId.value;
  if (id === null) return null;
  return chainResults.value[id] ?? null;
});
const hasMainnetDelegation = computed(
  () => !!mainnetResult.value && mainnetResult.value.currentTarget !== null,
);

async function onCheck() {
  clientError.value = null;
  const candidate = input.value.trim();
  if (!isAddress(candidate)) {
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

// --- Subscribe flow: mints a confirmation code, bot deep-links the user.
async function onSubscribe() {
  const addr = checkedAddress.value;
  if (!addr || subscribing.value) return;
  subscribing.value = true;
  subscribeError.value = null;
  confirmation.value = null;
  copied.value = false;
  try {
    confirmation.value = await api.createConfirmation(addr);
  } catch (err) {
    if (err instanceof WatcherApiException && err.detail.kind === 'invalid_eoa') {
      subscribeError.value = t('error.invalidAddress');
    } else {
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

// --- Watch flow: opens t.me/<bot>?start=w_<addr>. No backend round-trip.
// Only meaningful once mainnet has classified the address; the row hides
// the link until then anyway via its own `watchVisible` computed.
const watchLink = computed(() => {
  const addr = checkedAddress.value;
  if (!addr || !hasMainnetDelegation.value) return '';
  return `https://t.me/${botUsername}?start=w_${addr}`;
});
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
          </div>
          <p v-if="clientError" class="lookup__inlineError" role="alert">
            {{ clientError }}
          </p>
        </form>

        <div class="results">
          <section class="results__group">
            <h2 class="results__heading">{{ t('home.table.mainnetsHeading') }}</h2>
            <table class="results__table">
              <thead>
                <tr>
                  <th class="results__th results__th--chain">
                    {{ t('home.table.chain') }}
                  </th>
                  <th class="results__th">
                    {{ t('home.table.delegation') }}
                  </th>
                  <th class="results__th results__th--actions">
                    {{ t('home.table.actions') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <GChainRow
                  v-for="chain in mainnets"
                  :key="chain.id"
                  :chain="chain"
                  :address="checkedAddress"
                  :subscribing="subscribing"
                  :watch-link="watchLink"
                  @subscribe="onSubscribe"
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
            <table v-if="testnetsOpen" id="testnets-table" class="results__table">
              <thead>
                <tr>
                  <th class="results__th results__th--chain">
                    {{ t('home.table.chain') }}
                  </th>
                  <th class="results__th">
                    {{ t('home.table.delegation') }}
                  </th>
                  <th class="results__th results__th--actions">
                    {{ t('home.table.actions') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <GChainRow
                  v-for="chain in testnets"
                  :key="chain.id"
                  :chain="chain"
                  :address="checkedAddress"
                  :subscribing="subscribing"
                  :watch-link="watchLink"
                  @subscribe="onSubscribe"
                  @classified="onChainClassified"
                  @focus-input="focusLookup"
                />
              </tbody>
            </table>
          </section>

          <p v-if="subscribeError" class="home__error" role="alert">
            {{ subscribeError }}
          </p>

          <div v-if="confirmation" class="confirm">
            <h3 class="confirm__title">{{ t('home.confirm.title') }}</h3>
            <p class="confirm__body">{{ t('home.confirm.body') }}</p>

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
              class="confirm__countdown"
            >
              {{ t('home.confirm.expiresIn', { seconds: secondsRemaining }) }}
            </p>

            <div class="confirm__fallback">
              <p>{{ t('home.confirm.fallback', { bot: botUsername }) }}</p>
              <GCodeBlock>/start {{ confirmation.code }}</GCodeBlock>
              <GButton type="button" variant="ghost" size="sm" @click.stop="onCopyCode">
                {{ copied ? t('home.confirm.copied') : t('home.confirm.copyCode') }}
              </GButton>
            </div>
          </div>
        </div>
      </div>
    </section>

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
.lookup__submitBtn {
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

.lookup__inlineError {
  margin: 0 0 0 var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-error);
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

.results__th--actions {
  text-align: right;
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

/* Confirmation expansion ------------------------------------------- */

.confirm {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  background: var(--color-bg-subtle);
  border-radius: var(--radius-lg);
  border: var(--border-width) solid var(--color-border);
}

.confirm__title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-ink-strong);
}

.confirm__body {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

.confirm__countdown {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-ink-subtle);
}

.confirm__fallback {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: var(--border-width) solid var(--color-border);
}

.confirm__fallback p {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

/* How --------------------------------------------------------------- */

.how {
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
