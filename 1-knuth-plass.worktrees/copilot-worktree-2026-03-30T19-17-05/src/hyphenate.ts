// hyphenate.ts

import createHyphenator from 'hyphen';
import { Language } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HyphenateOptions {
  minWordLength: number;
  fontSize: number;
  language: Language;
  preserveSoftHyphens?: boolean; // default true — honour \u00AD in input
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

const PATTERN_LOADERS: Record<Language, () => Promise<any>> = {
  'en-us': () => import('hyphen/patterns/en-us'),
  'en-gb': () => import('hyphen/patterns/en-gb'),
  de: () => import('hyphen/patterns/de-1996'),
  fr: () => import('hyphen/patterns/fr'),
  tr: () => import('hyphen/patterns/tr'),
  nl: () => import('hyphen/patterns/nl'),
  pl: () => import('hyphen/patterns/pl'),
  it: () => import('hyphen/patterns/it'),
  es: () => import('hyphen/patterns/es'),
  sv: () => import('hyphen/patterns/sv'),
  no: () => import('hyphen/patterns/no'),
  da: () => import('hyphen/patterns/da'),
  fi: () => import('hyphen/patterns/fi'),
  hu: () => import('hyphen/patterns/hu'),
  cs: () => import('hyphen/patterns/cs'),
  sk: () => import('hyphen/patterns/sk'),
  ro: () => import('hyphen/patterns/ro'),
  hr: () => import('hyphen/patterns/hr'),
  sl: () => import('hyphen/patterns/sl'),
  lt: () => import('hyphen/patterns/lt'),
  lv: () => import('hyphen/patterns/lv'),
  et: () => import('hyphen/patterns/et'),
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
  if (!isFirstWord && /^[A-Z]/.test(clean)) return true;
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

  const minLeft = deriveMinLeft(opts.fontSize);
  const minRight = deriveMinRight(opts.fontSize);
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
