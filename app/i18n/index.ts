import { type MessageKey, en } from './en';

// Identical signature to @setcode/watcher's t() — keeps muscle memory and
// makes the step 14 swap purely mechanical.
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template = en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

export type { MessageKey };
