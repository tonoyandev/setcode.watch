// Theme state + toggle.
//
// Single source of truth for the active palette. The <html data-theme>
// attribute is the thing components and tokens.css actually read; this
// composable mirrors the attribute to a reactive `theme` ref and persists
// user choice to localStorage.
//
// Default is "dark" (set server-side in nuxt.config.ts). An inline script
// in the head runs before hydration to promote a saved light preference,
// so useState seeded to "dark" here may be wrong for that first tick on
// the client — we reconcile in onMounted by reading the attribute back.

import { onMounted, watch } from 'vue';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'setcode-theme';

export function useTheme() {
  // useState is Nuxt-wide singleton state; SSR and client share the same
  // ref so hydration doesn't reset it. Seed to dark to match the htmlAttrs
  // default — the onMounted pass below reconciles with what the inline
  // pre-hydration script actually set.
  const theme = useState<Theme>('theme', () => 'dark');

  onMounted(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') {
      theme.value = attr;
    }
  });

  // Any programmatic change to `theme` pushes to the DOM attribute and
  // persists. We do not watch SSR-side — guarded by `import.meta.client`.
  watch(
    theme,
    (next) => {
      if (!import.meta.client) return;
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage blocked — in-memory state still tracks */
      }
    },
    { flush: 'post' },
  );

  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  function set(next: Theme) {
    theme.value = next;
  }

  return { theme, toggle, set };
}
