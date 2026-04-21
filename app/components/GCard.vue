<script setup lang="ts">
interface Props {
  padded?: boolean;
  elevated?: boolean;
  as?: string;
}

withDefaults(defineProps<Props>(), {
  padded: true,
  elevated: false,
  as: 'section',
});
</script>

<template>
  <component
    :is="as"
    class="g-card"
    :class="{ 'g-card--padded': padded, 'g-card--elevated': elevated }"
  >
    <slot />
  </component>
</template>

<style scoped>
.g-card {
  background: var(--color-bg-surface);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-lg);
}

.g-card--padded {
  padding: var(--space-6);
}

.g-card--elevated {
  box-shadow: var(--shadow-md);
}
</style>
