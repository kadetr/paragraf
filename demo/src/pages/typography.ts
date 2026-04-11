// demo/src/pages/typography.ts
// Page 3 — Typography: font size, leading, letter-spacing showcase.

import type { Page, BootContext } from '../router.js';
import { FONTS } from '../fonts.js';

// ─── Slider constants (exported for unit tests) ──────────────────────────────────

export const FONT_SIZE_SLIDER = { min: 6, max: 72, step: 0.5 };
export const LEADING_SLIDER = { min: 0.8, max: 3.0, step: 0.05 };
export const LETTER_SPACING_SLIDER = { min: -0.1, max: 0.4, step: 0.01 };

// ─── Pure helpers (exported for unit tests) ──────────────────────────────────────

/** Clamp a font size to the slider range. */
export function clampFontSize(v: number): number {
  return Math.min(FONT_SIZE_SLIDER.max, Math.max(FONT_SIZE_SLIDER.min, v));
}

/** Clamp a leading multiplier to the slider range. */
export function clampLeading(v: number): number {
  return Math.min(LEADING_SLIDER.max, Math.max(LEADING_SLIDER.min, v));
}

/** Clamp a letter-spacing value to the slider range. */
export function clampLetterSpacing(v: number): number {
  return Math.min(
    LETTER_SPACING_SLIDER.max,
    Math.max(LETTER_SPACING_SLIDER.min, v),
  );
}

/**
 * Format a letter-spacing value for display.
 * Positive: "+0.05 em", negative: "−0.02 em" (U+2212), zero: "0 em".
 */
export function formatLetterSpacing(v: number): string {
  if (v === 0) return '0 em';
  const rounded = Math.round(v * 1000) / 1000;
  if (rounded > 0) return `+${rounded} em`;
  return `\u2212${Math.abs(rounded)} em`;
}

/**
 * Build a one-line typography spec string, e.g.:
 *   "12pt / 1.4 leading"  or  "12pt / 1.4 leading · +0.05 em"
 */
export function buildTypographySpecLine(
  fontSize: number,
  leading: number,
  letterSpacing: number,
): string {
  const base = `${fontSize}pt / ${leading} leading`;
  if (letterSpacing === 0) return base;
  return `${base} · ${formatLetterSpacing(letterSpacing)}`;
}

// ─── Defaults ────────────────────────────────────────────────────────────────────

export const DEFAULT_FONT_SIZE = 12;
export const DEFAULT_LEADING = 1.4;
export const DEFAULT_LETTER_SPACING = 0;

const SAMPLE_TEXT =
  'The quick brown fox jumps over the lazy dog. ' +
  'Pack my box with five dozen liquor jugs. ' +
  'How vexingly quick daft zebras jump!';

// ─── Showcase cards (Zone B) ─────────────────────────────────────────────────

interface ShowcaseCard {
  slug: string;
  title: string;
  description: string;
  stackblitzUrl: string;
}

const SHOWCASE_CARDS: ShowcaseCard[] = [
  {
    slug: 'mt-18-letter-spacing-0_05em',
    title: 'Per-span letter spacing',
    description:
      'Each text span carries its own letter-spacing value. Measured per-glyph using OpenType advance widths.',
    stackblitzUrl: '#',
  },
  {
    slug: 'mt-05-mixed-font',
    title: 'Mixed fonts in one paragraph',
    description:
      'Bold, italic, and display sizes flow together. Line height expands to fit the tallest glyph on each line.',
    stackblitzUrl: '#',
  },
  {
    slug: 'mt-04-superscript-subscript',
    title: 'Superscript & Subscript',
    description:
      'Inline baseline shifts for chemical formulae (H₂O) and mathematical notation (x²). Measured with variant fonts.',
    stackblitzUrl: '#',
  },
  {
    slug: 'mt-17-line-height-2_0x',
    title: 'Variable line heights',
    description:
      'A 5-step sweep from 1.0× to 2.0× leading shows how Paragraf scales line spacing uniformly across fonts.',
    stackblitzUrl: '#',
  },
  {
    slug: 'mt-15-optical-margin',
    title: 'Optical margin alignment',
    description:
      'Punctuation and serifs protrude slightly into the margin, creating a visually even left edge on justified text.',
    stackblitzUrl: '#',
  },
];

// ─── Page implementation ─────────────────────────────────────────────────────────

export const typographyPage: Page = (() => {
  let host: HTMLElement | null = null;

  let currentFontId = FONTS[0]!.id;
  let currentFontSize = DEFAULT_FONT_SIZE;
  let currentLeading = DEFAULT_LEADING;
  let currentLetterSpacing = DEFAULT_LETTER_SPACING;

  let specEl: HTMLElement | null = null;
  let previewEl: HTMLElement | null = null;

  function updatePreview() {
    const font = FONTS.find((f) => f.id === currentFontId) ?? FONTS[0]!;
    if (specEl)
      specEl.textContent = buildTypographySpecLine(
        currentFontSize,
        currentLeading,
        currentLetterSpacing,
      );
    if (previewEl) {
      Object.assign(previewEl.style, {
        fontFamily: font.family,
        fontSize: `${currentFontSize}pt`,
        lineHeight: String(currentLeading),
        letterSpacing: `${currentLetterSpacing}em`,
      });
    }
  }

  function makeSlider(
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    fmt: (v: number) => string,
    onChange: (v: number) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'control-row';
    const lbl = document.createElement('label');
    lbl.textContent = `${label}: ${fmt(value)}`;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      lbl.textContent = `${label}: ${fmt(v)}`;
      onChange(v);
      updatePreview();
    });
    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  return {
    mount(el: HTMLElement, _ctx: BootContext) {
      host = el;
      el.className = ''; // clear any class left by a previous page

      const root = document.createElement('div');
      root.className = 'typography-page';

      // ── Controls ─────────────────────────────────────────────────────────
      const controls = document.createElement('div');
      controls.className = 'controls';

      // Font select
      const fontRow = document.createElement('div');
      fontRow.className = 'control-row';
      const fontLbl = document.createElement('span');
      fontLbl.textContent = 'Font';
      const fontSelect = document.createElement('select');
      FONTS.forEach((f) => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.label;
        if (f.id === currentFontId) opt.selected = true;
        fontSelect.appendChild(opt);
      });
      fontSelect.addEventListener('change', () => {
        currentFontId = fontSelect.value;
        updatePreview();
      });
      fontRow.appendChild(fontLbl);
      fontRow.appendChild(fontSelect);
      controls.appendChild(fontRow);

      controls.appendChild(
        makeSlider(
          'Font size',
          FONT_SIZE_SLIDER.min,
          FONT_SIZE_SLIDER.max,
          FONT_SIZE_SLIDER.step,
          currentFontSize,
          (v) => `${v}pt`,
          (v) => {
            currentFontSize = clampFontSize(v);
          },
        ),
      );

      controls.appendChild(
        makeSlider(
          'Leading (Line Height)',
          LEADING_SLIDER.min,
          LEADING_SLIDER.max,
          LEADING_SLIDER.step,
          currentLeading,
          (v) => String(v),
          (v) => {
            currentLeading = clampLeading(v);
          },
        ),
      );

      controls.appendChild(
        makeSlider(
          'Letter spacing',
          LETTER_SPACING_SLIDER.min,
          LETTER_SPACING_SLIDER.max,
          LETTER_SPACING_SLIDER.step,
          currentLetterSpacing,
          formatLetterSpacing,
          (v) => {
            currentLetterSpacing = clampLetterSpacing(v);
          },
        ),
      );

      // ── Preview ──────────────────────────────────────────────────────────
      const preview = document.createElement('div');
      preview.className = 'preview-panel';

      specEl = document.createElement('div');
      specEl.className = 'spec-line';

      previewEl = document.createElement('div');
      previewEl.className = 'text-preview';
      previewEl.textContent = SAMPLE_TEXT;

      preview.appendChild(specEl);
      preview.appendChild(previewEl);

      root.appendChild(controls);
      root.appendChild(preview);
      host.appendChild(root);

      // ── Zone B: Showcase cards — disabled ─────────────────────────────────
      // const zoneB = document.createElement('section');
      // zoneB.className = 'showcase-zone';
      // … (showcase content omitted) …
      // host.appendChild(zoneB);

      updatePreview();
    },

    unmount() {
      if (host) {
        host.innerHTML = '';
        host = null;
        specEl = null;
        previewEl = null;
      }
    },
  };
})();
