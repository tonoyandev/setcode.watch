<script setup lang="ts">
import { computed } from 'vue';
import { useWallet } from '~/composables/useWallet';
import { t } from '~/i18n';

// Wallet connect chip for the header. Three visual states:
//   - disconnected → "Connect Wallet" brand button; click opens AppKit modal
//   - connected    → truncated address pill; click toggles a dropdown with
//                    the full address, a copy action, and Disconnect
//   - SSR pre-hydration → renders the disconnected state so the layout
//                         stays stable (useWallet() returns stubs there).
//
// Intentionally does NOT use AppKit's `<appkit-button>` web component —
// our chrome needs to match the app's visual system, and owning the button
// lets us theme it with CSS custom properties instead of fighting AppKit
// CSS vars.

import { onBeforeUnmount, onMounted, ref } from 'vue';

const { address, isConnected, open, disconnect } = useWallet();
const menuOpen = ref(false);
const copied = ref(false);

const shortAddress = computed(() => {
  const v = address.value;
  if (!v) return '';
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
});

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}
function closeMenu() {
  menuOpen.value = false;
}

async function onCopy() {
  const v = address.value;
  if (!v) return;
  try {
    await navigator.clipboard.writeText(v);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    /* clipboard denied — ignore */
  }
}

async function onDisconnect() {
  closeMenu();
  await disconnect();
}

// Close the menu on outside click. Light-weight: one document listener
// mounted only while open, scoped by a ref on the root.
const root = ref<HTMLElement | null>(null);
function onDocClick(ev: MouseEvent) {
  if (!menuOpen.value) return;
  if (root.value && !root.value.contains(ev.target as Node)) closeMenu();
}
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <div ref="root" class="g-connect">
    <ClientOnly>
      <template v-if="!isConnected">
        <GButton variant="primary" size="sm" type="button" @click.stop="open">
          {{ t('wallet.connect') }}
        </GButton>
      </template>

      <template v-else>
        <button
          class="g-connect__chip"
          type="button"
          :aria-expanded="menuOpen"
          @click.stop="toggleMenu"
        >
          <span class="g-connect__dot" aria-hidden="true" />
          <span class="g-connect__addr">{{ shortAddress }}</span>
          <span class="g-connect__caret" aria-hidden="true">▾</span>
        </button>

        <div v-if="menuOpen" class="g-connect__menu" role="menu">
          <div class="g-connect__full" role="none">
            <span class="g-connect__label">{{ t('wallet.connected') }}</span>
            <code class="g-connect__mono">{{ address }}</code>
          </div>
          <div class="g-connect__actions">
            <GButton size="sm" variant="ghost" type="button" @click.stop="onCopy">
              {{ copied ? t('wallet.copied') : t('wallet.copy') }}
            </GButton>
            <GButton size="sm" variant="secondary" type="button" @click.stop="onDisconnect">
              {{ t('wallet.disconnect') }}
            </GButton>
          </div>
        </div>
      </template>

      <template #fallback>
        <GButton variant="primary" size="sm" type="button" disabled>
          {{ t('wallet.connect') }}
        </GButton>
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.g-connect {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.g-connect__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--color-bg-surface);
  border: var(--border-width) solid var(--color-border-strong);
  color: var(--color-ink-strong);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease);
}

.g-connect__chip:hover {
  background: var(--color-bg-subtle);
}

.g-connect__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--color-verified);
}

.g-connect__caret {
  font-family: var(--font-sans);
  color: var(--color-ink-muted);
  font-size: var(--text-xs);
}

.g-connect__menu {
  position: absolute;
  right: 0;
  top: calc(100% + var(--space-2));
  min-width: 320px;
  padding: var(--space-4);
  background: var(--color-bg-surface);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.g-connect__full {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.g-connect__label {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.g-connect__mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-ink-strong);
  word-break: break-all;
}

.g-connect__actions {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}
</style>
