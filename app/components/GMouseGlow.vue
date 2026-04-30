<script setup lang="ts">
// Subtle "flashlight" cursor halo. A fixed full-viewport div sits above
// page content; a radial gradient anchored at the live mouse position
// lifts the surrounding pixels by a few percent. Active in dark theme
// only — light theme already has high contrast and a glow there reads
// as a smudge.
//
// Implementation notes:
//   - CSS does the work. We only update two CSS custom properties on
//     mousemove (--mouse-x, --mouse-y) and let the gradient do the rest.
//   - rAF-coalesced so 1000Hz mice / trackpad bursts don't queue up
//     redundant style writes between frames.
//   - pointer-events: none everywhere so the overlay is invisible to
//     hit-testing — buttons, inputs, links keep working.
//   - position: fixed on a 100vh/100vw layer means the effect tracks
//     the viewport, not the document, so scrolling doesn't wobble it.
//   - The dark-theme rule lives in an unscoped <style> block. Vue's
//     `:global()` inside scoped CSS would in theory let us target the
//     `[data-theme='dark']` attribute on <html>, but the post-processed
//     output isn't reliable across attribute selectors with brackets.
//     A separate global block is the boring, working approach.
import { onBeforeUnmount, onMounted, ref } from 'vue';

const overlayEl = ref<HTMLDivElement | null>(null);
const enabled = ref(false);
let rafHandle: number | null = null;
let pendingX = 0;
let pendingY = 0;

function applyPosition() {
  rafHandle = null;
  const el = overlayEl.value;
  if (!el) return;
  el.style.setProperty('--mouse-x', `${pendingX}px`);
  el.style.setProperty('--mouse-y', `${pendingY}px`);
}

function onMouseMove(ev: MouseEvent) {
  pendingX = ev.clientX;
  pendingY = ev.clientY;
  if (rafHandle === null) rafHandle = requestAnimationFrame(applyPosition);
}

function onMouseLeave() {
  // When the cursor leaves the document, fade the spot off-screen so
  // the halo doesn't hover at the last known position forever.
  pendingX = -1000;
  pendingY = -1000;
  if (rafHandle === null) rafHandle = requestAnimationFrame(applyPosition);
}

onMounted(() => {
  if (typeof window === 'undefined') return;
  // Skip on touch-only devices: no cursor to highlight, and listening
  // for mousemove on iOS adds latency to scroll handlers.
  if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;
  enabled.value = true;

  pendingX = window.innerWidth / 2;
  pendingY = window.innerHeight / 2;
  applyPosition();

  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('mouseleave', onMouseLeave, { passive: true });
});

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseleave', onMouseLeave);
  if (rafHandle !== null) cancelAnimationFrame(rafHandle);
});
</script>

<template>
  <div v-if="enabled" ref="overlayEl" class="g-mouse-glow" aria-hidden="true" />
</template>

<style scoped>
.g-mouse-glow {
  /* Fixed full-viewport overlay above all content. pointer-events:none
     means hit-testing skips this layer, so buttons / inputs / links
     work normally. We sit at the top of the stacking order on
     purpose — that way the halo lifts whatever is under the cursor
     (header, cards, tooltips) and not just the page background. */
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;

  /* Hidden in light theme (and as a fallback if the theme attribute
     hasn't hydrated yet). The dark-theme rule in the global block
     below flips opacity and paints the gradient. */
  opacity: 0;
  transition: opacity 240ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .g-mouse-glow {
    transition: none;
  }
}
</style>

<!-- Theme-conditional rules live here (no `scoped`). The
     [data-theme='dark'] attribute is on <html>, which sits outside
     this component's scope, so a scoped selector wouldn't match. -->
<style>
[data-theme='dark'] .g-mouse-glow {
  opacity: 1;
  /* Soft warm-white spotlight (matches the dark theme's ink color).
     Peak alpha 0.05 — visible enough to read as a halo, not so bright
     that it competes with content for attention. Falls off in three
     stops over 320px so the edge feels diffuse rather than a hard
     circle. */
  background: radial-gradient(
    320px circle at var(--mouse-x, 50vw) var(--mouse-y, 50vh),
    rgba(245, 239, 227, 0.05) 0%,
    rgba(245, 239, 227, 0.025) 35%,
    rgba(245, 239, 227, 0) 70%
  );
}
</style>
