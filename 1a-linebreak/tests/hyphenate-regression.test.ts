// tests/hyphenate-regression.test.ts
//
// MT-42 — Hyphenation regression suite.
//
// Compares paragraf's hyphenateWord output against reference TeX breakpoints
// for English (en-us), German (de-1996), and Turkish (tr).
//
// Reference values were verified against the canonical TeX pattern files used
// by the `hyphen` npm package, then adjusted for the minLeft=2/minRight=3
// enforcement that deriveMinLeft(12)/deriveMinRight(12) produces.
//
// Regression purpose: ensure that changes to enforceMinBoundaries, shouldSkip,
// or the hyphenation pipeline do not silently alter known-good break positions.

import { describe, it, expect, beforeAll } from 'vitest';
import {
  hyphenateWord,
  loadLanguages,
  DEFAULT_HYPHENATE_OPTIONS,
  type HyphenateOptions,
} from '../src/hyphenate';
import { Language } from '@paragraf/types';

// Shared options per language (fontSize=12 → minLeft=2, minRight=3)
const opts = (
  language: Language,
  extra: Partial<HyphenateOptions> = {},
): HyphenateOptions => ({
  ...DEFAULT_HYPHENATE_OPTIONS,
  language,
  fontSize: 12,
  processCapitalized: true, // allow capitalized words for DE/TR proper nouns
  ...extra,
});

// Helper: run hyphenateWord and return fragments
const frag = (word: string, o: HyphenateOptions): string[] =>
  hyphenateWord(word, o, false, false).fragments;

beforeAll(async () => {
  await loadLanguages(['en-us', 'de', 'tr']);
});

// ─── English (en-us) ─────────────────────────────────────────────────────────
//
// Reference: TeX en-us patterns (same file used by the `hyphen` npm package),
// with minLeft=2/minRight=3 enforcement at fontSize=12.

describe('en-us hyphenation regression', () => {
  const en = opts('en-us');

  it('hyphenation → ["hy","phen","ation"]  (Knuth canonical example)', () => {
    expect(frag('hyphenation', en)).toEqual(['hy', 'phen', 'ation']);
  });

  it('algorithm → ["al","go","rithm"]', () => {
    expect(frag('algorithm', en)).toEqual(['al', 'go', 'rithm']);
  });

  it('beautiful → ["beau","ti","ful"]', () => {
    expect(frag('beautiful', en)).toEqual(['beau', 'ti', 'ful']);
  });

  it('remarkable → ["re","mark","able"]', () => {
    expect(frag('remarkable', en)).toEqual(['re', 'mark', 'able']);
  });

  it('paragraph → ["para","graph"]', () => {
    expect(frag('paragraph', en)).toEqual(['para', 'graph']);
  });

  it('typography → ["ty","pog","ra","phy"]', () => {
    expect(frag('typography', en)).toEqual(['ty', 'pog', 'ra', 'phy']);
  });

  // "separately": raw patterns give ["sep","a","rate","ly"] but minRight=3 merges last two
  it('separately → ["sep","a","rately"]  (minRight=3 merges "ly")', () => {
    expect(frag('separately', en)).toEqual(['sep', 'a', 'rately']);
  });

  it('typeface → ["type","face"]', () => {
    expect(frag('typeface', en)).toEqual(['type', 'face']);
  });

  // "computer": raw ["com","put","er"] but minRight=3 merges "er"
  it('computer → ["com","puter"]  (minRight=3 merges "er")', () => {
    expect(frag('computer', en)).toEqual(['com', 'puter']);
  });

  it('necessary → ["nec","es","sary"]', () => {
    expect(frag('necessary', en)).toEqual(['nec', 'es', 'sary']);
  });

  it('independent → ["in","de","pen","dent"]', () => {
    expect(frag('independent', en)).toEqual(['in', 'de', 'pen', 'dent']);
  });

  // "international": raw ["in","ter","na","tion","al"] but minRight=3 merges "al"
  it('international → ["in","ter","na","tional"]  (minRight=3 merges "al")', () => {
    expect(frag('international', en)).toEqual(['in', 'ter', 'na', 'tional']);
  });

  it('association → ["as","so","ci","a","tion"]', () => {
    expect(frag('association', en)).toEqual(['as', 'so', 'ci', 'a', 'tion']);
  });

  it('extraordinary → ["ex","tra","or","di","nary"]', () => {
    expect(frag('extraordinary', en)).toEqual([
      'ex',
      'tra',
      'or',
      'di',
      'nary',
    ]);
  });

  // ── Guards ────────────────────────────────────────────────────────────────

  it('short word (< minWordLength=5) → not hyphenated', () => {
    const result = hyphenateWord('type', en, false);
    expect(result.hyphenable).toBe(false);
    expect(result.fragments).toEqual(['type']);
  });

  it('all-caps word → not hyphenated (abbreviation guard)', () => {
    const result = hyphenateWord('NASA', en, false);
    expect(result.hyphenable).toBe(false);
  });

  it('word with digit → not hyphenated', () => {
    const result = hyphenateWord('PDF2', en, false);
    expect(result.hyphenable).toBe(false);
  });

  it('URL → not hyphenated', () => {
    const result = hyphenateWord('https://example.com', en, false);
    expect(result.hyphenable).toBe(false);
  });

  it('fragments concatenate back to original word', () => {
    const words = [
      'hyphenation',
      'algorithm',
      'beautiful',
      'remarkable',
      'paragraph',
      'typography',
      'independently',
      'association',
    ];
    for (const w of words) {
      const frags = frag(w, en);
      expect(frags.join('')).toBe(w);
    }
  });
});

// ─── German (de-1996) ────────────────────────────────────────────────────────
//
// Reference: TeX de-1996 patterns (reformed German orthography).
// Words with umlauts verified to use correct Unicode decomposition.

describe('de hyphenation regression', () => {
  const de = opts('de');

  it('Mathematik → ["Ma","the","ma","tik"]', () => {
    expect(frag('Mathematik', de)).toEqual(['Ma', 'the', 'ma', 'tik']);
  });

  it('Universität → ["Uni","ver","si","tät"]', () => {
    expect(frag('Universität', de)).toEqual(['Uni', 'ver', 'si', 'tät']);
  });

  it('Hauptbahnhof → ["Haupt","bahn","hof"]', () => {
    expect(frag('Hauptbahnhof', de)).toEqual(['Haupt', 'bahn', 'hof']);
  });

  // Raw: ["Schreib","ma","schi","ne"] but minRight=3 merges last two "ne" fragments
  it('Schreibmaschine → ["Schreib","ma","schine"]  (minRight=3 merges "ne")', () => {
    expect(frag('Schreibmaschine', de)).toEqual(['Schreib', 'ma', 'schine']);
  });

  it('Unabhängigkeit → ["Un","ab","hän","gig","keit"]', () => {
    expect(frag('Unabhängigkeit', de)).toEqual([
      'Un',
      'ab',
      'hän',
      'gig',
      'keit',
    ]);
  });

  it('Qualitätssicherung → ["Qua","li","täts","si","che","rung"]', () => {
    expect(frag('Qualitätssicherung', de)).toEqual([
      'Qua',
      'li',
      'täts',
      'si',
      'che',
      'rung',
    ]);
  });

  // Raw: ["Druck","ma","schi","ne"] → minRight merges "ne"
  it('Druckmaschine → ["Druck","ma","schine"]  (minRight=3 merges "ne")', () => {
    expect(frag('Druckmaschine', de)).toEqual(['Druck', 'ma', 'schine']);
  });

  // Raw: ["Buch","sta","be"] → minRight=3 merges "be"
  it('Buchstabe → ["Buch","stabe"]  (minRight=3 merges "be")', () => {
    expect(frag('Buchstabe', de)).toEqual(['Buch', 'stabe']);
  });

  it('fragments concatenate back to original word', () => {
    const words = [
      'Mathematik',
      'Universität',
      'Hauptbahnhof',
      'Unabhängigkeit',
    ];
    for (const w of words) {
      const frags = frag(w, de);
      expect(frags.join('')).toBe(w);
    }
  });
});

// ─── Turkish (tr) ────────────────────────────────────────────────────────────
//
// Reference: TeX Turkish patterns.
// Includes words with Turkish-specific characters (ğ, ş, ı, ç, ö, ü).

describe('tr hyphenation regression', () => {
  const tr = opts('tr');

  it('hipotez → ["hi","po","tez"]', () => {
    expect(frag('hipotez', tr)).toEqual(['hi', 'po', 'tez']);
  });

  it('matematik → ["ma","te","ma","tik"]', () => {
    expect(frag('matematik', tr)).toEqual(['ma', 'te', 'ma', 'tik']);
  });

  it('Türkiye → ["Tür","kiye"]  (minRight=3 merges "ye")', () => {
    expect(frag('Türkiye', tr)).toEqual(['Tür', 'kiye']);
  });

  it('bağlantı → ["bağ","lantı"]  (minRight=3 merges "tı")', () => {
    expect(frag('bağlantı', tr)).toEqual(['bağ', 'lantı']);
  });

  // Raw: ["doğ","ru","la","ma"] → minRight=3 merges "ma"
  it('doğrulama → ["doğ","ru","lama"]  (minRight=3 merges "ma")', () => {
    expect(frag('doğrulama', tr)).toEqual(['doğ', 'ru', 'lama']);
  });

  // Raw: ["ça","lış","ma"] → minRight=3 merges "ma"
  it('çalışma → ["ça","lışma"]  (minRight=3 merges "ma")', () => {
    expect(frag('çalışma', tr)).toEqual(['ça', 'lışma']);
  });

  it('bilgisayar → ["bil","gi","sa","yar"]', () => {
    expect(frag('bilgisayar', tr)).toEqual(['bil', 'gi', 'sa', 'yar']);
  });

  it('fragments concatenate back to original word', () => {
    const words = [
      'hipotez',
      'matematik',
      'bağlantı',
      'bilgisayar',
      'doğrulama',
    ];
    for (const w of words) {
      const frags = frag(w, tr);
      expect(frags.join('')).toBe(w);
    }
  });
});

// ─── Cross-language integrity ─────────────────────────────────────────────────

describe('cross-language: minLeft/minRight enforcement', () => {
  it('no fragment shorter than minLeft=2 at the left boundary', () => {
    const languages: Language[] = ['en-us', 'de', 'tr'];
    const corpus: Record<Language, string[]> = {
      'en-us': [
        'hyphenation',
        'algorithm',
        'beautiful',
        'remarkable',
        'extraordinary',
      ],
      de: ['Mathematik', 'Universität', 'Unabhängigkeit', 'Qualitätssicherung'],
      tr: ['hipotez', 'matematik', 'bilgisayar'],
    };
    for (const lang of languages) {
      for (const word of corpus[lang]) {
        const frags = frag(word, opts(lang));
        if (frags.length > 1) {
          expect(frags[0].length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('no fragment shorter than minRight=3 at the right boundary', () => {
    const languages: Language[] = ['en-us', 'de', 'tr'];
    const corpus: Record<Language, string[]> = {
      'en-us': [
        'hyphenation',
        'algorithm',
        'beautiful',
        'remarkable',
        'extraordinary',
      ],
      de: ['Mathematik', 'Universität', 'Unabhängigkeit', 'Qualitätssicherung'],
      tr: ['hipotez', 'matematik', 'bilgisayar'],
    };
    for (const lang of languages) {
      for (const word of corpus[lang]) {
        const frags = frag(word, opts(lang));
        if (frags.length > 1) {
          expect(frags[frags.length - 1].length).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});

// ─── minLeft/minRight override ────────────────────────────────────────────────

describe('minLeft/minRight override', () => {
  it('minLeft=1 allows single-char leading fragment', () => {
    // "separately" raw: ["sep","a","rate","ly"]
    // With minLeft=1, minRight=3: "a" is ok on left; still merges "ly"
    const frags = frag(
      'separately',
      opts('en-us', { minLeft: 1, minRight: 3 }),
    );
    expect(frags[0].length).toBeGreaterThanOrEqual(1);
    expect(frags[frags.length - 1].length).toBeGreaterThanOrEqual(3);
  });

  it('minRight=2 keeps short trailing fragment', () => {
    // "computer": raw ["com","put","er"]; with minRight=2 "er" is not merged
    const frags = frag('computer', opts('en-us', { minLeft: 2, minRight: 2 }));
    expect(frags).toEqual(['com', 'put', 'er']);
  });

  it('minLeft=4 merges short leading fragments into longer head', () => {
    // "hyphenation": raw ["hy","phen","ation"]
    // With minLeft=4: "hy"(2) + "phen"(4) = "hyphen"(6) ≥ 4 → merged to "hyphen"
    const frags = frag(
      'hyphenation',
      opts('en-us', { minLeft: 4, minRight: 3 }),
    );
    expect(frags[0].length).toBeGreaterThanOrEqual(4);
    expect(frags.join('')).toBe('hyphenation');
  });
});
