<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  type Classification,
  type RegistryEntry,
  WatcherApiException,
  useWatcherApi,
} from '~/composables/useWatcherApi';
import { t } from '~/i18n';

useHead({ title: 'Registry — SetCode.watch' });

const api = useWatcherApi();
const PAGE_SIZE = 20;

type Filter = 'all' | Classification;
const selectedFilter = ref<Filter>('all');
const entries = ref<RegistryEntry[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const page = ref(1);
const currentCursor = ref(0);
const nextCursor = ref<number | null>(null);

const filterOptions = [
  { key: 'all' as const, label: t('registry.filter.all') },
  { key: 'verified' as const, label: t('registry.filter.verified') },
  { key: 'unknown' as const, label: t('registry.filter.unknown') },
  { key: 'malicious' as const, label: t('registry.filter.malicious') },
];

const canGoPrev = computed(() => currentCursor.value > 0 && !loading.value);
const canGoNext = computed(() => nextCursor.value !== null && !loading.value);

async function loadPage(cursor = 0) {
  loadError.value = null;
  loading.value = true;

  const classification =
    selectedFilter.value === 'all' ? undefined : (selectedFilter.value as Classification);

  try {
    const result = await api.listRegistry({
      ...(classification ? { classification } : {}),
      cursor,
      limit: PAGE_SIZE,
    });
    entries.value = result.entries;
    currentCursor.value = cursor;
    nextCursor.value = result.nextCursor;
    page.value = Math.floor(cursor / PAGE_SIZE) + 1;
  } catch (err: unknown) {
    entries.value = [];
    if (err instanceof WatcherApiException && err.detail.kind === 'network') {
      loadError.value = t('error.network');
    } else {
      loadError.value = t('error.generic');
    }
  } finally {
    loading.value = false;
  }
}

function onFilterChange(filter: Filter) {
  if (filter === selectedFilter.value || loading.value) return;
  selectedFilter.value = filter;
  void loadPage(0);
}

function onPrev() {
  if (!canGoPrev.value) return;
  const prevCursor = Math.max(currentCursor.value - PAGE_SIZE, 0);
  void loadPage(prevCursor);
}

function onNext() {
  if (!canGoNext.value || nextCursor.value === null) return;
  void loadPage(nextCursor.value);
}

function formatWhen(ts: number): string {
  try {
    return new Date(ts * 1000).toISOString();
  } catch {
    return String(ts);
  }
}

onMounted(() => {
  void loadPage(0);
});
</script>

<template>
  <section class="registry">
    <header class="registry__header">
      <h1 class="registry__title">{{ t('registry.title') }}</h1>
      <p class="registry__intro">{{ t('registry.intro') }}</p>
    </header>

    <div class="registry__toolbar">
      <div class="registry__filters">
        <GButton
          v-for="option in filterOptions"
          :key="option.key"
          size="sm"
          type="button"
          :variant="selectedFilter === option.key ? 'primary' : 'ghost'"
          :disabled="loading"
          @click.stop="onFilterChange(option.key)"
        >
          {{ option.label }}
        </GButton>
      </div>
      <GButton variant="ghost" size="sm" type="button" :disabled="loading" @click.stop="loadPage(0)">
        {{ t('registry.refresh') }}
      </GButton>
    </div>

    <p v-if="loadError" class="registry__error" role="alert">{{ loadError }}</p>
    <p v-else-if="loading" class="registry__muted">{{ t('registry.loading') }}</p>
    <GCard v-else-if="entries.length === 0" class="registry__card" padded>
      <p class="registry__muted">{{ t('registry.empty') }}</p>
    </GCard>

    <div v-else class="registry__list">
      <GCard v-for="entry in entries" :key="entry.target" class="registry__row" padded>
        <div class="registry__row-header">
          <GAddress :address="entry.target" />
          <GBadge :classification="entry.classification" size="card" />
        </div>
        <dl class="registry__kv">
          <div class="registry__kv-row">
            <dt>{{ t('registry.reason') }}</dt>
            <dd>{{ entry.reason }}</dd>
          </div>
          <div class="registry__kv-row">
            <dt>{{ t('registry.lastClassifiedAt') }}</dt>
            <dd class="registry__muted">
              <time :datetime="formatWhen(entry.lastClassifiedAt)">
                {{ formatWhen(entry.lastClassifiedAt) }}
              </time>
            </dd>
          </div>
        </dl>
      </GCard>
    </div>

    <div class="registry__pagination">
      <GButton size="sm" variant="ghost" type="button" :disabled="!canGoPrev" @click.stop="onPrev">
        {{ t('registry.prev') }}
      </GButton>
      <p class="registry__page">{{ t('registry.page', { page }) }}</p>
      <GButton size="sm" variant="ghost" type="button" :disabled="!canGoNext" @click.stop="onNext">
        {{ t('registry.next') }}
      </GButton>
    </div>
  </section>
</template>

<style scoped>
.registry {
  max-width: var(--width-content);
  margin: var(--space-12) auto var(--space-16);
  padding: 0 var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.registry__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.registry__title {
  margin: 0;
  font-size: var(--text-3xl);
  font-weight: var(--weight-semibold);
  color: var(--color-ink-strong);
  line-height: var(--leading-tight);
}

.registry__intro {
  margin: 0;
  color: var(--color-ink-muted);
  margin-top: var(--space-4);
  font-size: var(--text-lg);
}

.registry__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.registry__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.registry__error {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-malicious-bg);
  border: var(--border-width) solid var(--color-malicious-border);
  color: var(--color-malicious);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.registry__card {
  display: block;
}

.registry__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.registry__row {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.registry__row-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.registry__kv {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
}

.registry__kv-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.registry__kv-row dt {
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
  font-weight: var(--weight-medium);
}

.registry__kv-row dd {
  margin: 0;
}

.registry__muted {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.registry__pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.registry__page {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}
</style>
