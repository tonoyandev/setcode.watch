<script setup lang="ts">
import { computed, useId } from 'vue';

interface Props {
  modelValue: string;
  label?: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'search';
  error?: string;
  help?: string;
  monospace?: boolean;
  disabled?: boolean;
  autocomplete?: string;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  monospace: false,
  disabled: false,
  autocomplete: 'off',
});

defineEmits<(e: 'update:modelValue', value: string) => void>();

const id = useId();
const helpId = `${id}-help`;
const errorId = `${id}-error`;

// exactOptionalPropertyTypes forbids passing `undefined` to attribute slots
// typed as plain `string`. Build the attribute object so only defined keys
// appear on the rendered <input>.
const inputAttrs = computed<Record<string, unknown>>(() => {
  const a: Record<string, unknown> = {
    autocomplete: props.autocomplete,
    type: props.type,
    disabled: props.disabled,
  };
  if (props.placeholder !== undefined) a.placeholder = props.placeholder;
  if (props.error) {
    a['aria-invalid'] = 'true';
    a['aria-describedby'] = errorId;
  } else if (props.help) {
    a['aria-describedby'] = helpId;
  }
  return a;
});
</script>

<template>
  <div class="g-input" :class="{ 'g-input--error': !!error }">
    <label v-if="label" :for="id" class="g-input__label">{{ label }}</label>
    <input
      :id="id"
      :value="modelValue"
      :class="['g-input__field', { 'g-input__field--mono': monospace }]"
      v-bind="inputAttrs"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <p v-if="error" :id="errorId" class="g-input__error" role="alert">{{ error }}</p>
    <p v-else-if="help" :id="helpId" class="g-input__help">{{ help }}</p>
  </div>
</template>

<style scoped>
.g-input {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.g-input__label {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-ink-strong);
}

.g-input__field {
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-surface);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--color-ink-strong);
  transition: border-color var(--duration-fast) var(--ease);
}

.g-input__field::placeholder {
  color: var(--color-ink-subtle);
}

.g-input__field--mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  letter-spacing: -0.01em;
}

.g-input__field:hover:not(:disabled) {
  border-color: var(--color-ink-muted);
}

.g-input__field:disabled {
  background: var(--color-bg-subtle);
  cursor: not-allowed;
  opacity: 0.7;
}

.g-input--error .g-input__field {
  border-color: var(--color-error);
}

.g-input__help {
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
  margin: 0;
}

.g-input__error {
  font-size: var(--text-sm);
  color: var(--color-error);
  margin: 0;
}
</style>
