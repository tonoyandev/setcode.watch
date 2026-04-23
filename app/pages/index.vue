<script setup lang="ts">
import { type Address, isAddress } from 'viem';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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

const input = ref('');
const lastLookedUp = ref<Address | null>(null);
const checking = ref(false);
const result = ref<CheckResponse | null>(null);
const clientError = ref<string | null>(null);
const serverError = ref<string | null>(null);

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

async function onCheck() {
  clientError.value = null;
  serverError.value = null;
  const candidate = input.value.trim();
  if (!isAddress(candidate)) {
    clientError.value = t('error.invalidAddress');
    return;
  }
  await runCheck(candidate as Address);
}

async function runCheck(addr: Address) {
  checking.value = true;
  result.value = null;
  confirmation.value = null;
  subscribeError.value = null;
  try {
    result.value = await api.check(addr);
    lastLookedUp.value = addr.toLowerCase() as Address;
  } catch (err) {
    if (err instanceof WatcherApiException) {
      const kind = err.detail.kind;
      serverError.value =
        kind === 'invalid_eoa'
          ? t('error.invalidAddress')
          : kind === 'network'
            ? t('error.network')
            : t('error.generic');
    } else {
      serverError.value = t('error.generic');
    }
  } finally {
    checking.value = false;
  }
}

function onReset() {
  input.value = '';
  result.value = null;
  lastLookedUp.value = null;
  confirmation.value = null;
  clientError.value = null;
  serverError.value = null;
  subscribeError.value = null;
}

// --- Subscribe flow: mints a confirmation code, bot deep-links the user.
async function onSubscribe() {
  const addr = lastLookedUp.value;
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
const watchLink = computed(() => {
  const addr = lastLookedUp.value;
  if (!addr) return '';
  return `https://t.me/${botUsername}?start=w_${addr}`;
});

const sourceCopy = computed(() => {
  const src = result.value?.source;
  if (!src) return null;
  if (src === 'registry') return t('home.result.source.registry');
  if (src === 'static') return t('home.result.source.static');
  return t('home.result.source.unknown');
});

const lastUpdatedLabel = computed(() => {
  const ts = result.value?.lastUpdated;
  if (!ts) return null;
  try {
    return new Date(ts * 1000).toISOString();
  } catch {
    return null;
  }
});
</script>

<template>
  <div class="home">
    <section class="hero">
      <div class="hero__inner">
        <p class="hero__eyebrow">EIP-7702 · Ethereum mainnet</p>
        <h1 class="hero__headline">{{ t('landing.hero.headline') }}</h1>
        <p class="hero__subhead">{{ t('landing.hero.subhead') }}</p>

        <form class="lookup" @submit.prevent="onCheck">
          <GInput
            v-model="input"
            :label="t('home.lookup.label')"
            :placeholder="t('home.lookup.placeholder')"
            v-bind="clientError ? { error: clientError } : {}"
            monospace
            autocomplete="off"
          />
          <div class="lookup__hint">
            <ClientOnly>
              <span v-if="wallet.isConnected.value" class="lookup__hint-chip">
                {{ t('home.lookup.autofilled') }}
              </span>
              <span v-else class="lookup__hint-plain">
                {{ t('home.lookup.hint') }}
              </span>
            </ClientOnly>
          </div>
          <div class="lookup__actions">
            <GButton type="submit" size="lg" :disabled="!canCheck" :loading="checking">
              {{ checking ? t('home.lookup.checking') : t('home.lookup.submit') }}
            </GButton>
            <GButton
              v-if="result || clientError || serverError"
              type="button"
              variant="ghost"
              size="lg"
              @click.stop="onReset"
            >
              {{ t('home.lookup.reset') }}
            </GButton>
          </div>
        </form>

        <p v-if="serverError" class="home__error" role="alert">{{ serverError }}</p>

        <div class="hero__badges" aria-label="Classification legend">
          <GBadge classification="verified" size="inline" />
          <GBadge classification="unknown" size="inline" />
          <GBadge classification="malicious" size="inline" />
        </div>
      </div>
    </section>

    <section v-if="result" class="result">
      <GCard class="result__card" padded elevated>
        <header class="result__header">
          <h2 class="result__title">{{ t('home.result.title') }}</h2>
          <GBadge :classification="result.classification" size="card" />
        </header>

        <dl class="result__kv">
          <div class="result__kv-row">
            <dt>{{ t('home.result.eoa') }}</dt>
            <dd><GAddress :address="result.eoa" /></dd>
          </div>
          <div class="result__kv-row">
            <dt>{{ t('home.result.delegatesTo') }}</dt>
            <dd v-if="result.currentTarget">
              <GAddress :address="result.currentTarget" />
            </dd>
            <dd v-else class="result__muted">
              {{ t('home.result.noDelegation') }}
            </dd>
          </div>
          <div v-if="lastUpdatedLabel" class="result__kv-row">
            <dt>{{ t('home.result.lastUpdated') }}</dt>
            <dd class="result__muted">
              <time :datetime="lastUpdatedLabel">{{ lastUpdatedLabel }}</time>
            </dd>
          </div>
        </dl>

        <p v-if="sourceCopy" class="result__source">{{ sourceCopy }}</p>

        <div class="result__actions">
          <div class="result__cta">
            <GButton
              variant="primary"
              size="md"
              type="button"
              :loading="subscribing"
              :disabled="subscribing"
              @click.stop="onSubscribe"
            >
              {{ t('home.cta.subscribe') }}
            </GButton>
            <GTooltip :label="t('home.cta.subscribe.tooltip')" placement="top" />
          </div>

          <div class="result__cta">
            <GButton
              as="a"
              :href="watchLink"
              variant="secondary"
              size="md"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ t('home.cta.watch') }}
            </GButton>
            <GTooltip :label="t('home.cta.watch.tooltip')" placement="top" />
          </div>
        </div>

        <p v-if="subscribeError" class="home__error" role="alert">{{ subscribeError }}</p>

        <div v-if="confirmation" class="confirm">
          <h3 class="confirm__title">{{ t('home.confirm.title') }}</h3>
          <p class="confirm__body">{{ t('home.confirm.body') }}</p>

          <GButton
            v-if="!expired"
            as="a"
            :href="confirmation.deepLink"
            variant="primary"
            size="lg"
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
      </GCard>
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

.lookup {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.lookup__hint {
  font-size: var(--text-sm);
}

.lookup__hint-chip {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  background: var(--color-verified-bg);
  color: var(--color-verified);
  border-radius: var(--radius-pill);
  font-weight: var(--weight-medium);
}

.lookup__hint-plain {
  color: var(--color-ink-muted);
}

.lookup__actions {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.hero__badges {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-4);
  flex-wrap: wrap;
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

/* Result ------------------------------------------------------------ */

.result {
  padding: 0 var(--space-6);
  margin-bottom: var(--space-10);
}

.result__card {
  max-width: var(--width-content);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.result__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.result__title {
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  color: var(--color-ink-strong);
  margin: 0;
}

.result__kv {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
}

.result__kv-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.result__kv-row dt {
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
  font-weight: var(--weight-medium);
}

.result__kv-row dd {
  margin: 0;
  color: var(--color-ink-strong);
}

.result__muted {
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.result__source {
  margin: 0;
  padding-top: var(--space-3);
  border-top: var(--border-width) solid var(--color-border);
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.result__actions {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
  padding-top: var(--space-3);
  border-top: var(--border-width) solid var(--color-border);
}

.result__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
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
</style>
