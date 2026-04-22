<script setup lang="ts">
import type { Address } from 'viem';
import { computed, onMounted, ref } from 'vue';
import {
  type ManageSubscription,
  WatcherApiException,
  useWatcherApi,
} from '~/composables/useWatcherApi';
import { t } from '~/i18n';

useHead({ title: 'Manage subscriptions — SetCode.watch' });

const route = useRoute();
const api = useWatcherApi();

// Opaque token carried in the URL path. Matches the server-side TOKEN_RE
// shape so obviously malformed links fail fast without a round-trip.
const token = computed<string>(() => {
  const raw = route.params.token;
  return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
});
const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;
const tokenLooksValid = computed(() => TOKEN_RE.test(token.value));

const loading = ref(false);
const subscriptions = ref<ManageSubscription[]>([]);
const loadError = ref<string | null>(null);
// Per-row async state so rapid-fire clicks don't interfere with each other.
const removingEoa = ref<Address | null>(null);
const rowError = ref<{ eoa: Address; message: string } | null>(null);
const rowNotice = ref<{ eoa: Address; message: string } | null>(null);

async function loadSubscriptions() {
  loadError.value = null;
  if (!tokenLooksValid.value) {
    loadError.value = t('manage.invalidToken');
    subscriptions.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await api.listManage(token.value);
    subscriptions.value = res.subscriptions;
  } catch (err: unknown) {
    subscriptions.value = [];
    if (err instanceof WatcherApiException) {
      const kind = err.detail.kind;
      loadError.value =
        kind === 'invalid_token'
          ? t('manage.invalidToken')
          : kind === 'not_found'
            ? t('manage.notFound')
            : kind === 'network'
              ? t('error.network')
              : t('error.generic');
    } else {
      loadError.value = t('error.generic');
    }
  } finally {
    loading.value = false;
  }
}

async function onRemove(eoa: Address) {
  rowError.value = null;
  rowNotice.value = null;
  removingEoa.value = eoa;
  try {
    const res = await api.removeManage(token.value, eoa);
    if (res.removed) {
      subscriptions.value = subscriptions.value.filter((s) => s.eoa !== eoa);
      rowNotice.value = { eoa, message: t('manage.removed', { eoa }) };
    } else {
      // Nothing matched — row was probably stale; refresh to resync.
      await loadSubscriptions();
    }
  } catch (err: unknown) {
    if (err instanceof WatcherApiException) {
      const kind = err.detail.kind;
      if (kind === 'not_found' || kind === 'invalid_token') {
        loadError.value =
          kind === 'invalid_token' ? t('manage.invalidToken') : t('manage.notFound');
        subscriptions.value = [];
      } else {
        rowError.value = { eoa, message: t('manage.removeFailed', { eoa }) };
      }
    } else {
      rowError.value = { eoa, message: t('manage.removeFailed', { eoa }) };
    }
  } finally {
    removingEoa.value = null;
  }
}

function formatConfirmedAt(iso: string): string {
  try {
    return new Date(iso).toISOString();
  } catch {
    return iso;
  }
}

onMounted(() => {
  void loadSubscriptions();
});
</script>

<template>
  <section class="manage">
    <header class="manage__header">
      <h1 class="manage__title">{{ t('manage.title') }}</h1>
      <p class="manage__intro">{{ t('manage.intro') }}</p>
    </header>

    <div class="manage__toolbar">
      <GButton
        variant="ghost"
        size="sm"
        type="button"
        :disabled="loading"
        @click.stop="loadSubscriptions"
      >
        {{ t('manage.refresh') }}
      </GButton>
    </div>

    <p v-if="loadError" class="manage__error" role="alert">{{ loadError }}</p>

    <p v-else-if="loading" class="manage__muted">{{ t('manage.loading') }}</p>

    <GCard
      v-else-if="subscriptions.length === 0"
      class="manage__card"
      padded
    >
      <p class="manage__muted">{{ t('manage.empty') }}</p>
    </GCard>

    <div v-else class="manage__list">
      <p class="manage__count">
        {{ t('manage.count', { count: subscriptions.length }) }}
      </p>
      <GCard
        v-for="sub in subscriptions"
        :key="sub.eoa"
        class="manage__row"
        padded
      >
        <div class="manage__row-body">
          <GAddress :address="sub.eoa" />
          <p class="manage__row-meta">
            {{ t('manage.confirmedAt', { when: formatConfirmedAt(sub.confirmedAt) }) }}
          </p>
        </div>
        <div class="manage__row-actions">
          <GButton
            variant="secondary"
            size="sm"
            type="button"
            :loading="removingEoa === sub.eoa"
            :disabled="removingEoa !== null && removingEoa !== sub.eoa"
            @click.stop="onRemove(sub.eoa)"
          >
            {{ removingEoa === sub.eoa ? t('manage.removing') : t('manage.remove') }}
          </GButton>
        </div>
        <p
          v-if="rowError && rowError.eoa === sub.eoa"
          class="manage__row-error"
          role="alert"
        >
          {{ rowError.message }}
        </p>
      </GCard>
      <p
        v-if="rowNotice"
        class="manage__notice"
        role="status"
      >
        {{ rowNotice.message }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.manage {
  max-width: var(--width-content);
  margin: var(--space-12) auto var(--space-16);
  padding: 0 var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.manage__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.manage__title {
  font-size: var(--text-3xl);
  font-weight: var(--weight-semibold);
  color: var(--color-ink-strong);
  line-height: var(--leading-tight);
  margin: 0;
}

.manage__intro {
  color: var(--color-ink-muted);
  font-size: var(--text-lg);
  line-height: var(--leading-normal);
  margin: 0;
}

.manage__toolbar {
  display: flex;
  justify-content: flex-end;
}

.manage__error {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-malicious-bg);
  border: var(--border-width) solid var(--color-malicious-border);
  color: var(--color-malicious);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.manage__muted {
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
  margin: 0;
}

.manage__card {
  display: block;
}

.manage__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.manage__count {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.manage__row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-4);
  align-items: center;
}

.manage__row-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.manage__row-meta {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.manage__row-actions {
  display: flex;
  justify-content: flex-end;
}

.manage__row-error {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--color-malicious);
  font-size: var(--text-sm);
}

.manage__notice {
  margin: 0;
  color: var(--color-verified);
  font-size: var(--text-sm);
}

@media (max-width: 480px) {
  .manage__row {
    grid-template-columns: 1fr;
  }
  .manage__row-actions {
    justify-content: flex-start;
  }
}
</style>
