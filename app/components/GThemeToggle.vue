<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next';
import { computed } from 'vue';
import { useTheme } from '~/composables/useTheme';
import { t } from '~/i18n';

// Icon-only button that flips the global theme. Mirrors the Connect Wallet
// chip visually — same pill metrics, same border treatment — so the header
// right-hand cluster reads as a single control strip.
//
// SSR renders the dark-state icon (moon). After hydration the real state
// settles from the pre-hydration script + localStorage.

const { theme, toggle } = useTheme();

const label = computed(() =>
  theme.value === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark'),
);
</script>

<template>
  <button
    class="g-theme"
    type="button"
    :aria-label="label"
    :title="label"
    @click="toggle"
  >
    <Sun v-if="theme === 'dark'" :size="16" aria-hidden="true" />
    <Moon v-else :size="16" aria-hidden="true" />
  </button>
</template>

<style scoped>
.g-theme {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-pill);
  background: var(--color-bg-surface);
  border: var(--border-width) solid var(--color-border-strong);
  color: var(--color-ink-strong);
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);
}

.g-theme:hover {
  background: var(--color-bg-subtle);
  color: var(--color-brand);
}
</style>
