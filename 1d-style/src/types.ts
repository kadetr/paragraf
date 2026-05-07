import type { AlignmentMode, FontSpec, Language } from '@paragraf/types';

export type { FontSpec };

// ─── FontFeatures — OpenType feature configuration ────────────────────────────

/**
 * A map of OpenType feature tags to their enabled/disabled state.
 * Use `featureSetIdFromConfig` to derive a deterministic cache-key segment.
 */
export type FontFeatures = Record<string, boolean>;

/**
 * Produces a deterministic string key from a `FontFeatures` map.
 * Keys are sorted before serialisation — insertion order does not affect output.
 */
export const featureSetIdFromConfig = (config: FontFeatures): string => {
  const sorted = Object.keys(config)
    .sort()
    .map((k) => [k, config[k]] as const);
  return JSON.stringify(sorted);
};

// ─── NestedStyleRule / GrepStyleRule — character-range styling ───────────────

/**
 * Applies a character style to an initial run of words or characters within
 * a paragraph — equivalent to InDesign's "Nested Styles" feature.
 *
 * The actual application to rendered text ranges requires the inline-markup
 * compile pipeline (F027). This definition establishes the data model.
 */
export interface NestedStyleRule {
  /** Character style name from the CharStyleRegistry. */
  charStyle: string;
  /** Number of units (words or characters) this rule spans. */
  through: number;
  /** Unit type for counting. Defaults to 'words'. */
  unitType?: 'words' | 'chars';
  /** When true, the rule repeats throughout the paragraph. Default false. */
  repeat?: boolean;
}

/**
 * Applies a character style to all text spans matching a regex pattern —
 * equivalent to InDesign's "GREP Styles" feature.
 *
 * The actual application to rendered text ranges requires the inline-markup
 * compile pipeline (F027). This definition establishes the data model.
 */
export interface GrepStyleRule {
  /** Character style name from the CharStyleRegistry. */
  charStyle: string;
  /**
   * ECMAScript regex pattern string (no delimiters, no flags).
   * Applied globally across the paragraph text.
   */
  pattern: string;
}

// ─── ParagraphStyleDef — raw user input ───────────────────────────────────────

export interface ParagraphStyleDef {
  extends?: string; // name of parent style in the same registry

  // Typography
  font?: FontSpec; // merged field-by-field with parent
  language?: Language;
  alignment?: AlignmentMode;
  lineHeight?: number; // total line height in points (leading)
  /**
   * Enable hyphenation for this paragraph (default `true`).
   *
   * When set to `false`, the compile pipeline disables Knuth-Plass hyphenation
   * for this paragraph. Words are split only at whitespace boundaries. Has no
   * effect on RTL paragraphs or span-based paragraphs.
   */
  hyphenation?: boolean;

  // Spacing
  /**
   * Vertical space above the paragraph in points.
   *
   * Applied by `layoutDocument` before the first line batch of the paragraph.
   * Not applied to continuation batches when the paragraph spans columns or frames.
   */
  spaceBefore?: number;
  /**
   * Vertical space below the paragraph in points.
   *
   * Applied by `layoutDocument` after the last line batch of the paragraph.
   * Not applied to intermediate batches when the paragraph spans columns or frames.
   */
  spaceAfter?: number;
  firstLineIndent?: number; // first-line indent in points

  // KP algorithm tuning
  tolerance?: number; // KP tolerance; default 2
  looseness?: number; // KP looseness; default 0

  // Style flow
  next?: string; // name of style to apply to the following paragraph

  // OpenType features
  features?: FontFeatures; // feature config for cache-key derivation via featureSetIdFromConfig

  // Character range styling (data model; rendering requires F027 inline-markup pipeline)
  nestedStyles?: NestedStyleRule[];
  grepStyles?: GrepStyleRule[];
}

// ─── CharStyleDef — character-level overrides ────────────────────────────────

export interface CharStyleDef {
  font?: Partial<FontSpec>; // use font.letterSpacing for tracking overrides
  color?: string; // CSS hex/rgb string — stored, not rendered here
}

// ─── ResolvedParagraphStyle — flat, fully-merged output ──────────────────────

export interface ResolvedParagraphStyle {
  // Font — all fields required after resolution
  font: Required<FontSpec>;

  // Typography
  language: Language;
  alignment: AlignmentMode;
  lineHeight: number;
  hyphenation: boolean;

  // Spacing
  spaceBefore: number;
  spaceAfter: number;
  firstLineIndent: number;

  // KP tuning
  tolerance: number;
  looseness: number;

  // Style flow (optional — only present if declared in the chain)
  next?: string;

  // OpenType features (optional — only present if declared in the chain)
  features?: FontFeatures;

  // Character range styling (optional — only present if declared in the chain)
  nestedStyles?: NestedStyleRule[];
  grepStyles?: GrepStyleRule[];
}

// ─── ResolvedCharStyle — flat, fully-merged character override ────────────────

export interface ResolvedCharStyle {
  font: Partial<FontSpec>; // font.letterSpacing is the authoritative tracking override
  color?: string;
}
