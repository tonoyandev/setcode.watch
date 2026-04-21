<script setup lang="ts">
interface Props {
  language?: string;
}

withDefaults(defineProps<Props>(), {
  language: 'text',
});
</script>

<template>
  <pre class="g-codeblock" :data-language="language"><code><slot /></code></pre>
</template>

<style scoped>
.g-codeblock {
  background: var(--color-bg-inset);
  color: var(--color-ink-strong);
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
  overflow-x: auto;
  border: var(--border-width) solid var(--color-border);
}

.g-codeblock code {
  font-family: inherit;
  background: none;
  padding: 0;
}
</style>
