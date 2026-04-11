// hyphenate.ts

import createHyphenator from 'hyphen';
import { Language } from '@paragraf/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HyphenateOptions {
  minWordLength: number;
  fontSize: number;
  language: Language;
  preserveSoftHyphens?: boolean; // default true — honour \u00AD in input
  minLeft?: number; // override deriveMinLeft(fontSize); 1 = allow single-char left fragments
  minRight?: number; // override deriveMinRight(fontSize); 1 = allow single-char right fragments
  processCapitalized?: boolean; // default false — skip non-first capitalized words (proper noun heuristic)
  // set true to hyphenate all words regardless of capitalisation
}

export interface HyphenatedWord {
  original: string;
  fragments: string[];
  hyphenable: boolean;
  hasSoftHyphen: boolean; // true if fragments came from explicit soft hyphens
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_HYPHENATE_OPTIONS: HyphenateOptions = {
  minWordLength: 5,
  fontSize: 12,
  language: 'en-us',
  preserveSoftHyphens: true,
};

// ─── Font-derived boundary helpers ───────────────────────────────────────────

export const deriveMinLeft = (fontSize: number): number =>
  Math.max(2, Math.round(fontSize / 6));

export const deriveMinRight = (fontSize: number): number =>
  Math.max(2, Math.round(fontSize / 6));

// ─── Pattern map ─────────────────────────────────────────────────────────────

// Node.js ESM strict resolution requires explicit .js extensions for deep
// imports into CJS packages (like `hyphen`) that have no exports map.
const PATTERN_LOADERS: Record<Language, () => Promise<any>> = {
  'en-us': () => import('hyphen/patterns/en-us.js'),
  'en-gb': () => import('hyphen/patterns/en-gb.js'),
  de: () => import('hyphen/patterns/de-1996.js'),
  fr: () => import('hyphen/patterns/fr.js'),
  tr: () => import('hyphen/patterns/tr.js'),
  nl: () => import('hyphen/patterns/nl.js'),
  pl: () => import('hyphen/patterns/pl.js'),
  it: () => import('hyphen/patterns/it.js'),
  es: () => import('hyphen/patterns/es.js'),
  sv: () => import('hyphen/patterns/sv.js'),
  no: () => import('hyphen/patterns/no.js'),
  da: () => import('hyphen/patterns/da.js'),
  fi: () => import('hyphen/patterns/fi.js'),
  hu: () => import('hyphen/patterns/hu.js'),
  cs: () => import('hyphen/patterns/cs.js'),
  sk: () => import('hyphen/patterns/sk.js'),
  ro: () => import('hyphen/patterns/ro.js'),
  hr: () => import('hyphen/patterns/hr.js'),
  sl: () => import('hyphen/patterns/sl.js'),
  lt: () => import('hyphen/patterns/lt.js'),
  lv: () => import('hyphen/patterns/lv.js'),
  et: () => import('hyphen/patterns/et.js'),
};

// ─── Hyphenator cache ─────────────────────────────────────────────────────────

const hyphenatorCache = new Map<Language, (word: string) => string>();

export const loadHyphenator = async (language: Language): Promise<void> => {
  if (hyphenatorCache.has(language)) return;

  const loader = PATTERN_LOADERS[language];
  if (!loader) throw new Error(`Unsupported language: ${language}`);

  const patterns = await loader();
  const hyphenator = createHyphenator(patterns.default ?? patterns, {
    async: false,
  }) as (word: string) => string;

  hyphenatorCache.set(language, hyphenator);
};

export const loadLanguages = async (languages: Language[]): Promise<void> => {
  await Promise.all(languages.map(loadHyphenator));
};

// ─── Soft hyphen handling ─────────────────────────────────────────────────────

const INPUT_SOFT_HYPHEN = '\u00AD';

// extract soft hyphen fragments from word if present
// returns null if no soft hyphens found
const extractSoftHyphenFragments = (word: string): string[] | null => {
  if (!word.includes(INPUT_SOFT_HYPHEN)) return null;
  const fragments = word.split(INPUT_SOFT_HYPHEN);
  // only use soft hyphen splitting if fragments are non-empty
  if (fragments.some((f) => f.length === 0)) return null;
  return fragments;
};

// ─── Guards ──────────────────────────────────────────────────────────────────

const shouldSkip = (
  word: string,
  opts: HyphenateOptions,
  isFirstWord: boolean,
): boolean => {
  // strip soft hyphens before length/pattern checks
  const clean = word.replaceAll(INPUT_SOFT_HYPHEN, '');
  if (clean.length < opts.minWordLength) return true;
  if (/\d/.test(clean)) return true;
  if (/^https?:\/\//.test(clean)) return true;
  if (/^[A-Z][A-Z]+$/.test(clean)) return true;
  if (!opts.processCapitalized && !isFirstWord && /^[A-Z]/.test(clean))
    return true;
  return false;
};

// ─── Boundary enforcement ────────────────────────────────────────────────────

const enforceMinBoundaries = (
  fragments: string[],
  minLeft: number,
  minRight: number,
): string[] => {
  if (fragments.length <= 1) return fragments;

  const result = [...fragments];

  while (result.length > 1 && result[0].length < minLeft) {
    result.splice(0, 2, result[0] + result[1]);
  }

  while (result.length > 1 && result[result.length - 1].length < minRight) {
    const last = result.pop()!;
    result[result.length - 1] = result[result.length - 1] + last;
  }

  return result;
};

// ─── Core ────────────────────────────────────────────────────────────────────

export const hyphenateWord = (
  word: string,
  opts: HyphenateOptions = DEFAULT_HYPHENATE_OPTIONS,
  isFirstWord: boolean = false,
  preserveSoftHyphens: boolean = opts.preserveSoftHyphens ?? true,
): HyphenatedWord => {
  // check for explicit soft hyphens first
  if (preserveSoftHyphens) {
    const softFragments = extractSoftHyphenFragments(word);
    if (softFragments) {
      return {
        original: word.replaceAll(INPUT_SOFT_HYPHEN, ''),
        fragments: softFragments,
        hyphenable: softFragments.length > 1,
        hasSoftHyphen: true,
      };
    }
  }

  // clean word for guards and hyphenation
  const clean = word.replaceAll(INPUT_SOFT_HYPHEN, '');

  if (shouldSkip(clean, opts, isFirstWord)) {
    return {
      original: clean,
      fragments: [clean],
      hyphenable: false,
      hasSoftHyphen: false,
    };
  }

  const hyphenator = hyphenatorCache.get(opts.language);
  if (!hyphenator) {
    throw new Error(
      `Hyphenator for "${opts.language}" not loaded. ` +
        `Call loadHyphenator("${opts.language}") before hyphenating.`,
    );
  }

  const minLeft = opts.minLeft ?? deriveMinLeft(opts.fontSize);
  const minRight = opts.minRight ?? deriveMinRight(opts.fontSize);
  const hyphenated = hyphenator(clean);
  const all = hyphenated.split(INPUT_SOFT_HYPHEN);
  const fragments = enforceMinBoundaries(all, minLeft, minRight);

  return {
    original: clean,
    fragments,
    hyphenable: fragments.length > 1,
    hasSoftHyphen: false,
  };
};

export const hyphenateParagraph = (
  text: string,
  opts: HyphenateOptions = DEFAULT_HYPHENATE_OPTIONS,
): HyphenatedWord[] => {
  const words = text.trim().split(/\s+/);
  return words.map((word, index) =>
    hyphenateWord(word, opts, index === 0, opts.preserveSoftHyphens ?? true),
  );
};
