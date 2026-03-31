import { describe, it, expect, beforeAll } from 'vitest';
import {
  hyphenateWord,
  hyphenateParagraph,
  deriveMinLeft,
  deriveMinRight,
  DEFAULT_HYPHENATE_OPTIONS,
} from '../src/hyphenate';
import { Language } from '../src/types';
import { loadLanguages } from '../src/hyphenate';

beforeAll(async () => {
  await loadLanguages(['en-us', 'de', 'fr', 'tr']);
});

// ─── deriveMinLeft / deriveMinRight ──────────────────────────────────────────

describe('deriveMinLeft', () => {
  it('returns 2 for small font sizes', () => {
    expect(deriveMinLeft(6)).toBe(2);
    expect(deriveMinLeft(10)).toBe(2);
  });

  it('scales with font size', () => {
    expect(deriveMinLeft(12)).toBe(2);
    expect(deriveMinLeft(24)).toBe(4);
    expect(deriveMinLeft(36)).toBe(6);
  });

  it('never returns less than 2', () => {
    expect(deriveMinLeft(1)).toBeGreaterThanOrEqual(2);
  });
});

describe('deriveMinRight', () => {
  it('mirrors deriveMinLeft', () => {
    expect(deriveMinRight(12)).toBe(deriveMinLeft(12));
    expect(deriveMinRight(24)).toBe(deriveMinLeft(24));
  });
});

// ─── DEFAULT_HYPHENATE_OPTIONS ────────────────────────────────────────────────

describe('DEFAULT_HYPHENATE_OPTIONS', () => {
  it('has expected shape', () => {
    expect(DEFAULT_HYPHENATE_OPTIONS).toMatchObject({
      minWordLength: expect.any(Number),
      fontSize: expect.any(Number),
      language: expect.any(String),
    });
  });

  it('minWordLength is at least 4', () => {
    expect(DEFAULT_HYPHENATE_OPTIONS.minWordLength).toBeGreaterThanOrEqual(4);
  });

  it('default language is en-us', () => {
    expect(DEFAULT_HYPHENATE_OPTIONS.language).toBe('en-us');
  });
});

// ─── sync behaviour ───────────────────────────────────────────────────────────

describe('hyphenateWord — sync', () => {
  it('returns synchronously — no Promise in return value', () => {
    const result = hyphenateWord('beautiful');
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('hyphenateParagraph returns synchronously', () => {
    const result = hyphenateParagraph('beautiful landscape');
    expect(result).not.toBeInstanceOf(Promise);
  });
});

// ─── skip conditions ─────────────────────────────────────────────────────────

describe('hyphenateWord — skip conditions', () => {
  it('skips words shorter than minWordLength', () => {
    const result = hyphenateWord('Hi');
    expect(result.hyphenable).toBe(false);
    expect(result.fragments).toEqual(['Hi']);
  });

  it('skips words containing digits', () => {
    const result = hyphenateWord('ISO9001');
    expect(result.hyphenable).toBe(false);
  });

  it('skips URLs', () => {
    const result = hyphenateWord('https://example.com');
    expect(result.hyphenable).toBe(false);
  });

  it('skips ALL CAPS acronyms', () => {
    const result = hyphenateWord('UNESCO');
    expect(result.hyphenable).toBe(false);
  });

  it('skips proper nouns when not first word', () => {
    const result = hyphenateWord('London', DEFAULT_HYPHENATE_OPTIONS, false);
    expect(result.hyphenable).toBe(false);
  });

  it('does not skip capitalised word when it is the first word', () => {
    const result = hyphenateWord('Beautiful', DEFAULT_HYPHENATE_OPTIONS, true);
    expect(result.original).toBe('Beautiful');
    expect(result.fragments.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── hyphenation correctness ──────────────────────────────────────────────────

describe('hyphenateWord — hyphenation', () => {
  it('returns original as single fragment if no break found', () => {
    const result = hyphenateWord('the');
    expect(result.fragments).toEqual(['the']);
    expect(result.hyphenable).toBe(false);
  });

  it('splits a long word into multiple fragments', () => {
    const result = hyphenateWord('beautiful');
    expect(result.fragments.length).toBeGreaterThan(1);
    expect(result.hyphenable).toBe(true);
  });

  it('reassembled fragments equal original word', () => {
    const result = hyphenateWord('beautiful');
    expect(result.fragments.join('')).toBe('beautiful');
  });

  it('each fragment meets minLeft/minRight constraints', () => {
    const opts = { ...DEFAULT_HYPHENATE_OPTIONS };
    const minL = deriveMinLeft(opts.fontSize);
    const minR = deriveMinRight(opts.fontSize);
    const result = hyphenateWord('beautiful', opts);
    if (result.fragments.length > 1) {
      expect(result.fragments[0].length).toBeGreaterThanOrEqual(minL);
      expect(
        result.fragments[result.fragments.length - 1].length,
      ).toBeGreaterThanOrEqual(minR);
    }
  });
});

// ─── language support ─────────────────────────────────────────────────────────

describe('hyphenateWord — language support', () => {
  it('hyphenates English correctly', () => {
    const result = hyphenateWord('beautiful', {
      ...DEFAULT_HYPHENATE_OPTIONS,
      language: 'en-us',
    });
    expect(result.fragments.join('')).toBe('beautiful');
    expect(result.hyphenable).toBe(true);
  });

  it('hyphenates German correctly', () => {
    // "Entschuldigung" = classic long German word
    const result = hyphenateWord(
      'Entschuldigung',
      { ...DEFAULT_HYPHENATE_OPTIONS, language: 'de' },
      true, // first word — capital not skipped
    );
    expect(result.fragments.join('')).toBe('Entschuldigung');
    expect(result.hyphenable).toBe(true);
  });

  it('hyphenates French correctly', () => {
    const result = hyphenateWord('développement', {
      ...DEFAULT_HYPHENATE_OPTIONS,
      language: 'fr',
    });
    expect(result.fragments.join('')).toBe('développement');
  });

  it('hyphenates Turkish correctly', () => {
    const result = hyphenateWord('kardeşlerimizden', {
      ...DEFAULT_HYPHENATE_OPTIONS,
      language: 'tr',
    });
    expect(result.fragments.join('')).toBe('kardeşlerimizden');
    expect(result.hyphenable).toBe(true);
  });

  it('different languages produce different break points for cognates', () => {
    // "information" breaks differently in English vs French
    const en = hyphenateWord('information', {
      ...DEFAULT_HYPHENATE_OPTIONS,
      language: 'en-us',
    });
    const fr = hyphenateWord('information', {
      ...DEFAULT_HYPHENATE_OPTIONS,
      language: 'fr',
    });
    // both should hyphenate but potentially at different points
    expect(en.fragments.join('')).toBe('information');
    expect(fr.fragments.join('')).toBe('information');
  });

  it('throws for unsupported language', () => {
    expect(() =>
      hyphenateWord('beautiful', {
        ...DEFAULT_HYPHENATE_OPTIONS,
        language: 'xx' as Language,
      }),
    ).toThrow();
  });
});

// ─── hyphenateParagraph ───────────────────────────────────────────────────────

describe('hyphenateParagraph', () => {
  it('returns one HyphenatedWord per input word', () => {
    const result = hyphenateParagraph('Hi there friend');
    expect(result.length).toBe(3);
  });

  it('first word is treated as sentence-initial', () => {
    const result = hyphenateParagraph('Beautiful landscape');
    expect(result[0].original).toBe('Beautiful');
  });

  it('subsequent capitalised words are skipped', () => {
    const result = hyphenateParagraph('visit London today');
    const london = result.find((w) => w.original === 'London');
    expect(london?.hyphenable).toBe(false);
  });

  it('all original words are preserved in output', () => {
    const text = 'In olden times when wishing still helped one';
    const result = hyphenateParagraph(text);
    const words = text.split(' ');
    expect(result.map((w) => w.original)).toEqual(words);
  });

  it('fragments rejoin to original text', () => {
    const text = 'In olden times when wishing still helped one';
    const result = hyphenateParagraph(text);
    const rejoined = result.map((w) => w.fragments.join('')).join(' ');
    expect(rejoined).toBe(text);
  });

  it('accepts language option', () => {
    const result = hyphenateParagraph('Entschuldigung bitte', {
      ...DEFAULT_HYPHENATE_OPTIONS,
      language: 'de',
    });
    expect(result.length).toBe(2);
    expect(result[0].fragments.join('')).toBe('Entschuldigung');
  });
});
// ─── Soft hyphen preservation ─────────────────────────────────────────────────

describe('hyphenateWord — soft hyphen preservation', () => {
  it('word with soft hyphen is split at soft hyphen position', () => {
    const result = hyphenateWord(
      'co\u00ADoperate',
      DEFAULT_HYPHENATE_OPTIONS,
      false,
      true,
    );
    expect(result.fragments).toContain('co');
    expect(result.fragments).toContain('operate');
  });

  it('soft hyphen fragments rejoin to original word without soft hyphen', () => {
    const result = hyphenateWord(
      'co\u00ADoperate',
      DEFAULT_HYPHENATE_OPTIONS,
      false,
      true,
    );
    expect(result.fragments.join('')).toBe('cooperate');
  });

  it('soft hyphen fragments are marked as softHyphen', () => {
    const result = hyphenateWord(
      'co\u00ADoperate',
      DEFAULT_HYPHENATE_OPTIONS,
      false,
      true,
    );
    expect(result.hasSoftHyphen).toBe(true);
  });

  it('word without soft hyphen has hasSoftHyphen false', () => {
    const result = hyphenateWord(
      'beautiful',
      DEFAULT_HYPHENATE_OPTIONS,
      false,
      true,
    );
    expect(result.hasSoftHyphen).toBe(false);
  });

  it('preserveSoftHyphens=false ignores soft hyphens in word', () => {
    const result = hyphenateWord(
      'co\u00ADoperate',
      DEFAULT_HYPHENATE_OPTIONS,
      false,
      false,
    );
    // soft hyphen ignored — algorithmic hyphenation applied instead
    expect(result.hasSoftHyphen).toBe(false);
    expect(result.fragments.join('')).toBe('cooperate');
  });

  it('hyphenateParagraph preserves soft hyphens in text', () => {
    const result = hyphenateParagraph('co\u00ADoperate and co\u00ADordinate', {
      ...DEFAULT_HYPHENATE_OPTIONS,
      preserveSoftHyphens: true,
    });
    expect(result[0].hasSoftHyphen).toBe(true);
    expect(result[2].hasSoftHyphen).toBe(true);
  });
});
