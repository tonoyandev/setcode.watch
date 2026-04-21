import { type MessageKey, en } from './en.js';

// Single-locale helper. A later step will swap this for a real i18n layer
// (catalog per locale, locale detection); every user-facing string routes
// through `t()` so that refactor stays mechanical.
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template = en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}
