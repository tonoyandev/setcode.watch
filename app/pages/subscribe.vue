<script setup lang="ts">
import { type Address, isAddress } from 'viem';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  type CreateConfirmationResponse,
  WatcherApiException,
  useWatcherApi,
} from '~/composables/useWatcherApi';
import { t } from '~/i18n';

useHead({ title: 'Subscribe — SetCode.watch' });

const route = useRoute();
const api = useWatcherApi();

const input = ref<string>(typeof route.query.eoa === 'string' ? route.query.eoa : '');
const submitting = ref(false);
const confirmation = ref<CreateConfirmationResponse | null>(null);
const clientError = ref<string | null>(null);
const serverError = ref<string | null>(null);
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

const canSubmit = computed(() => input.value.trim().length > 0 && !submitting.value);

const secondsRemaining = computed(() => {
  const c = confirmation.value;
  if (!c) return null;
  const exp = Date.parse(c.expiresAt);
  if (Number.isNaN(exp)) return null;
  return Math.max(0, Math.floor((exp - now.value) / 1000));
});

const expired = computed(() => secondsRemaining.value === 0);

// Parse the bot handle out of the deep-link so the fallback copy can name
// the right bot without a second runtimeConfig knob. Watcher guarantees the
// shape `https://t.me/<botUsername>?start=<code>`.
const botUsername = computed(() => {
  const link = confirmation.value?.deepLink;
  if (!link) return '';
  try {
    const url = new URL(link);
    return url.pathname.replace(/^\//, '');
  } catch {
    return '';
  }
});

async function onSubmit() {
  clientError.value = null;
  serverError.value = null;
  confirmation.value = null;
  copied.value = false;

  const candidate = input.value.trim();
  if (!isAddress(candidate)) {
    clientError.value = t('error.invalidAddress');
    return;
  }

  submitting.value = true;
  try {
    confirmation.value = await api.createConfirmation(candidate as Address);
  } catch (err: unknown) {
    if (err instanceof WatcherApiException) {
      const kind = err.detail.kind;
      serverError.value =
        kind === 'invalid_eoa'
          ? t('error.invalidAddress')
          : kind === 'network'
            ? t('error.network')
            : t('subscribe.error.cannotSendTelegram');
    } else {
      serverError.value = t('error.generic');
    }
  } finally {
    submitting.value = false;
  }
}

function onReset() {
  input.value = '';
  confirmation.value = null;
  clientError.value = null;
  serverError.value = null;
  copied.value = false;
}

async function onCopyCode() {
  const c = confirmation.value;
  if (!c) return;
  try {
    await navigator.clipboard.writeText(c.code);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // Clipboard API rejects on http:// or when the user denies permission.
    // The code is still visible in the GCodeBlock fallback — nothing to do.
  }
}
</script>

<template>
  <section class="subscribe">
    <header class="subscribe__header">
      <h1 class="subscribe__title">{{ t('subscribe.title') }}</h1>
      <p class="subscribe__intro">{{ t('subscribe.intro') }}</p>
    </header>

    <form v-if="!confirmation" class="subscribe__form" @submit.prevent="onSubmit">
      <GInput
        v-model="input"
        :label="t('subscribe.input.label')"
        :placeholder="t('subscribe.input.placeholder')"
        v-bind="clientError ? { error: clientError } : {}"
        monospace
        autocomplete="off"
      />
      <div class="subscribe__actions">
        <GButton type="submit" :disabled="!canSubmit" :loading="submitting">
          {{ submitting ? t('subscribe.submitting') : t('subscribe.submit') }}
        </GButton>
      </div>
    </form>

    <p v-if="serverError" class="subscribe__server-error" role="alert">
      {{ serverError }}
    </p>

    <GCard v-if="confirmation" class="subscribe__card" padded elevated>
      <h2 class="subscribe__card-title">{{ t('subscribe.result.title') }}</h2>
      <p class="subscribe__card-body">{{ t('subscribe.result.body') }}</p>

      <GButton
        v-if="!expired"
        as="a"
        :href="confirmation.deepLink"
        variant="primary"
        size="lg"
      >
        {{ t('subscribe.result.cta') }}
      </GButton>
      <p v-else class="subscribe__expired" role="alert">
        {{ t('subscribe.result.expired') }}
      </p>

      <p v-if="secondsRemaining !== null && !expired" class="subscribe__countdown">
        {{ t('subscribe.result.expiresIn', { seconds: secondsRemaining }) }}
      </p>

      <div class="subscribe__fallback">
        <p>
          {{ t('subscribe.result.fallback', { bot: botUsername }) }}
        </p>
        <GCodeBlock>/start {{ confirmation.code }}</GCodeBlock>
        <GButton type="button" variant="ghost" size="sm" @click.stop="onCopyCode">
          {{ copied ? t('subscribe.result.copied') : t('subscribe.result.copyCode') }}
        </GButton>
      </div>

      <div class="subscribe__reset">
        <GButton type="button" variant="ghost" @click.stop="onReset">
          {{ t('subscribe.reset') }}
        </GButton>
      </div>
    </GCard>
  </section>
</template>

<style scoped>
.subscribe {
  max-width: var(--width-content);
  margin: var(--space-12) auto var(--space-16);
  padding: 0 var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.subscribe__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.subscribe__title {
  font-size: var(--text-3xl);
  font-weight: var(--weight-semibold);
  color: var(--color-ink-strong);
  line-height: var(--leading-tight);
  margin: 0;
}

.subscribe__intro {
  color: var(--color-ink-muted);
  font-size: var(--text-lg);
  line-height: var(--leading-normal);
  margin: 0;
}

.subscribe__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.subscribe__actions {
  display: flex;
  gap: var(--space-3);
}

.subscribe__server-error {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-malicious-bg);
  border: var(--border-width) solid var(--color-malicious-border);
  color: var(--color-malicious);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.subscribe__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.subscribe__card-title {
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  color: var(--color-ink-strong);
  margin: 0;
}

.subscribe__card-body {
  margin: 0;
  color: var(--color-ink-muted);
  line-height: var(--leading-normal);
}

.subscribe__countdown {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-ink-subtle);
}

.subscribe__expired {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-malicious-bg);
  border: var(--border-width) solid var(--color-malicious-border);
  color: var(--color-malicious);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.subscribe__fallback {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: var(--border-width) solid var(--color-border);
}

.subscribe__fallback p {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

.subscribe__reset {
  display: flex;
  justify-content: flex-start;
}
</style>
