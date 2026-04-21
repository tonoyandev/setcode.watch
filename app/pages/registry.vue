<script setup lang="ts">
useHead({ title: 'Registry — SetCode.watch' });
</script>

<template>
  <div class="stub">
    <h1>Registry</h1>
    <p>
      Verified delegation targets live in <code>@setcode/shared/registry.json</code>. A browsable
      UI with filtering and classification history lands in a later step.
    </p>
  </div>
</template>

<style scoped>
.stub {
  max-width: var(--width-content);
  margin: var(--space-16) auto;
  padding: 0 var(--space-6);
}
.stub p {
  color: var(--color-ink-muted);
  margin-top: var(--space-4);
  font-size: var(--text-lg);
}
</style>
