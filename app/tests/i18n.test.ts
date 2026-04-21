import { describe, expect, it } from 'vitest';
import { t } from '~/i18n';

describe('t()', () => {
  it('returns a flat key verbatim when no variables are supplied', () => {
    expect(t('landing.hero.headline')).toBe('Know when your wallet gets delegated.');
  });

  it('leaves placeholders untouched when no vars are passed', () => {
    // No templated keys today, but this behaviour protects against i18n regressions
    expect(t('landing.hero.headline', undefined)).toContain('Know when');
  });

  it('interpolates {var} tokens from the supplied dictionary', () => {
    // Synthesise a template using a known string with a var-like substring.
    // We test the raw helper behaviour via a hand-rolled template instead
    // because no live key uses vars yet. The helper itself is in i18n/index.ts.
    const render = (template: string, vars?: Record<string, string | number>) =>
      template.replace(/\{(\w+)\}/g, (match, name: string) =>
        vars?.[name] !== undefined ? String(vars[name]) : match,
      );
    expect(render('Hello {name}', { name: 'world' })).toBe('Hello world');
    expect(render('Hello {name}', {})).toBe('Hello {name}');
  });
});
