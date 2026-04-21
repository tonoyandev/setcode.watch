<script setup lang="ts">
useHead({ title: 'Check an address — SetCode.watch' });
</script>

<template>
  <div class="stub">
    <h1>Address lookup</h1>
    <p>
      This flow lands in the next step — type an address, see its current EIP-7702 delegation and
      classification. For now, use the bot on Telegram to subscribe directly.
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
