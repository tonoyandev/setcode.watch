<script setup lang="ts">
import { t } from '~/i18n';
</script>

<template>
  <div class="layout">
    <header class="layout__header">
      <div class="layout__bar">
        <NuxtLink to="/" class="layout__brand" aria-label="SetCode.watch home">
          <span class="layout__brandMark">setcode</span>
          <span class="layout__brandDot">.</span>
          <span class="layout__brandTail">watch</span>
        </NuxtLink>
        <div class="layout__right">
          <nav class="layout__nav" aria-label="Primary">
            <NuxtLink to="/registry" class="layout__link">{{ t('nav.registry') }}</NuxtLink>
          </nav>
          <GConnectButton />
        </div>
      </div>
    </header>

    <main class="layout__main">
      <slot />
    </main>

    <footer class="layout__footer">
      <div class="layout__footerInner">
        <p class="layout__tagline">{{ t('footer.tagline') }}</p>
        <a
          href="https://github.com/tonoyandev/setcode.watch"
          target="_blank"
          rel="noopener noreferrer"
          class="layout__link"
        >
          {{ t('footer.github') }}
        </a>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.layout {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.layout__header {
  border-bottom: var(--border-width) solid var(--color-border);
  background: var(--color-bg-page);
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: saturate(1.1);
}

.layout__bar {
  max-width: var(--width-page);
  margin: 0 auto;
  padding: var(--space-4) var(--space-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
}

.layout__brand {
  font-family: var(--font-mono);
  font-weight: var(--weight-semibold);
  font-size: var(--text-lg);
  color: var(--color-ink-strong);
  text-decoration: none;
  letter-spacing: -0.01em;
}

.layout__brandDot {
  color: var(--color-brand);
}

.layout__brandTail {
  color: var(--color-ink-muted);
}

.layout__right {
  display: flex;
  align-items: center;
  gap: var(--space-5);
}

.layout__nav {
  display: flex;
  gap: var(--space-6);
}

.layout__link {
  color: var(--color-ink-muted);
  text-decoration: none;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  transition: color var(--duration-fast) var(--ease);
}

.layout__link:hover,
.layout__link.router-link-active {
  color: var(--color-ink-strong);
}

.layout__main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.layout__footer {
  border-top: var(--border-width) solid var(--color-border);
  background: var(--color-bg-subtle);
  padding: var(--space-8) var(--space-6);
  margin-top: var(--space-16);
}

.layout__footerInner {
  max-width: var(--width-page);
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.layout__tagline {
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
  margin: 0;
  max-width: none;
}
</style>
