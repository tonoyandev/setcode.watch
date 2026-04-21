<script setup lang="ts">
import { computed } from 'vue';

// Primary brand CTA, secondary outline, ghost (text-only). `type="submit"`
// should be set explicitly by the caller inside a <form> — the default is
// "button" to prevent accidental form submission.
interface Props {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
  as?: 'button' | 'a';
  href?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
  as: 'button',
});

const classes = computed(() => [
  'g-button',
  `g-button--${props.variant}`,
  `g-button--${props.size}`,
  { 'g-button--loading': props.loading },
]);

// Conditionally include attrs only when they apply. exactOptionalPropertyTypes
// forbids passing `undefined` for HTMLAttributes whose d.ts marks them as
// optional string/boolean — so we spread them via v-bind="attrs" instead.
const attrs = computed<Record<string, unknown>>(() => {
  const a: Record<string, unknown> = {};
  if (props.as === 'button') {
    a.type = props.type;
    a.disabled = props.disabled || props.loading;
  } else if (props.href !== undefined) {
    a.href = props.href;
  }
  if (props.loading) a['aria-busy'] = 'true';
  return a;
});
</script>

<template>
  <component
    :is="as === 'a' ? 'a' : 'button'"
    :class="classes"
    v-bind="attrs"
  >
    <span v-if="loading" class="g-button__spinner" aria-hidden="true" />
    <slot />
  </component>
</template>

<style scoped>
.g-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border-radius: var(--radius-md);
  border: var(--border-width) solid transparent;
  font-family: var(--font-sans);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease);
  text-decoration: none;
  white-space: nowrap;
}

.g-button:disabled,
.g-button[aria-disabled='true'] {
  cursor: not-allowed;
  opacity: 0.55;
}

.g-button--sm {
  font-size: var(--text-sm);
  padding: var(--space-2) var(--space-3);
}
.g-button--md {
  font-size: var(--text-base);
  padding: var(--space-3) var(--space-5);
}
.g-button--lg {
  font-size: var(--text-lg);
  padding: var(--space-4) var(--space-6);
}

/* Variants */
.g-button--primary {
  background: var(--color-brand);
  color: var(--color-brand-ink);
  border-color: var(--color-brand);
}
.g-button--primary:hover:not(:disabled) {
  background: var(--color-brand-hover);
  border-color: var(--color-brand-hover);
}

.g-button--secondary {
  background: var(--color-bg-surface);
  color: var(--color-ink-strong);
  border-color: var(--color-border-strong);
}
.g-button--secondary:hover:not(:disabled) {
  background: var(--color-bg-subtle);
}

.g-button--ghost {
  background: transparent;
  color: var(--color-ink);
  border-color: transparent;
}
.g-button--ghost:hover:not(:disabled) {
  background: var(--color-bg-subtle);
}

.g-button__spinner {
  width: 1em;
  height: 1em;
  border-radius: var(--radius-pill);
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: g-button-spin 700ms linear infinite;
}

@keyframes g-button-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
