// @paragraf/types — shared interfaces, type aliases, and constants.
// Zero runtime dependencies. Every other paragraf package peers on this.

// ─── Font ────────────────────────────────────────────────────────────────────

export type FontStyle = 'normal' | 'italic' | 'oblique';

export type FontStretch =
  | 'condensed'
  | 'semi-condensed'
  | 'normal'
  | 'semi-expanded'
  | 'expanded';

export type FontId = string;

export type FontVariant = 'normal' | 'superscript' | 'subscript';

export interface Font {
  id: FontId;
  size: number;
  weight: number;
  style: FontStyle;
  stretch: FontStretch;
  letterSpacing?: number; // extra space between characters, same unit as size
  // default 0 — no tracking
  // applied to (glyphCount-1) gaps after GSUB substitution
  variant?: FontVariant; // triggers GSUB sups/subs measurement; default 'normal'
}

export interface FontDescriptor {
  id: FontId;
  face: string;
  filePath: string;
}

export type FontRegistry = Map<FontId, FontDescriptor>;

// ─── Font metrics — from OS/2 table, scaled to font.size ─────────────────────

export interface FontMetrics {
  unitsPerEm: number;
  ascender: number; // sTypoAscender scaled to font.size
  descender: number; // sTypoDescender scaled to font.size (negative)
  xHeight: number; // sxHeight scaled to font.size
  capHeight: number; // sCapHeight scaled to font.size
  lineGap: number; // sTypoLineGap scaled to font.size
  baselineShift: number; // vertical offset for rendering: positive = raise (sups), negative = lower (subs), 0 = normal
}

export type GetFontMetrics = (font: Font) => FontMetrics;

// ─── Span types ───────────────────────────────────────────────────────────────

// TextSpan — single-font text run; may contain whitespace (word boundaries)
export interface TextSpan {
  text: string;
  font: Font;
  verticalOffset?: number; // renderer offset in output units: positive = above baseline (superscript), negative = below (subscript)
}

// SpanSegment — single-font run within a word or word fragment (no whitespace)
export interface SpanSegment {
  text: string;
  font: Font;
  verticalOffset?: number; // propagated from source TextSpan
}

// ─── Language ────────────────────────────────────────────────────────────────

export type Language =
  | 'en-us'
  | 'en-gb'
  | 'de'
  | 'fr'
  | 'tr'
  | 'nl'
  | 'pl'
  | 'it'
  | 'es'
  | 'sv'
  | 'no'
  | 'da'
  | 'fi'
  | 'hu'
  | 'cs'
  | 'sk'
  | 'ro'
  | 'hr'
  | 'sl'
  | 'lt'
  | 'lv'
  | 'et';

// ─── Alignment ───────────────────────────────────────────────────────────────

export type AlignmentMode = 'justified' | 'left' | 'right' | 'center';

// ─── Constants ───────────────────────────────────────────────────────────────

export const FORCED_BREAK = -Infinity;
export const PROHIBITED = +Infinity;
export const HYPHEN_PENALTY = 50;
export const DOUBLE_HYPHEN_PENALTY = 3000;
export const SOFT_HYPHEN_PENALTY = 0;

// ─── Nodes ───────────────────────────────────────────────────────────────────

export interface Box {
  type: 'box';
  width: number;
  content: string;
  font: Font;
  verticalOffset?: number; // propagated from SpanSegment; undefined for plain-text boxes
}

export interface Glue {
  type: 'glue';
  kind: 'word' | 'termination'; // explicit — no implicit font sentinel
  width: number;
  stretch: number;
  shrink: number;
  font?: Font;
}

export interface Penalty {
  type: 'penalty';
  width: number;
  penalty: number;
  flagged: boolean;
}

export type Node = Box | Glue | Penalty;

// ─── Breakpoint ──────────────────────────────────────────────────────────────

export interface BreakpointNode {
  position: number;
  line: number;
  totalDemerits: number;
  ratio: number;
  previous: BreakpointNode | null;
  flagged: boolean;
  consecutiveHyphens: number;
}

// ─── Paragraph I/O ───────────────────────────────────────────────────────────

export interface Paragraph {
  nodes: Node[];
  lineWidth: number; // default width — used when lineWidths not provided
  lineWidths?: number[]; // per-line widths for multi-column — overrides lineWidth
  tolerance: number;
  emergencyStretch?: number;
  firstLineIndent?: number;
  alignment?: AlignmentMode;
  looseness?: number;
  justifyLastLine?: boolean;
  consecutiveHyphenLimit?: number;
  widowPenalty?: number;
  orphanPenalty?: number;
}

export interface ComposedLine {
  words: string[];
  fonts: Font[];
  wordRuns: SpanSegment[][]; // per-word span detail — one inner array per word entry
  wordSpacing: number;
  hyphenated: boolean;
  ratio: number;
  alignment: AlignmentMode;
  isWidow: boolean;
  lineWidth: number; // actual lineWidth used for this line
  lineHeight: number; // max(ascender - descender + lineGap) across all fonts on the line
  baseline: number; // ascender from OS/2, relative to line top
  direction?: 'ltr' | 'rtl'; // paragraph text direction; undefined treated as 'ltr'
  xOffset?: number; // left shift in points for Optical Margin Alignment; negative = hang into left margin
}

export type ComposedParagraph = ComposedLine[];

// ─── Measurer — font-measurement abstraction ──────────────────────────────────
// Defined here so algorithm packages (1-linebreak) can type-check against the
// interface without depending on a fontkit implementation.

export type MeasureText = (content: string, font: Font) => number;
export type GlueSpaceFn = (font: Font) => GlueSpaceMetrics;

export interface GlueSpaceMetrics {
  width: number;
  stretch: number;
  shrink: number;
}

export interface Measurer {
  measure: MeasureText;
  space: GlueSpaceFn;
  metrics: GetFontMetrics;
  registry: FontRegistry;
}
