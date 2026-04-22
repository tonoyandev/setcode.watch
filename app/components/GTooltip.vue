<script setup lang="ts">
import { ref } from 'vue';

// Minimal info-tooltip primitive. A small "?" trigger that reveals a
// positioned label on hover / focus / tap. Accessible via:
//   - role="button", tabindex=0 so keyboard users reach it
//   - aria-describedby pointing at the popover id
//   - Escape collapses an open tooltip
//
// CSS-only positioning (top by default; flip to bottom with `placement="bottom"`).
// No third-party floating-ui dependency — the labels are short and the
// triggers live inside stable layouts.

interface Props {
  label: string;
  placement?: 'top' | 'bottom';
  size?: 'sm' | 'md';
}

const props = withDefaults(defineProps<Props>(), {
  placement: 'top',
  size: 'sm',
});

const open = ref(false);
const uid = `gtt-${Math.random().toString(36).slice(2, 10)}`;

function show() {
  open.value = true;
}
function hide() {
  open.value = false;
}
function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') hide();
  else if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    open.value = !open.value;
  }
}
</script>

<template>
  <span
    :class="['g-tooltip', `g-tooltip--${props.placement}`, `g-tooltip--${props.size}`]"
  >
    <span
      class="g-tooltip__trigger"
      role="button"
      tabindex="0"
      :aria-describedby="uid"
      :aria-expanded="open"
      @mouseenter="show"
      @mouseleave="hide"
      @focus="show"
      @blur="hide"
      @keydown="onKeydown"
      @click.stop="open = !open"
    >
      ?
    </span>
    <span
      v-show="open"
      :id="uid"
      class="g-tooltip__bubble"
      role="tooltip"
    >
      {{ label }}
    </span>
  </span>
</template>

<style scoped>
.g-tooltip {
  position: relative;
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  margin-left: var(--space-1);
}

.g-tooltip__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1em;
  height: 1.1em;
  border-radius: var(--radius-pill);
  background: var(--color-bg-subtle);
  color: var(--color-ink-muted);
  border: var(--border-width) solid var(--color-border);
  font-size: 0.72em;
  font-weight: var(--weight-semibold);
  font-family: var(--font-sans);
  cursor: help;
  user-select: none;
  line-height: 1;
  transition:
    background var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease);
}

.g-tooltip__trigger:hover,
.g-tooltip__trigger:focus-visible {
  background: var(--color-brand);
  color: var(--color-brand-ink);
  border-color: var(--color-brand);
  outline: none;
}

.g-tooltip--md .g-tooltip__trigger {
  width: 1.3em;
  height: 1.3em;
  font-size: 0.82em;
}

.g-tooltip__bubble {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  min-width: 200px;
  max-width: 320px;
  padding: var(--space-2) var(--space-3);
  background: var(--color-ink-strong);
  color: var(--color-bg-page);
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
  font-weight: var(--weight-regular);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  z-index: 50;
  text-align: left;
  white-space: normal;
  pointer-events: none;
}

.g-tooltip--top .g-tooltip__bubble {
  bottom: calc(100% + var(--space-2));
}

.g-tooltip--bottom .g-tooltip__bubble {
  top: calc(100% + var(--space-2));
}
</style>
