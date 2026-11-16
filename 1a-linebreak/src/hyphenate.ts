// hyphenate.ts

// Makes the ambient `hyphen` declarations visible to packages that type-check
// this file through the source export (the .d.ts is otherwise only picked up
// by this package's own tsconfig include).
/// <reference path="./hyphen.d.ts" />

import createHyphenator from 'hyphen';
import { Language } from '@paragraf/types';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Per-document hyphenation override dictionary (mirrors TeX `\hyphenation{…}`).
 *  Keys are words (case-insensitive).  Values:
 *  - `string[]` — explicit break fragments (e.g. `{ 'present': ['pre', 'sent'] }`).
 *    `minLeft`/`minRight` boundaries are still enforced.
 *  - `false`    — never hyphenate this word, overriding any pattern output.
 */
export type ExceptionDictionary = Record<string, string[] | false>;

export interface HyphenateOptions {
  minWordLength: number;
  fontSize: number;
  language: Language;
  preserveSoftHyphens?: boolean; // default true — honour \u00AD in input
  minLeft?: number; // override deriveMinLeft(fontSize); 1 = allow single-char left fragments
  minRight?: number; // override deriveMinRight(fontSize); 1 = allow single-char right fragments
  /**
   * Whether capitalised words that do not start a sentence are hyphenated.
   * - `false` — skip them (proper-noun heuristic). Default for every language
   *   except German.
   * - `true` — hyphenate all words regardless of capitalisation. Default for
   *   German (`de`), where every noun is capitalised.
   * An explicit value always wins over the language default.
   */
  processCapitalized?: boolean;
  /**
   * Whether a URL-like token gets break points (default `true`). The breaks
   * insert no hyphen: after `/ ? & = # _ -` and before `.`, never inside
   * `://`. Set `false` to keep a URL in one piece, as before v0.7.1.
   * @since v0.7.1
   */
  breakUrls?: boolean;
  /** Per-document exception dictionary checked before pattern-based hyphenation. */
  exceptions?: ExceptionDictionary;
}

/** Internal-only extension of HyphenateOptions used within hyphenateParagraph
 *  to thread sentence-boundary context through to shouldSkip.
 *  Not part of the public API — never exposed to callers.
 */
interface HyphenateOptionsInternal extends HyphenateOptions {
  _prevWord?: string;
}

export interface HyphenatedWord {
  original: string;
  /** The word split at its break points; one fragment when there are none. */
  fragments: string[];
  /**
   * True when a hyphen is added at a break between fragments. False with more
   * than one fragment means the breaks take no hyphen: that is how a URL is
   * returned (since v0.7.1), and `buildNodeSequence` then puts a plain
   * zero-width penalty between the fragments instead of a hyphen penalty.
   */
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

// minRight is intentionally one unit larger than minLeft so that the trailing
// fragment is always at least as long as the leading one.  This avoids very
// short hanging suffixes like "-s" or "-ed" at the end of a line.
export const deriveMinRight = (fontSize: number): number =>
  Math.max(3, Math.round(fontSize / 6) + 1);

// ─── Pattern map ─────────────────────────────────────────────────────────────

// Node.js ESM strict resolution requires explicit .js extensions for deep
// imports into CJS packages (like `hyphen`) that have no exports map.
const PATTERN_LOADERS: Record<Language, () => Promise<any>> = {
  'en-us': () => import('hyphen/patterns/en-us.js'),
  'en-gb': () => import('hyphen/patterns/en-gb.js'),
  // de-1996: reformed German orthography (post-1996 spelling reform)
  de: () => import('hyphen/patterns/de-1996.js'),
  fr: () => import('hyphen/patterns/fr.js'),
  tr: () => import('hyphen/patterns/tr.js'),
  nl: () => import('hyphen/patterns/nl.js'),
  pl: () => import('hyphen/patterns/pl.js'),
  it: () => import('hyphen/patterns/it.js'),
  es: () => import('hyphen/patterns/es.js'),
  sv: () => import('hyphen/patterns/sv.js'),
  // no: Bokmål + Nynorsk combined patterns (covers both official written standards)
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

// ─── Language defaults ───────────────────────────────────────────────────────

// Languages that capitalise every noun. For these the proper-noun heuristic
// would leave most long words without break points, so capitalised words are
// hyphenated unless the caller says otherwise. German is the only such
// language among the shipped patterns; a regional or orthographic variant
// (`de-…`) is treated the same should one be added to `Language`.
const capitalisesAllNouns = (language: Language): boolean =>
  language === 'de' || (language as string).startsWith('de-');

// ─── URLs ────────────────────────────────────────────────────────────────────

// Punctuation that can surround a URL in running text: "(https://…)." It stays
// attached to the first or last fragment and never gets a break of its own.
const URL_LEADING = /^[(\[{<"'“‘«„]+/;
const URL_TRAILING_CHARS = new Set(')]}>"\'”’».,;:!?');

// Length of the trailing punctuation of `text`. A loop from the end, not a
// `[…]+$` regex: the regex is quadratic on a long run of such characters that
// is not at the end, and this runs on every word of every paragraph.
const trailingPunctuationLength = (text: string): number => {
  let end = text.length;
  while (end > 0 && URL_TRAILING_CHARS.has(text[end - 1])) end--;
  return text.length - end;
};

// What counts as a URL (kept narrow on purpose):
//   1. http://…, https://…, ftp://…
//   2. www.name.tld…
//   3. a bare host followed by a slash: name.tld/…  — only with lower-case
//      labels and a top-level domain from BARE_HOST_TLDS (optional port)
// A bare host WITHOUT a slash ("example.com") is not detected: it cannot be
// told apart from a missing space after a full stop ("end.Next").
const URL_WITH_SCHEME = /^(?:https?|ftp):\/\/\S/i;
const URL_WWW = /^www\.[^\s./]+\.\S/i;

// Top-level domains accepted for a bare host. Short on purpose. A dot and a
// slash also occur in "Node.js/Express", "README.md/CHANGELOG.md" or
// "index.html/#top", so every top-level domain that is also a common file
// extension or abbreviation is left out (md, js, ts, py, sh, rs, pl, so, ai,
// at, it, is, in, to, me, no, be, us, …). A URL under any other domain is
// detected when it is written with its scheme or with "www.".
const BARE_HOST_TLDS = new Set([
  'com',
  'org',
  'net',
  'edu',
  'gov',
  'info',
  'io',
  'dev',
  'app',
  'eu',
  'de',
  'uk',
  'fr',
  'es',
  'nl',
  'ch',
  'ca',
  'au',
  'jp',
  'se',
  'dk',
  'fi',
  'cz',
  'br',
  'cn',
]);

const isHostLabel = (label: string): boolean => {
  if (label.length === 0 || label.length > 63) return false;
  if (label.startsWith('-') || label.endsWith('-')) return false;
  for (let i = 0; i < label.length; i++) {
    const c = label.charCodeAt(i);
    const lower = c >= 97 && c <= 122;
    const digit = c >= 48 && c <= 57;
    if (!lower && !digit && c !== 45) return false;
  }
  return true;
};

const isDigits = (text: string): boolean => {
  if (text.length === 0) return false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
};

// name.tld/… — parsed by hand so that the cost is linear in the host length.
const isBareHostUrl = (text: string): boolean => {
  const slash = text.indexOf('/');
  if (slash < 4 || slash > 260) return false;
  let host = text.slice(0, slash);
  const colon = host.indexOf(':');
  if (colon >= 0) {
    if (!isDigits(host.slice(colon + 1))) return false;
    host = host.slice(0, colon);
  }
  const labels = host.split('.');
  if (labels.length < 2) return false;
  if (!labels.every(isHostLabel)) return false;
  return BARE_HOST_TLDS.has(labels[labels.length - 1]);
};

const isUrlLike = (text: string): boolean =>
  URL_WITH_SCHEME.test(text) || URL_WWW.test(text) || isBareHostUrl(text);

// A break is allowed AFTER each of these …
const URL_BREAK_AFTER = new Set(['/', '?', '&', '=', '#', '_', '-']);
// … and BEFORE a full stop, so that no line ends in a dot that could be read
// as the end of the sentence.
const URL_BREAK_BEFORE = '.';
// Neither side of a break may be shorter than this.
const URL_MIN_SIDE = 2;

const isAsciiAlnum = (ch: string | undefined): boolean =>
  ch !== undefined && /[A-Za-z0-9]/.test(ch);

/**
 * Splits a URL-like token at its break points. Returns null when the token is
 * not URL-like; returns a single fragment when it is but has no break point.
 *
 * Rule: break after `/ ? & = # _ -` (after the last one when several follow
 * each other) and before a `.` that is followed by a letter or digit. Never
 * inside the scheme or its `://`. No break leaves fewer than two characters
 * of the URL on either side. No hyphen is added at a break.
 *
 * Breaking after the separators is what the LaTeX `url` package does
 * (`\UrlBreaks`, and its `hyphens` option for `-`). Breaking before the dot
 * rather than after it, and never adding a hyphen, is the Chicago Manual of
 * Style rule for URLs (17th ed., 14.18). Chicago would also break BEFORE
 * `/ ? # _ -` rather than after; that part is not followed.
 */
const splitUrl = (word: string): string[] | null => {
  const lead = word.match(URL_LEADING)?.[0] ?? '';
  const rest = word.slice(lead.length);
  // All three tests look at the start only, so a token that is not a URL
  // leaves here before anything else is done with it.
  if (!isUrlLike(rest)) return null;
  const trailLength = trailingPunctuationLength(rest);
  const trail = rest.slice(rest.length - trailLength);
  const core = rest.slice(0, rest.length - trailLength);
  if (!isUrlLike(core)) return null;

  // First position at which a break may occur: right after "://".
  const schemeEnd = core.indexOf('://');
  const firstAllowed = Math.max(
    URL_MIN_SIDE,
    schemeEnd >= 0 ? schemeEnd + 3 : 0,
  );

  const fragments: string[] = [];
  let start = 0;
  for (let p = firstAllowed; p <= core.length - URL_MIN_SIDE; p++) {
    const prev = core[p - 1];
    const next = core[p];
    const afterSeparator =
      URL_BREAK_AFTER.has(prev) && !URL_BREAK_AFTER.has(next);
    const beforeDot =
      next === URL_BREAK_BEFORE &&
      prev !== URL_BREAK_BEFORE &&
      isAsciiAlnum(core[p + 1]);
    if (afterSeparator || beforeDot) {
      fragments.push(core.slice(start, p));
      start = p;
    }
  }
  fragments.push(core.slice(start));

  fragments[0] = lead + fragments[0];
  fragments[fragments.length - 1] += trail;
  return fragments;
};

// ─── Guards ──────────────────────────────────────────────────────────────────

// A word set in capitals: no lower-case letter and at least two upper-case
// letters, in any script. Punctuation around or inside it does not matter
// ("NATO", "(NATO)", "BUNDESREPUBLIK,", "GRÖSSE", "U.S.A.").
const isInCapitals = (word: string): boolean => {
  if (/\p{Ll}/u.test(word)) return false;
  const upper = word.match(/\p{Lu}/gu);
  return upper !== null && upper.length >= 2;
};

// An e-mail address: an "@" with a letter or digit on both sides.
const EMAIL_ADDRESS = /[\p{L}\p{N}]@[\p{L}\p{N}]/u;

const shouldSkip = (
  word: string,
  opts: HyphenateOptionsInternal,
  isFirstWord: boolean,
): boolean => {
  // strip soft hyphens before length/pattern checks
  const clean = word.replaceAll(INPUT_SOFT_HYPHEN, '');
  if (clean.length < opts.minWordLength) return true;
  if (/\d/.test(clean)) return true;
  if (/^https?:\/\//.test(clean)) return true;
  if (isInCapitals(clean)) return true;
  if (EMAIL_ADDRESS.test(clean)) return true;
  // An explicit processCapitalized wins; otherwise the language decides.
  const processCapitalized =
    opts.processCapitalized ?? capitalisesAllNouns(opts.language);
  if (!processCapitalized && !isFirstWord && /^[A-Z]/.test(clean)) {
    // Allow capitalised words at a sentence start (after .  !  ?  with optional
    // closing punctuation).  This prevents "Mr. Smith went…" from skipping
    // hyphenation on "Smith" because it happens to start with a capital.
    const isSentenceStart =
      opts._prevWord !== undefined && /[.!?]['"\)\]\}]*$/.test(opts._prevWord);
    if (!isSentenceStart) return true;
  }
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
  // A URL is never run through the pattern hyphenator and never gets a
  // hyphen. It gets break points of its own, marked by `hyphenable: false`
  // with more than one fragment. Checked before soft hyphens so that a soft
  // hyphen inside a URL cannot put a hyphen into it either.
  if (opts.breakUrls !== false) {
    const stripped = word.replaceAll(INPUT_SOFT_HYPHEN, '');
    const urlFragments = splitUrl(stripped);
    if (urlFragments) {
      return {
        original: stripped,
        fragments: urlFragments,
        hyphenable: false,
        hasSoftHyphen: false,
      };
    }
  }

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

  // Exception dictionary — checked before pattern-based hyphenation.
  if (opts.exceptions) {
    const key = clean.toLowerCase();
    const override = opts.exceptions[key];
    if (override === false) {
      return {
        original: clean,
        fragments: [clean],
        hyphenable: false,
        hasSoftHyphen: false,
      };
    }
    if (Array.isArray(override) && override.length > 1) {
      const frags = enforceMinBoundaries(override, minLeft, minRight);
      return {
        original: clean,
        fragments: frags,
        hyphenable: frags.length > 1,
        hasSoftHyphen: false,
      };
    }
  }

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
  return words.map((word, index) => {
    // Pass the previous word so shouldSkip can detect sentence boundaries.
    const optsWithPrev: HyphenateOptionsInternal =
      index > 0 ? { ...opts, _prevWord: words[index - 1] } : opts;
    return hyphenateWord(
      word,
      optsWithPrev,
      index === 0,
      opts.preserveSoftHyphens ?? true,
    );
  });
};
