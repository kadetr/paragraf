// paragraph.ts

import { createRequire } from 'module';
import { readFileSync } from 'fs';

import {
  Font,
  FontRegistry,
  AlignmentMode,
  Language,
  ComposedParagraph,
  TextSpan,
  SpanSegment,
} from './types';
import {
  HyphenateOptions,
  DEFAULT_HYPHENATE_OPTIONS,
  loadHyphenator,
  hyphenateParagraph,
  hyphenateWord,
} from './hyphenate';
import { createMeasurer, Measurer, GlueSpaceMetrics } from './measure';
import { buildNodeSequence, HyphenatedWordWithFont } from './nodes';
import { computeBreakpoints } from './linebreak';
import { traceback, LineBreak } from './traceback';
import { composeParagraph } from './compose';
import { tracebackWasmBinary } from './wasm-binary.js';
import { WasmFontEngine } from './engines/wasm-engine.js';
import { FontkitEngine } from './engines/fontkit-engine.js';
import { FontEngine } from './font-engine';

// ─── WASM module — loaded once at module initialisation ───────────────────────
//
// Loaded synchronously via the CJS shim (same pattern as opentype.js in
// measure.ts). If the WASM package is absent or fails to initialise, _wasm
// stays null and every compose() call transparently falls back to the
// TypeScript implementations.

let _wasm: any = null;
let _wasmError: string | null = null;
try {
  const _require = createRequire(import.meta.url);
  _wasm = _require('../wasm/pkg/knuth_plass_wasm.js');
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
export function wasmStatus(): { status: 'loaded' | 'absent' | 'error'; error?: string } {
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
    // Strong RTL: Hebrew (0590-05FF), Arabic and supplements
    if (
      (cp >= 0x0590 && cp <= 0x05ff) ||
      (cp >= 0x0600 && cp <= 0x06ff) ||
      (cp >= 0x0750 && cp <= 0x077f) ||
      (cp >= 0xfb50 && cp <= 0xfdff) ||
      (cp >= 0xfe70 && cp <= 0xfeff)
    ) {
      return 'rtl';
    }
    // Strong LTR: basic Latin letters — stop scanning early
    if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) {
      return 'ltr';
    }
  }
  return 'ltr';
};

const getDirectionViaWasm = (text: string): 'ltr' | 'rtl' => {
  try {
    const r = JSON.parse(_wasm.analyze_bidi(text)) as {
      ok?: Array<{ text: string; isRtl: boolean }>;
    };
    if (!r.ok) return detectParagraphDirection(text);
    let rtlLen = 0;
    let ltrLen = 0;
    for (const run of r.ok) {
      if (run.isRtl) rtlLen += run.text.length;
      else ltrLen += run.text.length;
    }
    return rtlLen > ltrLen ? 'rtl' : 'ltr';
  } catch {
    return detectParagraphDirection(text);
  }
};

const toWasmJson = (obj: unknown): string =>
  JSON.stringify(obj, (_, v) => {
    if (v === -Infinity) return -1e30;
    if (v === Infinity) return 1e30;
    return v;
  });

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
  font: Font;
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
  widowPenalty?: number;
  orphanPenalty?: number;
  preserveSoftHyphens?: boolean;
}

export interface ParagraphOutput {
  lines: ComposedParagraph;
  lineCount: number;
  usedEmergency: boolean;
}

export interface ParagraphComposer {
  compose: (input: ParagraphInput) => ParagraphOutput;
  ensureLanguage: (language: Language) => Promise<void>;
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
    let needed = frag.length;

    while (needed > 0 && segIdx < wordSegs.length) {
      const seg = wordSegs[segIdx];
      const avail = seg.text.length - charIdx;

      if (avail <= needed) {
        if (avail > 0) {
          fragSegs.push({
            text: seg.text.slice(charIdx),
            font: seg.font,
            verticalOffset: seg.verticalOffset,
          });
        }
        needed -= avail;
        segIdx++;
        charIdx = 0;
      } else {
        fragSegs.push({
          text: seg.text.slice(charIdx, charIdx + needed),
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
): Promise<ParagraphComposer> => {
  await loadHyphenator('en-us');

  const measurer: Measurer =
    _wasm !== null ? createWasmMeasurer(registry) : createMeasurer(registry);
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
      widowPenalty = 0,
      orphanPenalty = 0,
      preserveSoftHyphens = true,
    } = input;

    // Detect paragraph direction.
    // RTL paragraphs bypass language loading and hyphenation for v0.8.
    const sourceText = spans ? spans.map((s) => s.text).join('') : text;
    const direction: 'ltr' | 'rtl' =
      _wasm !== null
        ? getDirectionViaWasm(sourceText)
        : detectParagraphDirection(sourceText);

    if (direction === 'rtl' && _wasm === null && !_rtlFallbackWarnIssued) {
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
      fontSize: font.size,
      preserveSoftHyphens,
    };

    let withFonts: HyphenatedWordWithFont[];

    if (direction === 'rtl') {
      // RTL: no hyphenation — split by whitespace and wrap each word directly.
      const words = sourceText.trim().split(/\s+/).filter((w) => w.length > 0);
      withFonts = words.map((word) => ({
        original: word,
        fragments: [word],
        hyphenable: false,
        hasSoftHyphen: false,
        font,
      }));
    } else if (spans && spans.length > 0) {
      // span-based LTR input
      withFonts = spansToWords(spans, opts, measurer);
    } else {
      const hyphenated = hyphenateParagraph(text, opts);
      withFonts = hyphenated.map((w, i) => ({
        ...w,
        font: fontPerWord ? fontPerWord(i, w.original) : font,
      }));
    }

    const nodes = buildNodeSequence(withFonts, measurer, firstLineIndent);

    let breaks: LineBreak[];
    let usedEmergency: boolean;

    if (_wasm !== null) {
      const tbResult = tracebackWasmBinary(
        _wasm,
        nodes,
        lineWidth,
        tolerance,
        emergencyStretch,
        looseness,
        widowPenalty,
        orphanPenalty,
        consecutiveHyphenLimit,
        lineWidths,
      );
      if ('error' in tbResult) throw new Error(tbResult.error);
      breaks = tbResult.ok.breaks as LineBreak[];
      usedEmergency = tbResult.ok.usedEmergency as boolean;
    } else {
      const result = computeBreakpoints({
        nodes,
        lineWidth,
        lineWidths,
        tolerance,
        emergencyStretch,
        consecutiveHyphenLimit,
        widowPenalty,
        orphanPenalty,
        looseness,
      });
      breaks = traceback(result.node);
      usedEmergency = result.usedEmergency;
    }

    const lines = composeParagraph(
      nodes,
      breaks,
      alignment,
      justifyLastLine,
      lineWidth,
      lineWidths,
      measurer.metrics,
      direction,
    );

    return {
      lines,
      lineCount: lines.length,
      usedEmergency,
    };
  };

  return { compose, ensureLanguage };
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
): Promise<FontEngine> => {
  if (_wasm !== null) {
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
