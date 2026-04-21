<script setup lang="ts">
import type { Classification } from '@setcode/shared/types';
import { CircleHelp, ShieldAlert, ShieldCheck } from 'lucide-vue-next';
import { computed } from 'vue';
import { t } from '~/i18n';

interface Props {
  classification: Classification;
  size?: 'inline' | 'card' | 'hero';
  showLabel?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  size: 'card',
  showLabel: true,
});

const icon = computed(() => {
  switch (props.classification) {
    case 'verified':
      return ShieldCheck;
    case 'malicious':
      return ShieldAlert;
    default:
      return CircleHelp;
  }
});

const label = computed(() => {
  switch (props.classification) {
    case 'verified':
      return t('classification.verified');
    case 'malicious':
      return t('classification.malicious');
    default:
      return t('classification.unknown');
  }
});

const tooltip = computed(() => {
  switch (props.classification) {
    case 'verified':
      return t('classification.verified.tooltip');
    case 'malicious':
      return t('classification.malicious.tooltip');
    default:
      return t('classification.unknown.tooltip');
  }
});

const iconSize = computed(() => {
  switch (props.size) {
    case 'inline':
      return 14;
    case 'hero':
      return 32;
    default:
      return 20;
  }
});
</script>

<template>
  <span
    class="g-badge"
    :class="[`g-badge--${classification}`, `g-badge--${size}`]"
    :title="tooltip"
    role="status"
    v-bind="showLabel ? {} : { 'aria-label': label }"
  >
    <component :is="icon" :size="iconSize" aria-hidden="true" />
    <span v-if="showLabel" class="g-badge__label">{{ label }}</span>
  </span>
</template>

<style scoped>
.g-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border: var(--border-width) solid transparent;
  border-radius: var(--radius-pill);
  font-family: var(--font-sans);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  line-height: 1;
}

.g-badge--inline {
  padding: 2px var(--space-2);
  font-size: var(--text-xs);
  gap: var(--space-1);
}

.g-badge--card {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
}

.g-badge--hero {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-lg);
  border-radius: var(--radius-lg);
  gap: var(--space-3);
}

.g-badge--verified {
  background: var(--color-verified-bg);
  color: var(--color-verified);
  border-color: var(--color-verified-border);
}

.g-badge--unknown {
  background: var(--color-unknown-bg);
  color: var(--color-unknown);
  border-color: var(--color-unknown-border);
}

.g-badge--malicious {
  background: var(--color-malicious-bg);
  color: var(--color-malicious);
  border-color: var(--color-malicious-border);
}

.g-badge__label {
  letter-spacing: 0.01em;
}
</style>
