<script setup lang="ts">
import { type Address, isAddress } from 'viem';
import { computed, ref } from 'vue';
import {
  type CheckResponse,
  WatcherApiException,
  useWatcherApi,
} from '~/composables/useWatcherApi';
import { t } from '~/i18n';

useHead({ title: 'Check an address — SetCode.watch' });

const api = useWatcherApi();

const input = ref('');
const submitting = ref(false);
const result = ref<CheckResponse | null>(null);
const clientError = ref<string | null>(null);
const serverError = ref<string | null>(null);

const canSubmit = computed(() => input.value.trim().length > 0 && !submitting.value);

async function onSubmit() {
  clientError.value = null;
  serverError.value = null;
  result.value = null;

  const candidate = input.value.trim();
  if (!isAddress(candidate)) {
    clientError.value = t('error.invalidAddress');
    return;
  }

  submitting.value = true;
  try {
    result.value = await api.check(candidate as Address);
  } catch (err: unknown) {
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
    submitting.value = false;
  }
}

function onReset() {
  input.value = '';
  result.value = null;
  clientError.value = null;
  serverError.value = null;
}

const lastUpdatedLabel = computed(() => {
  const ts = result.value?.lastUpdated;
  if (!ts) return null;
  try {
    return new Date(ts * 1000).toISOString();
  } catch {
    return null;
  }
});

const sourceCopy = computed(() => {
  const src = result.value?.source;
  if (!src) return null;
  if (src === 'registry') return t('check.result.source.registry');
  if (src === 'static') return t('check.result.source.static');
  return t('check.result.source.unknown');
});
</script>

<template>
  <section class="check">
    <header class="check__header">
      <h1 class="check__title">{{ t('check.title') }}</h1>
      <p class="check__intro">{{ t('check.intro') }}</p>
    </header>

    <form class="check__form" @submit.prevent="onSubmit">
      <GInput
        v-model="input"
        :label="t('check.input.label')"
        :placeholder="t('check.input.placeholder')"
        v-bind="clientError ? { error: clientError } : {}"
        monospace
        autocomplete="off"
      />
      <div class="check__actions">
        <GButton type="submit" :disabled="!canSubmit" :loading="submitting">
          {{ submitting ? t('check.submitting') : t('check.submit') }}
        </GButton>
        <GButton
          v-if="result || clientError || serverError"
          type="button"
          variant="ghost"
          @click.stop="onReset"
        >
          {{ t('check.reset') }}
        </GButton>
      </div>
    </form>

    <p v-if="serverError" class="check__server-error" role="alert">
      {{ serverError }}
    </p>

    <GCard v-if="result" class="check__result" padded elevated>
      <header class="check__result-header">
        <h2 class="check__result-title">{{ t('check.result.title') }}</h2>
        <GBadge :classification="result.classification" size="card" />
      </header>

      <dl class="check__kv">
        <div class="check__kv-row">
          <dt>EOA</dt>
          <dd><GAddress :address="result.eoa" /></dd>
        </div>
        <div class="check__kv-row">
          <dt>{{ t('check.result.delegatesTo') }}</dt>
          <dd v-if="result.currentTarget">
            <GAddress :address="result.currentTarget" />
          </dd>
          <dd v-else class="check__kv-muted">
            {{ t('check.result.noDelegation') }}
          </dd>
        </div>
        <div v-if="lastUpdatedLabel" class="check__kv-row">
          <dt>{{ t('check.result.lastUpdated') }}</dt>
          <dd class="check__kv-muted">
            <time :datetime="lastUpdatedLabel">{{ lastUpdatedLabel }}</time>
          </dd>
        </div>
      </dl>

      <p class="check__source">{{ sourceCopy }}</p>

      <div class="check__cta">
        <NuxtLink :to="`/subscribe?eoa=${result.eoa}`" class="check__cta-link">
          {{ t('check.result.subscribeCta') }}
        </NuxtLink>
      </div>
    </GCard>
  </section>
</template>

<style scoped>
.check {
  max-width: var(--width-content);
  margin: var(--space-12) auto var(--space-16);
  padding: 0 var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.check__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.check__title {
  font-size: var(--text-3xl);
  font-weight: var(--weight-semibold);
  color: var(--color-ink-strong);
  line-height: var(--leading-tight);
  margin: 0;
}

.check__intro {
  color: var(--color-ink-muted);
  font-size: var(--text-lg);
  line-height: var(--leading-normal);
  margin: 0;
}

.check__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.check__actions {
  display: flex;
  gap: var(--space-3);
}

.check__server-error {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-malicious-bg);
  border: var(--border-width) solid var(--color-malicious-border);
  color: var(--color-malicious);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.check__result {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.check__result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.check__result-title {
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  color: var(--color-ink-strong);
  margin: 0;
}

.check__kv {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
}

.check__kv-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.check__kv-row dt {
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
  font-weight: var(--weight-medium);
}

.check__kv-row dd {
  margin: 0;
  color: var(--color-ink-strong);
}

.check__kv-muted {
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.check__source {
  margin: 0;
  padding-top: var(--space-3);
  border-top: var(--border-width) solid var(--color-border);
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.check__cta {
  display: flex;
  justify-content: flex-start;
}

.check__cta-link {
  color: var(--color-brand);
  font-weight: var(--weight-medium);
  text-decoration: none;
  border-bottom: var(--border-width) solid transparent;
  transition: border-color var(--duration-fast) var(--ease);
}

.check__cta-link:hover {
  border-bottom-color: var(--color-brand);
}
</style>
