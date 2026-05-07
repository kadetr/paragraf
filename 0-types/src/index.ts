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

/**
 * Authoring weight — named keywords or numeric values (100–900).
 * Named values are authoring-only: they must be resolved to a number via
 * resolveWeight() before being passed to any engine type (Font.weight: number).
 */
export type FontWeight =
  | number
  | 'thin'
  | 'extra-light'
  | 'light'
  | 'normal'
  | 'medium'
  | 'semi-bold'
  | 'bold'
  | 'extra-bold'
  | 'black';

/**
 * Resolve a FontWeight authoring value to its numeric equivalent.
 * Numeric values pass through unchanged.
 */
export function resolveWeight(w: FontWeight): number {
  if (typeof w === 'number') return w;
  switch (w) {
    case 'thin':
      return 100;
    case 'extra-light':
      return 200;
    case 'light':
      return 300;
    case 'normal':
      return 400;
    case 'medium':
      return 500;
    case 'semi-bold':
      return 600;
    case 'bold':
      return 700;
    case 'extra-bold':
      return 800;
    case 'black':
      return 900;
  }
}

export type FontId = string;

export type FontVariant = 'normal' | 'superscript' | 'subscript';

export interface Font {
  id: FontId;
  size: number;
  weight: number; // always numeric — use resolveWeight() on FontSpec.weight before constructing
  style: FontStyle;
  stretch: FontStretch;
  letterSpacing?: number; // extra space between characters, same unit as size
  // default 0 — no tracking
  // applied to (glyphCount-1) gaps after GSUB substitution
  variant?: FontVariant; // triggers GSUB sups/subs measurement; default 'normal'
  /** When false, disables the `liga` and `rlig` OpenType ligature features. Default true. */
  ligatures?: boolean;
}

/**
 * Authoring-time font description used in style definitions.
 * All fields are optional to support partial overrides in inheritance chains.
 * Use resolveWeight() on weight before constructing a Font for the engine.
 */
export interface FontSpec {
  family?: string; // e.g. 'SourceSerif4'; inherited from parent chain if absent
  size?: number; // points
  weight?: FontWeight; // named or numeric; default 400 ('normal')
  style?: FontStyle; // 'normal' | 'italic' | 'oblique'; default 'normal'
  stretch?: FontStretch; // 'condensed' | 'normal' | 'expanded' | …; default 'normal'
  letterSpacing?: number; // extra tracking in points; default 0
  variant?: FontVariant; // 'normal' | 'superscript' | 'subscript'; default 'normal'
  /** When false, disables the `liga` and `rlig` OpenType ligature features. Default true. */
  ligatures?: boolean;
}

export interface FontDescriptor {
  id: FontId;
  /** Human-readable font family name (e.g. 'Source Serif 4'). */
  family: string;
  filePath: string;
  /** Optional variant metadata — used by the compile layer for family+variant → FontId resolution. */
  weight?: number;
  style?: FontStyle;
  /**
   * Font stretch (condensed / normal / expanded etc.).
   * Consulted by `selectVariant` in @paragraf/compile when selecting a variant.
   * Defaults to 'normal' when absent.
   */
  stretch?: FontStretch;
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

/**
 * Sentinel penalty value that forces a line break (TeX's −∞).
 * The WASM boundary (wasm-binary.ts `sentinel()`) maps this to −1e30 so that
 * Rust prefix-sum subtraction never produces NaN (∞ − ∞ = NaN).
 * On the TS side, forced-break nodes are never glue/box nodes and therefore
 * never contribute to prefix-sum arrays, so the NaN risk is contained.
 */
export const FORCED_BREAK = -Infinity;

/**
 * Sentinel penalty value that prohibits a line break (TeX's +∞).
 * The WASM boundary maps this to +1e30 for Rust. Legitimate penalties stay
 * well below this value (DOUBLE_HYPHEN_PENALTY is 3000).
 */
export const PROHIBITED = +Infinity;

/** Returns true when `penalty` represents a forced line break. */
export const isForced = (penalty: number): boolean => penalty <= FORCED_BREAK;

/** Returns true when `penalty` prohibits a line break. */
export const isProhibited = (penalty: number): boolean => penalty >= PROHIBITED;

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
  /**
   * Fitness class of this breakpoint (0=tight, 1=normal, 2=loose, 3=very-loose).
   * Used by adjDemerits to penalise abrupt changes in line tightness.
   */
  fitnessClass: 0 | 1 | 2 | 3;
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
  /**
   * Demerit added when the final line of a paragraph contains a single word (runt line).
   * @since v0.6
   */
  runtPenalty?: number;
  /**
   * Demerit added when the entire paragraph is set on a single line (all
   * content fits before the final forced break with no intermediate line
   * breaks). Use to discourage paragraphs that would otherwise collapse to
   * one line.
   * @since v0.6
   */
  singleLinePenalty?: number;
  /**
   * Extra demerits added when adjacent lines are in fitness classes more than 1
   * apart (e.g. tight followed by loose). Prevents visually jarring density
   * transitions. TeX default is 10000; omit or set 0 to disable.
   * @since v0.6
   */
  adjDemerits?: number;
  /**
   * Fixed left margin reserved on every line in points (TeX \leftskip equivalent).
   * The effective line width is reduced by leftSkip + rightSkip.
   * @since v0.6.1
   */
  leftSkip?: number;
  /**
   * Fixed right margin reserved on every line in points (TeX \rightskip equivalent).
   * The effective line width is reduced by leftSkip + rightSkip.
   * @since v0.6.1
   */
  rightSkip?: number;
  /**
   * When true and the paragraph direction is RTL with justified alignment,
   * justification fill is distributed via kashida (ـ) spacing rather than
   * word spacing.
   * @since v0.6.1
   */
  kashida?: boolean;
  /**
   * Maximum glyph expansion factor (HZ/pdfTeX style). Each line’s glyphs may
   * be scaled by at most ±maxGlyphExpansion to improve fit. Typical value: 0.005.
   * Set 0 or omit to disable.
   * @since v0.6.1
   */
  maxGlyphExpansion?: number;
}

export interface ComposedLine {
  words: string[];
  fonts: Font[];
  wordRuns: SpanSegment[][]; // per-word span detail — one inner array per word entry
  wordSpacing: number;
  hyphenated: boolean;
  ratio: number;
  alignment: AlignmentMode;
  isWidow: boolean; // @deprecated — use isRunt
  isRunt: boolean; // true when this is the last line and contains a single word
  lineWidth: number; // actual lineWidth used for this line
  lineHeight: number; // max(ascender - descender + lineGap) across all fonts on the line
  baseline: number; // ascender from OS/2, relative to line top
  direction?: 'ltr' | 'rtl'; // paragraph text direction; undefined treated as 'ltr'
  xOffset?: number; // left shift in points for Optical Margin Alignment; negative = hang into left margin
  rightProtrusion?: number; // right overhang in points for OMA; last word protrudes this many points into right margin
  leftSkip?: number; // fixed left margin in points (from Paragraph.leftSkip); 0 when not set
  rightSkip?: number; // fixed right margin in points (from Paragraph.rightSkip); 0 when not set
  kashidaSpacing?: number; // per-word kashida fill in points for RTL justified lines; 0 when not applicable
  glyphExpansion?: number; // per-line glyph scale delta (range: -maxGlyphExpansion..+maxGlyphExpansion); 0 when disabled
}

export type ComposedParagraph = ComposedLine[];

// ─── Measurer — font-measurement abstraction ──────────────────────────────────
// Defined here so algorithm packages (1a-linebreak) can type-check against the
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

// ─── Layout geometry ──────────────────────────────────────────────────────────
// Defined here (Layer 0) so both @paragraf/layout (Layer 1) and
// @paragraf/render-core (Layer 2) can reference them without a cross-layer dep.

/**
 * Baseline grid for a frame. When set on a Frame, every line placed inside
 * that frame is snapped so its baseline lands on a grid line.
 *
 * Grid lines are at: frame.y + first + n * interval  (n = 0, 1, 2, …)
 */
export interface BaselineGrid {
  /** Y-offset from frame.y where the first baseline lands. Typically = font ascender. */
  first: number;
  /** Distance between baseline grid lines in points. */
  interval: number;
}

/** A rectangular region on a specific page where text flows. */
export interface Frame {
  /** 0-based page index this frame lives on. */
  page: number;
  /** Left edge of the frame in points. */
  x: number;
  /** Top edge of the frame in points. */
  y: number;
  /** Total width of the frame (including gutters between columns) in points. */
  width: number;
  /** Total height of the frame in points. */
  height: number;
  /** Number of columns. Defaults to 1. */
  columnCount?: number;
  /** Space between columns in points. Defaults to 0. */
  gutter?: number;
  /** Optional baseline grid. When set, line placement snaps to grid. */
  grid?: BaselineGrid;
  /**
   * Vertical gap in points inserted after each paragraph placed in this frame.
   * Applied after every paragraph (including the last).
   * Defaults to 0.
   */
  paragraphSpacing?: number;
}
