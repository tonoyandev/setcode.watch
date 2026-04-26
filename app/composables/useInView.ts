import { type Ref, onBeforeUnmount, onMounted, ref } from 'vue';

// Wraps IntersectionObserver in a Vue-friendly composable. Two refs are
// returned:
//   - isInView: tracks the live state, flips back to false when the element
//     leaves the viewport. Use this for "fire on every entrance" patterns.
//   - hasBeenInView: monotonic — once true, stays true. Use this for "load
//     once" patterns (lazy-loading rows, deferring work to first scroll).
//
// SSR / unsupported runtimes leave both refs at their initial values
// (false). The observer is wired in onMounted so it never runs on the
// server. Callers that need the row to behave on the server should default
// to "always visible" themselves; we don't presume.
export function useInView(
  target: Ref<Element | null>,
  options: IntersectionObserverInit = { rootMargin: '120px 0px' },
) {
  const isInView = ref(false);
  const hasBeenInView = ref(false);
  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    if (typeof IntersectionObserver === 'undefined') {
      // Older browser without IO — degrade gracefully by treating the
      // element as already visible. Keeps the lazy-load path from
      // becoming a permanent "checking…" stuck state.
      isInView.value = true;
      hasBeenInView.value = true;
      return;
    }
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          isInView.value = true;
          hasBeenInView.value = true;
        } else {
          isInView.value = false;
        }
      }
    }, options);
    if (target.value) observer.observe(target.value);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });

  return { isInView, hasBeenInView };
}
