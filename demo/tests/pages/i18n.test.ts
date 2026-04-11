// demo/tests/pages/i18n.test.ts
// Phase 9: pure-logic unit tests for the i18n page helpers.

import { describe, it, expect } from 'vitest';
import {
  LOCALE_MAP,
  forcedDirection,
  buildLocaleLabel,
  extractLocaleIds,
  type LocaleDirection,
} from '../../src/pages/i18n.js';

describe('LOCALE_MAP', () => {
  it('contains en-us with direction ltr', () => {
    expect(LOCALE_MAP['en-us'].direction).toBe('ltr');
  });

  it('contains ar with direction rtl', () => {
    expect(LOCALE_MAP['ar'].direction).toBe('rtl');
  });

  it('contains at least 4 locales', () => {
    expect(Object.keys(LOCALE_MAP).length).toBeGreaterThanOrEqual(4);
  });
});

describe('forcedDirection()', () => {
  it('auto + ltr locale → ltr', () => {
    expect(forcedDirection('auto', 'ltr')).toBe('ltr');
  });

  it('auto + rtl locale → rtl', () => {
    expect(forcedDirection('auto', 'rtl')).toBe('rtl');
  });

  it('force-ltr overrides rtl locale', () => {
    expect(forcedDirection('force-ltr', 'rtl')).toBe('ltr');
  });

  it('force-rtl overrides ltr locale', () => {
    expect(forcedDirection('force-rtl', 'ltr')).toBe('rtl');
  });
});

describe('buildLocaleLabel()', () => {
  it('returns a non-empty string for en-us', () => {
    const label = buildLocaleLabel('en-us');
    expect(label).toBeTruthy();
    expect(typeof label).toBe('string');
  });

  it('includes the locale id in the label', () => {
    const label = buildLocaleLabel('ar');
    expect(label).toContain('ar');
  });
});

describe('extractLocaleIds()', () => {
  it('returns an array of strings', () => {
    const ids = extractLocaleIds();
    expect(Array.isArray(ids)).toBe(true);
    ids.forEach((id) => expect(typeof id).toBe('string'));
  });

  it('includes en-us and ar', () => {
    const ids = extractLocaleIds();
    expect(ids).toContain('en-us');
    expect(ids).toContain('ar');
  });
});
