import type { AlignmentMode, FontSpec, Language } from '@paragraf/types';

export type { FontSpec };

// ─── ParagraphStyleDef — raw user input ───────────────────────────────────────

export interface ParagraphStyleDef {
  extends?: string; // name of parent style in the same registry

  // Typography
  font?: FontSpec; // merged field-by-field with parent
  language?: Language;
  alignment?: AlignmentMode;
  lineHeight?: number; // total line height in points (leading)
  hyphenation?: boolean; // default true

  // Spacing
  spaceBefore?: number; // vertical space above paragraph in points
  spaceAfter?: number; // vertical space below paragraph in points
  firstLineIndent?: number; // first-line indent in points

  // KP algorithm tuning
  tolerance?: number; // KP tolerance; default 2
  looseness?: number; // KP looseness; default 0

  // Style flow
  next?: string; // name of style to apply to the following paragraph
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
}

// ─── ResolvedCharStyle — flat, fully-merged character override ────────────────

export interface ResolvedCharStyle {
  font: Partial<FontSpec>; // font.letterSpacing is the authoritative tracking override
  color?: string;
}
