// paragraph.ts

import { readFileSync } from 'fs';

import {
  Font,
  FontRegistry,
  AlignmentMode,
  Language,
  ComposedParagraph,
  TextSpan,
  SpanSegment,
} from '@paragraf/types';
import {
  HyphenateOptions,
  DEFAULT_HYPHENATE_OPTIONS,
  loadHyphenator,
  hyphenateParagraph,
  hyphenateWord,
  buildNodeSequence,
  HyphenatedWordWithFont,
  computeBreakpoints,
  traceback,
  LineBreak,
  composeParagraph,
} from '@paragraf/linebreak';
import {
  createMeasurer,
  FontkitEngine,
  FontEngine,
} from '@paragraf/font-engine';
import { Measurer, GlueSpaceMetrics } from '@paragraf/types';
import {
  WasmFontEngine,
  tracebackWasmBinary,
  loadShapingWasm,
} from '@paragraf/shaping-wasm';
import { buildOmaAdjustments, buildOmaInput } from './optical-margin.js';

// ─── WASM module — loaded once at module initialisation ───────────────────────
//
// Loaded synchronously via the CJS shim (same pattern as opentype.js in
// measure.ts). If the WASM package is absent or fails to initialise, _wasm
// stays null and every compose() call transparently falls back to the
// TypeScript implementations.

// NOTE: module-level singletons (_wasm, _wasmError, _rtlFallbackWarnIssued) persist for
// the lifetime of the process, including across test runs in a single vitest worker.
// If test isolation issues emerge, add reset() helpers behind process.env.NODE_ENV === 'test'.
let _wasm: any = null;
let _wasmError: string | null = null;
try {
  _wasm = loadShapingWasm();
} catch (e) {
  _wasmError = e instanceof Error ? e.message : String(e);
}

/**
 * Diagnostic helper — returns the current WASM loading status.
 *
 * | `status`    | Meaning                                              |
 * |-------------|------------------------------------------------------|
 * | `'loaded'`  | WASM module initialised; Rust paths active           |
 * | `'absent'`  | Package not found (wasm-pack not run); TS fallback   |
 * | `'error'`   | Package found but failed to initialise; TS fallback  |
 *
 * Use this to distinguish a clean fallback ("WASM not built yet") from a
 * misconfigured build ("WASM present but broken").
 */
export function wasmStatus(): {
  status: 'loaded' | 'absent' | 'error';
  error?: string;
} {
  if (_wasm !== null) return { status: 'loaded' };
  if (_wasmError !== null && _wasmError.includes('Cannot find module')) {
    return { status: 'absent' };
  }
  return { status: 'error', error: _wasmError ?? undefined };
}

// ─── WASM helpers ─────────────────────────────────────────────────────────────

// ─── BiDi helpers ─────────────────────────────────────────────────────────────
//
// Paragraph direction detection:
//   WASM path  — calls analyze_bidi (full UBA, run-level)
//   TS fallback — P2/P3 scan: first strong directional character wins
//
// For v0.8 scope (one paragraph = one direction), the TS fallback is sufficient.
// A one-time console.warn is emitted when RTL text is encountered without WASM.

let _rtlFallbackWarnIssued = false;

const detectParagraphDirection = (text: string): 'ltr' | 'rtl' => {
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    // Strong RTL: Hebrew (0590–05FF)
    // Syriac (0700–074F), Thaana (0780–07BF), N'Ko (07C0–07FF)
    // Samaritan (0800–082F), Mandaic (0840–085F)
    // Arabic Extended-A (08A0–08FF)
    // Arabic (0600–06FF), Arabic Supplement (0750–077F)
    // Arabic Presentation Forms-A (FB50–FDFF), Arabic Presentation Forms-B (FE70–FEFF)
    if (
      (cp >= 0x0590 && cp <= 0x05ff) ||
      (cp >= 0x0600 && cp <= 0x06ff) ||
      (cp >= 0x0700 && cp <= 0x08ff) ||
      (cp >= 0xfb50 && cp <= 0xfdff) ||
      (cp >= 0xfe70 && cp <= 0xfeff)
    ) {
      return 'rtl';
    }
    // Strong LTR: ASCII Latin, extended Latin, Greek, Cyrillic, CJK
    if (
      (cp >= 0x41 && cp <= 0x5a) ||
      (cp >= 0x61 && cp <= 0x7a) ||
      (cp >= 0xc0 && cp <= 0x2b8) ||
      (cp >= 0x370 && cp <= 0x3ff) ||
      (cp >= 0x400 && cp <= 0x4ff) ||
      (cp >= 0x4e00 && cp <= 0x9fff)
    ) {
      return 'ltr';
    }
  }
  return 'ltr';
};

const getDirectionViaWasm = (text: string): 'ltr' | 'rtl' => {
  try {
    const r = JSON.parse(_wasm.analyze_bidi_v2(text)) as {
      ok?: { paragraphDirection: string };
    };
    if (r.ok?.paragraphDirection === 'rtl') return 'rtl';
    if (r.ok?.paragraphDirection === 'ltr') return 'ltr';
    return detectParagraphDirection(text);
  } catch {
    return detectParagraphDirection(text);
  }
};

/**
 * Build a Measurer backed by rustybuzz (WASM).
 *
 * Registers every font in the registry with the Rust font cache so that
 * subsequent measure/space/metrics calls can look up font data by id.
 */
const createWasmMeasurer = (registry: FontRegistry): Measurer => {
  for (const [id, desc] of registry) {
    _wasm.register_font(id, readFileSync(desc.filePath));
  }

  return {
    registry,
    measure: (content: string, font: Font): number => {
      const r = JSON.parse(
        _wasm.measure_text_wasm(content, JSON.stringify(font)),
      );
      if ('error' in r) throw new Error(r.error);
      return r.ok.width;
    },
    space: (font: Font): GlueSpaceMetrics => {
      const r = JSON.parse(_wasm.space_metrics_wasm(JSON.stringify(font)));
      if ('error' in r) throw new Error(r.error);
      return r.ok;
    },
    metrics: (font: Font) => {
      const r = JSON.parse(_wasm.font_metrics_wasm(JSON.stringify(font)));
      if ('error' in r) throw new Error(r.error);
      return r.ok;
    },
  };
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParagraphInput {
  // plain input — single font for entire paragraph
  text?: string;
  /** Required when using `text` mode. Optional when using `spans` mode (spans carry their own fonts). */
  font?: Font;
  fontPerWord?: (index: number, word: string) => Font; // ignored when spans provided

  // rich input — per-run font, mutually exclusive with text
  spans?: TextSpan[];

  lineWidth: number;
  lineWidths?: number[];
  tolerance?: number;
  emergencyStretch?: number;
  firstLineIndent?: number;
  alignment?: AlignmentMode;
  language?: Language;
  looseness?: number;
  justifyLastLine?: boolean;
  consecutiveHyphenLimit?: number;
  /** Demerit added when the final line contains a single word. @since v0.6 */
  runtPenalty?: number;
  /**
   * Demerit added when the entire paragraph fits on a single line (no intermediate
   * breaks). Applied regardless of word count on that line. @since v0.6
   */
  singleLinePenalty?: number;
  preserveSoftHyphens?: boolean;
  /** When set, overrides the font-metric-derived line height on every composed
   *  line. Use this to enforce exact leading (e.g. 16pt) independent of the
   *  font's ascender/descender/lineGap values. */
  lineHeight?: number;
  /** When true, run a second Knuth-Plass pass with OMA-adjusted lineWidths.
   *  Each output line's xOffset is set proportional to left-margin protrusion. */
  opticalMarginAlignment?: boolean;
  /** Space above the first line of this paragraph (points). Applied by layoutDocument. */
  spaceBefore?: number;
  /** Space below the last line of this paragraph (points). Applied by layoutDocument. */
  spaceAfter?: number;
  /**
   * When false, disables hyphenation for this paragraph (text-mode LTR only).
   * spans-mode and RTL paragraphs are unaffected — they do not hyphenate.
   */
  hyphenation?: boolean;
  /** Fixed left margin reserved on every line in points (TeX \leftskip equivalent). @since v0.6.1 */
  leftSkip?: number;
  /** Fixed right margin reserved on every line in points (TeX \rightskip equivalent). @since v0.6.1 */
  rightSkip?: number;
  /**
   * When true and direction is RTL with justified alignment, distribute
   * justification fill via kashida spacing rather than word spacing. @since v0.6.1
   */
  kashida?: boolean;
  /**
   * Maximum glyph expansion factor (HZ/pdfTeX style). Each line’s glyphs may
   * be scaled by ±maxGlyphExpansion to improve fit. Typical: 0.005. @since v0.6.1
   */
  maxGlyphExpansion?: number;
}

export interface ParagraphOutput {
  lines: ComposedParagraph;
  lineCount: number;
  usedEmergency: boolean;
}

export interface ParagraphComposer {
  compose: (input: ParagraphInput) => ParagraphOutput;
  ensureLanguage: (language: Language) => Promise<void>;
  /** The Measurer used internally by this composer, when available. Reuse it
   *  for layoutDocument to avoid creating a second font-cache lookup for the
   *  same registry. Optional to preserve compatibility with existing/mock
   *  ParagraphComposer implementations. */
  measurer?: Measurer;
}

/**
 * Options for createParagraphComposer / createDefaultFontEngine.
 *
 * useWasm — when explicitly false, forces the TypeScript Knuth-Plass linebreaker
 * and fontkit measurer even if the WASM binary is present.  Defaults to
 * auto-detect: uses WASM when loaded, falls back to TS when absent.
 * Passing useWasm: true on a build where WASM was not compiled is a no-op
 * (falls back silently to TypeScript).
 */
export interface ComposerOptions {
  useWasm?: boolean;
  measureCache?: MeasureCacheOptions;
}

/**
 * A record of GSUB feature flags keyed by OpenType feature tag (e.g. 'liga', 'calt').
 * Use `featureSetIdFromConfig` to derive a deterministic cache-key string from a
 * `FeatureConfig` object so that two callers with identical feature configurations
 * always produce the same cache key — without any registration step.
 */
export type FeatureConfig = Record<string, boolean>;

/**
 * Derive a deterministic, stable string identifier from a `FeatureConfig`.
 * Keys are sorted before serialization so that `{ liga: true, calt: false }` and
 * `{ calt: false, liga: true }` produce the same ID.
 *
 * Pass the result as `MeasureCacheOptions.featureSetId` to guarantee cache-key
 * consistency across composer instances and process restarts.
 */
export const featureSetIdFromConfig = (config: FeatureConfig): string => {
  const sorted = Object.keys(config)
    .sort()
    .map((k) => [k, config[k]] as const);
  return JSON.stringify(sorted);
};

export interface MeasureCacheOptions {
  enabled?: boolean;
  maxCacheEntries?: number;
  featureSetId?: string;
  featureSetIdResolver?: (word: string, font: Font) => string;
  /**
   * A `FeatureConfig` object to derive a deterministic feature-set ID from.
   * When supplied, `featureSetIdFromConfig(featureConfig)` is used as the cache
   * key segment — guaranteeing consistency across callers with the same feature
   * configuration without any registration step.
   * Takes precedence over `featureSetId` (string); both are overridden by
   * `featureSetIdResolver`.
   */
  featureConfig?: FeatureConfig;
  /**
   * Unique identifier for the font registry used by this composer.
   * Include this when multiple ParagraphComposer instances may share the
   * module-global cache store but use different font registries — preventing
   * false cache hits when two registries assign the same font.id to different
   * typefaces. (#76)
   */
  registryId?: string;
}

export interface MeasureCacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
}

const DEFAULT_MEASURE_CACHE_OPTIONS: Required<
  Pick<MeasureCacheOptions, 'enabled' | 'maxCacheEntries'>
> = {
  enabled: true,
  maxCacheEntries: 10_000,
};

let _measureCacheConfig: Required<
  Pick<MeasureCacheOptions, 'enabled' | 'maxCacheEntries'>
> = {
  ...DEFAULT_MEASURE_CACHE_OPTIONS,
};

const _measureCacheStore = new Map<string, number>();
const _measureCacheStats: MeasureCacheStats = {
  size: 0,
  hits: 0,
  misses: 0,
  evictions: 0,
};

// Monotonically increasing counter used to generate a unique registryId for
// each ParagraphComposer instance that does not supply one explicitly (#76).
let _composerInstanceCounter = 0;

let _nonLtrCacheWarnIssued = false;

const normalizeMaxEntries = (value: number | undefined): number => {
  if (value === undefined) return DEFAULT_MEASURE_CACHE_OPTIONS.maxCacheEntries;
  if (!Number.isFinite(value)) {
    return DEFAULT_MEASURE_CACHE_OPTIONS.maxCacheEntries;
  }
  return Math.max(0, Math.trunc(value));
};

const effectiveCacheConfig = (
  options?: MeasureCacheOptions,
): Required<Pick<MeasureCacheOptions, 'enabled' | 'maxCacheEntries'>> => ({
  enabled: options?.enabled ?? _measureCacheConfig.enabled,
  maxCacheEntries: normalizeMaxEntries(
    options?.maxCacheEntries ?? _measureCacheConfig.maxCacheEntries,
  ),
});

const resolveFeatureSetId = (
  word: string,
  font: Font,
  options?: MeasureCacheOptions,
): string => {
  if (options?.featureSetIdResolver) {
    const resolved = options.featureSetIdResolver(word, font);
    if (resolved && resolved.trim().length > 0) return resolved;
  }
  if (options?.featureConfig != null) {
    return featureSetIdFromConfig(options.featureConfig);
  }
  if (options?.featureSetId && options.featureSetId.trim().length > 0) {
    return options.featureSetId;
  }
  // TODO(v2): add script + direction to cache key for non-LTR support
  return '__default-feature-set__';
};

const buildMeasureCacheKey = (
  word: string,
  font: Font,
  options?: MeasureCacheOptions,
  direction?: string,
): string => {
  const featureSetId = resolveFeatureSetId(word, font, options);
  const letterSpacing = font.letterSpacing ?? 0;
  const variant = font.variant ?? 'normal';
  return JSON.stringify([
    word,
    font.id,
    font.size,
    font.weight,
    font.style,
    font.stretch,
    letterSpacing,
    variant,
    font.ligatures ?? true,
    featureSetId,
    direction ?? 'ltr',
    options?.registryId ?? '',
  ]);
};

const touchMeasureCacheKey = (key: string): void => {
  const value = _measureCacheStore.get(key);
  if (value === undefined) return;
  _measureCacheStore.delete(key);
  _measureCacheStore.set(key, value);
};

const writeMeasureCache = (
  key: string,
  value: number,
  maxCacheEntries: number,
): void => {
  _measureCacheStore.set(key, value);
  while (maxCacheEntries > 0 && _measureCacheStore.size > maxCacheEntries) {
    const oldestKey = _measureCacheStore.keys().next().value as
      | string
      | undefined;
    if (oldestKey === undefined) break;
    _measureCacheStore.delete(oldestKey);
    _measureCacheStats.evictions += 1;
  }
  _measureCacheStats.size = _measureCacheStore.size;
};

const withMeasureCache = (
  base: Measurer,
  options?: MeasureCacheOptions,
  getDirection?: () => string,
): Measurer => {
  return {
    ...base,
    measure: (content: string, font: Font): number => {
      const cfg = effectiveCacheConfig(options);
      if (!cfg.enabled || cfg.maxCacheEntries <= 0) {
        return base.measure(content, font);
      }

      const key = buildMeasureCacheKey(
        content,
        font,
        options,
        getDirection?.(),
      );
      const cached = _measureCacheStore.get(key);
      if (cached !== undefined) {
        _measureCacheStats.hits += 1;
        touchMeasureCacheKey(key);
        return cached;
      }

      _measureCacheStats.misses += 1;
      const measured = base.measure(content, font);
      writeMeasureCache(key, measured, cfg.maxCacheEntries);
      return measured;
    },
  };
};

export const clearMeasureCache = (): void => {
  _measureCacheStore.clear();
  _measureCacheStats.size = 0;
  _measureCacheStats.hits = 0;
  _measureCacheStats.misses = 0;
  _measureCacheStats.evictions = 0;
  _nonLtrCacheWarnIssued = false;
};

/**
 * Reset module-level shaping state flags.
 *
 * Clears `_rtlFallbackWarnIssued` so that the BiDi fallback warning will fire
 * again on the next RTL paragraph. Intended for test isolation — call in
 * `afterEach` / `afterAll` when tests compose RTL paragraphs.
 *
 * Does NOT reset `_wasm` or `_wasmError` — those are process-lifetime singletons.
 */
export const clearShapingState = (): void => {
  _rtlFallbackWarnIssued = false;
};

export const getMeasureCacheStats = (): MeasureCacheStats => ({
  size: _measureCacheStore.size,
  hits: _measureCacheStats.hits,
  misses: _measureCacheStats.misses,
  evictions: _measureCacheStats.evictions,
});

export const configureMeasureCache = (
  options: MeasureCacheOptions = {},
): Required<Pick<MeasureCacheOptions, 'enabled' | 'maxCacheEntries'>> => {
  _measureCacheConfig = {
    enabled: options.enabled ?? _measureCacheConfig.enabled,
    maxCacheEntries: normalizeMaxEntries(
      options.maxCacheEntries ?? _measureCacheConfig.maxCacheEntries,
    ),
  };
  return { ..._measureCacheConfig };
};

// ─── OMA helpers ─────────────────────────────────────────────────────────────

/**
 * Return true when two composed paragraphs have identical break structure:
 * the same number of lines with the same words on each line.
 * Used for OMA convergence detection.
 */
function _omaBreaksMatch(a: ComposedParagraph, b: ComposedParagraph): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (la, i) =>
      la.words.length === b[i].words.length &&
      la.words.every((w, j) => w === b[i].words[j]),
  );
}

// ─── Span helpers ─────────────────────────────────────────────────────────────

const mapFragmentsToSegments = (
  wordSegs: SpanSegment[],
  fragments: string[],
): SpanSegment[][] => {
  const result: SpanSegment[][] = [];
  let segIdx = 0;
  let charIdx = 0;

  for (const frag of fragments) {
    const fragSegs: SpanSegment[] = [];
    let needed = [...frag].length;

    while (needed > 0 && segIdx < wordSegs.length) {
      const seg = wordSegs[segIdx];
      const avail = [...seg.text].length - charIdx;

      if (avail <= needed) {
        if (avail > 0) {
          fragSegs.push({
            text: [...seg.text].slice(charIdx).join(''),
            font: seg.font,
            verticalOffset: seg.verticalOffset,
          });
        }
        needed -= avail;
        segIdx++;
        charIdx = 0;
      } else {
        fragSegs.push({
          text: [...seg.text].slice(charIdx, charIdx + needed).join(''),
          font: seg.font,
          verticalOffset: seg.verticalOffset,
        });
        charIdx += needed;
        needed = 0;
      }
    }

    result.push(fragSegs);
  }

  return result;
};

// Process TextSpan[] into HyphenatedWordWithFont[].
//
// verticalOffset auto-population: when a span carries Font.variant
// (superscript or subscript) but no explicit verticalOffset, the offset is
// computed from OS/2 metrics via measurer.metrics(). This means a caller only
// needs to set font.variant — they do not also have to manually compute and
// pass verticalOffset. Explicit verticalOffset on the span always takes
// precedence.

const spansToWords = (
  spans: TextSpan[],
  opts: HyphenateOptions,
  measurer: Measurer,
): HyphenatedWordWithFont[] => {
  const wordSegsList: SpanSegment[][] = [];
  let currentWord: SpanSegment[] = [];

  for (const span of spans) {
    // resolve verticalOffset: explicit > auto from variant > undefined
    const autoOffset =
      span.verticalOffset !== undefined
        ? span.verticalOffset
        : span.font.variant === 'superscript' ||
            span.font.variant === 'subscript'
          ? measurer.metrics(span.font).baselineShift
          : undefined;

    let rest = span.text;
    while (rest.length > 0) {
      const wsMatch = rest.match(/^\s+/);
      if (wsMatch) {
        if (currentWord.length > 0) {
          wordSegsList.push(currentWord);
          currentWord = [];
        }
        rest = rest.slice(wsMatch[0].length);
      } else {
        const wordMatch = rest.match(/^\S+/);
        if (wordMatch) {
          currentWord.push({
            text: wordMatch[0],
            font: span.font,
            verticalOffset: autoOffset,
          });
          rest = rest.slice(wordMatch[0].length);
        } else {
          break;
        }
      }
    }
  }
  if (currentWord.length > 0) wordSegsList.push(currentWord);

  return wordSegsList.map((segs, index) => {
    const wordText = segs.map((s) => s.text).join('');
    const hyphenated = hyphenateWord(
      wordText,
      opts,
      index === 0,
      opts.preserveSoftHyphens ?? true,
    );
    const segments = mapFragmentsToSegments(segs, hyphenated.fragments);

    return {
      ...hyphenated,
      font: segs[0].font,
      segments,
    };
  });
};

// ─── Factory ─────────────────────────────────────────────────────────────────

export const createParagraphComposer = async (
  registry: FontRegistry,
  options?: ComposerOptions,
): Promise<ParagraphComposer> => {
  await loadHyphenator('en-us');

  // useWasm: default is auto-detect (true when WASM loaded); callers can force false
  // to use the TypeScript path unconditionally (e.g. for the 1a layer split).
  const useWasm = (options?.useWasm ?? true) && _wasm !== null;

  const baseMeasurer: Measurer = useWasm
    ? createWasmMeasurer(registry)
    : createMeasurer(registry);

  // Mutable ref: compose() sets this before measuring so the cache key includes
  // the current paragraph's direction (#23). The ref is local to this composer
  // instance and is not shared across concurrent calls.
  let _currentDirection: string = 'ltr';

  // registryId scopes the cache key to this registry, preventing false hits
  // when two composers share the module-global store but use different font
  // registries (#76). A simple incrementing counter is sufficient.
  const registryId =
    options?.measureCache?.registryId ?? String(_composerInstanceCounter++);

  const cacheOptions: MeasureCacheOptions = {
    ...options?.measureCache,
    registryId,
  };

  const measurer: Measurer = withMeasureCache(
    baseMeasurer,
    cacheOptions,
    () => _currentDirection,
  );
  const loadedLanguages = new Set<Language>(['en-us']);

  const ensureLanguage = async (language: Language): Promise<void> => {
    if (loadedLanguages.has(language)) return;
    await loadHyphenator(language);
    loadedLanguages.add(language);
  };

  const compose = (input: ParagraphInput): ParagraphOutput => {
    const {
      text = '',
      font,
      fontPerWord,
      spans,
      lineWidth,
      lineWidths = [],
      tolerance = 2,
      emergencyStretch = 0,
      firstLineIndent = 0,
      alignment = 'justified',
      language = 'en-us',
      looseness = 0,
      justifyLastLine = false,
      consecutiveHyphenLimit = 0,
      runtPenalty = 0,
      singleLinePenalty = 0,
      preserveSoftHyphens = true,
    } = input;

    const leftSkip = input.leftSkip ?? 0;
    const rightSkip = input.rightSkip ?? 0;
    if (leftSkip < 0 || rightSkip < 0) {
      throw new RangeError(
        `[paragraf] compose(): leftSkip and rightSkip must be non-negative (got leftSkip=${leftSkip}, rightSkip=${rightSkip}).`,
      );
    }
    const skipWidth = leftSkip + rightSkip;
    // Reduce KP line widths to exclude skip margins.
    const kpLineWidth = skipWidth > 0 ? lineWidth - skipWidth : lineWidth;
    if (kpLineWidth <= 0) {
      throw new RangeError(
        `[paragraf] compose(): leftSkip + rightSkip (${skipWidth}pt) must be less than lineWidth (${lineWidth}pt).`,
      );
    }
    const kpLineWidths =
      skipWidth > 0 && lineWidths.length > 0
        ? lineWidths.map((w, i) => {
            const effective = w - skipWidth;
            if (effective <= 0) {
              throw new RangeError(
                `[paragraf] compose(): leftSkip + rightSkip (${skipWidth}pt) must be less than lineWidths[${i}] (${w}pt).`,
              );
            }
            return effective;
          })
        : lineWidths;

    // Detect paragraph direction.
    // RTL paragraphs bypass language loading and hyphenation for v0.8.
    if (spans && text) {
      console.warn(
        '[paragraf] compose(): both `text` and `spans` provided — `spans` takes precedence and `text` is ignored.',
      );
    }

    // F012: font is required in text mode; optional in spans mode.
    // An empty spans array is treated as text mode — hasSpans requires length > 0.
    const hasSpans = (spans?.length ?? 0) > 0;
    if (!hasSpans && !font) {
      throw new Error(
        '[paragraf] compose(): font is required when using text mode',
      );
    }

    const sourceText = hasSpans ? spans!.map((s) => s.text).join('') : text;
    const direction: 'ltr' | 'rtl' = useWasm
      ? getDirectionViaWasm(sourceText)
      : detectParagraphDirection(sourceText);

    // Update the direction ref so the cache key includes the current paragraph's
    // direction — prevents stale hits when LTR and RTL paragraphs are composed
    // with the same composer instance (#23).
    _currentDirection = direction;

    const cacheCfg = effectiveCacheConfig(cacheOptions);
    if (cacheCfg.enabled && direction === 'rtl' && !_nonLtrCacheWarnIssued) {
      // Direction is included in the cache key since v0.6 — no longer warn.
      _nonLtrCacheWarnIssued = true;
    }

    if (direction === 'rtl' && !useWasm && !_rtlFallbackWarnIssued) {
      console.warn(
        '[knuth-plass] BiDi: WASM not loaded — using TypeScript paragraph-level ' +
          'direction detection. Full run segmentation unavailable.',
      );
      _rtlFallbackWarnIssued = true;
    }

    if (direction !== 'rtl' && !loadedLanguages.has(language)) {
      throw new Error(
        `Language "${language}" not loaded. ` +
          `Call await composer.ensureLanguage("${language}") before composing.`,
      );
    }

    const opts: HyphenateOptions = {
      ...DEFAULT_HYPHENATE_OPTIONS,
      language,
      fontSize: font?.size ?? spans?.[0]?.font?.size ?? 12,
      preserveSoftHyphens,
    };

    let withFonts: HyphenatedWordWithFont[];

    if (direction === 'rtl') {
      // Spans not supported in RTL for v0.8 — only one-direction paragraphs with a single font.
      if (hasSpans) {
        throw new Error(
          '[paragraf] RTL paragraphs do not support span input yet. ' +
            'Use plain `text` input for RTL content.',
        );
      }
      // RTL: no hyphenation — split by whitespace and wrap each word directly.
      const words = sourceText
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0);
      withFonts = words.map((word) => ({
        original: word,
        fragments: [word],
        hyphenable: false,
        hasSoftHyphen: false,
        font: font!,
      }));
    } else if (hasSpans) {
      // span-based LTR input
      withFonts = spansToWords(spans!, opts, measurer);
    } else if (input.hyphenation === false) {
      // hyphenation disabled — split by whitespace, no hyphen breaks
      const words = (text || '')
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0);
      withFonts = words.map((word, i) => ({
        original: word,
        fragments: [word],
        hyphenable: false,
        hasSoftHyphen: false,
        font: fontPerWord ? fontPerWord(i, word) : font!,
      }));
    } else {
      const hyphenated = hyphenateParagraph(text, opts);
      withFonts = hyphenated.map((w, i) => ({
        ...w,
        font: fontPerWord ? fontPerWord(i, w.original) : font!,
      }));
    }

    const nodes = buildNodeSequence(withFonts, measurer, firstLineIndent);

    // Clamp looseness to integer — Rust side is Option<i32>; a float would be silently truncated
    const looseInt = Math.trunc(looseness);

    let breaks: LineBreak[];
    let usedEmergency: boolean;

    if (useWasm) {
      const tbResult = tracebackWasmBinary(
        _wasm,
        nodes,
        kpLineWidth,
        tolerance,
        emergencyStretch,
        looseInt,
        consecutiveHyphenLimit,
        kpLineWidths,
        runtPenalty,
        singleLinePenalty,
      );
      if ('error' in tbResult) throw new Error(tbResult.error);
      breaks = tbResult.ok.breaks as LineBreak[];
      usedEmergency = tbResult.ok.usedEmergency as boolean;
    } else {
      const result = computeBreakpoints({
        nodes,
        lineWidth: kpLineWidth,
        lineWidths: kpLineWidths,
        tolerance,
        emergencyStretch,
        consecutiveHyphenLimit,
        runtPenalty,
        singleLinePenalty,
        looseness,
      });
      breaks = traceback(result.node);
      usedEmergency = result.usedEmergency;
    }

    let lines = composeParagraph(
      nodes,
      breaks,
      alignment,
      justifyLastLine,
      kpLineWidth,
      kpLineWidths,
      measurer.metrics,
      direction,
      leftSkip,
      rightSkip,
      input.kashida ?? false,
      input.maxGlyphExpansion ?? 0,
    );

    // Optical Margin Alignment — converging recompose.
    // We iterate until break positions stabilise (or reach MAX_OMA_PASSES).
    // Each pass uses the protrusion amounts from the current line boundaries
    // to widen lineWidths, then recomposes. When two successive passes produce
    // the same word-level break structure the OMA widths and xOffsets are
    // self-consistent and we stop. In practice this converges in ≤ 2 passes.
    if (
      input.opticalMarginAlignment &&
      direction !== 'rtl' &&
      lines.length > 0
    ) {
      const MAX_OMA_PASSES = 5;
      let omaLines = lines;

      for (let pass = 0; pass < MAX_OMA_PASSES; pass++) {
        const omaInput = buildOmaInput(input, omaLines, measurer);
        const recomposed = compose(omaInput);
        const converged = _omaBreaksMatch(omaLines, recomposed.lines);
        omaLines = recomposed.lines;
        if (converged) break;
      }

      const { xOffsets, rightProtrusions } = buildOmaAdjustments(
        omaLines,
        lineWidth,
        measurer,
      );
      lines = omaLines.map((line, i) => ({
        ...line,
        xOffset: xOffsets[i] ?? 0,
        rightProtrusion: rightProtrusions[i] ?? 0,
      }));
    }

    // Apply exact leading override: when the caller specifies lineHeight on the
    // input, stamp it onto every ComposedLine so layoutDocument advances by that
    // fixed amount rather than the font-metric-derived value. Ignore invalid
    // overrides so we preserve the composed, metric-derived line heights.
    if (
      input.lineHeight !== undefined &&
      Number.isFinite(input.lineHeight) &&
      input.lineHeight > 0
    ) {
      const lh = input.lineHeight;
      lines = lines.map((line) => ({ ...line, lineHeight: lh }));
    }

    return {
      lines,
      lineCount: lines.length,
      usedEmergency,
    };
  };

  return { compose, ensureLanguage, measurer };
};

/**
 * Create a FontEngine backed by WASM (WasmFontEngine) when available,
 * falling back to FontkitEngine. All fonts in the registry are loaded.
 *
 * Use this when you need a FontEngine for rendering (renderToSvg / renderToCanvas /
 * renderToPdf) and want to stay consistent with the composer's measurement backend.
 */
export const createDefaultFontEngine = async (
  registry: FontRegistry,
  options?: ComposerOptions,
): Promise<FontEngine> => {
  const useWasm = (options?.useWasm ?? true) && _wasm !== null;

  if (useWasm) {
    const engine = new WasmFontEngine(_wasm);
    for (const [id, desc] of registry) {
      await engine.loadFont(id, desc.filePath);
    }
    return engine;
  }

  const engine = new FontkitEngine();
  for (const [id, desc] of registry) {
    await engine.loadFont(id, desc.filePath);
  }
  return engine;
};
