// e2e-layout-style-template.test.ts
//
// End-to-end integration tests for the three new Layer 1/4 packages:
//   @paragraf/layout   — PageLayout, unit converters, page sizes, Dimension
//   @paragraf/style    — defineStyles, defineCharStyles, style inheritance
//   @paragraf/template — defineTemplate, parseTokens, validation
//
// These tests exercise cross-package integration and confirm that the public
// APIs compose correctly with each other and with the existing stack.

import { describe, it, expect } from 'vitest';
import * as path from 'path';

import {
  PageLayout,
  mm,
  cm,
  inch,
  px,
  parseDimension,
  PAGE_SIZES,
  resolvePageSize,
  landscape,
  portrait,
  columnWidths,
  type Dimension,
} from '@paragraf/layout';

import {
  defineStyles,
  defineCharStyles,
  type FontWeight,
  resolveWeight,
} from '@paragraf/style';

import {
  defineTemplate,
  parseTokens,
  type Template,
  type DimensionMargins,
} from '@paragraf/template';

import type { Frame } from '@paragraf/types';

// ─────────────────────────────────────────────────────────────────────────────
// @paragraf/layout — integration
// ─────────────────────────────────────────────────────────────────────────────

describe('@paragraf/layout — PageLayout integration', () => {
  it('single-column A4 layout produces one frame per page', () => {
    const layout = new PageLayout({ size: 'A4', margins: mm(20) });
    const frames = layout.frames(3);
    expect(frames).toHaveLength(3);
    frames.forEach((f, i) => {
      expect(f.page).toBe(i);
      // columnCount is omitted for single-column layouts (defaults to 1 implicitly)
      expect(f.columnCount).toBeUndefined();
    });
  });

  it('two-column layout frame carries columnCount and gutter', () => {
    const layout = new PageLayout({
      size: 'A4',
      margins: mm(20),
      columns: 2,
      gutter: mm(5),
    });
    const [frame] = layout.frames(1);
    expect(frame.columnCount).toBe(2);
    expect(frame.gutter).toBeCloseTo(mm(5), 4);
  });

  it('columnWidths splits frame width evenly', () => {
    const layout = new PageLayout({
      size: 'A4',
      margins: mm(20),
      columns: 2,
      gutter: mm(5),
    });
    const [frame] = layout.frames(1);
    const widths = columnWidths(frame);
    expect(widths).toHaveLength(2);
    expect(widths[0]).toBeCloseTo(widths[1], 8);
    expect(widths[0] * 2 + mm(5)).toBeCloseTo(frame.width, 4);
  });

  it('bleed expands pageSize but not frame dimensions', () => {
    const withoutBleed = new PageLayout({ size: 'A4', margins: mm(20) });
    const withBleed = new PageLayout({
      size: 'A4',
      margins: mm(20),
      bleed: mm(3),
    });

    const [ww, wh] = withoutBleed.pageSize;
    const [bw, bh] = withBleed.pageSize;

    expect(bw).toBeCloseTo(ww + 2 * mm(3), 4);
    expect(bh).toBeCloseTo(wh + 2 * mm(3), 4);

    // frames should be the same width/height regardless of bleed
    const [wf] = withoutBleed.frames(1);
    const [bf] = withBleed.frames(1);
    expect(bf.width).toBeCloseTo(wf.width, 4);
    expect(bf.height).toBeCloseTo(wf.height, 4);
  });

  it('trimSize matches the named page size', () => {
    const layout = new PageLayout({
      size: 'A4',
      margins: mm(20),
      bleed: mm(3),
    });
    const [tw, th] = layout.trimSize;
    expect(tw).toBeCloseTo(PAGE_SIZES.A4[0], 4);
    expect(th).toBeCloseTo(PAGE_SIZES.A4[1], 4);
  });

  it('frame x/y are offset by bleed', () => {
    const layout = new PageLayout({
      size: 'A4',
      margins: mm(20),
      bleed: mm(3),
    });
    const [frame] = layout.frames(1);
    // frame is in bleed-expanded coordinate space: origin at top-left of bleed
    // so margins start at (bleed + marginLeft, bleed + marginTop)
    expect(frame.x).toBeCloseTo(mm(3) + mm(20), 4);
    expect(frame.y).toBeCloseTo(mm(3) + mm(20), 4);
  });

  it('landscape A4 layout produces wider-than-tall page', () => {
    const layout = new PageLayout({ size: landscape('A4'), margins: mm(15) });
    const [w, h] = layout.trimSize;
    expect(w).toBeGreaterThan(h);
  });

  it('per-side margins are respected', () => {
    const layout = new PageLayout({
      size: 'A4',
      margins: { top: mm(30), right: mm(15), bottom: mm(20), left: mm(25) },
    });
    const [w, h] = layout.trimSize;
    const [frame] = layout.frames(1);
    // left + right margins consume mm(25 + 15) = mm(40)
    expect(frame.width).toBeCloseTo(w - mm(40), 4);
    // top + bottom margins consume mm(30 + 20) = mm(50)
    expect(frame.height).toBeCloseTo(h - mm(50), 4);
  });
});

describe('@paragraf/layout — unit converters and Dimension', () => {
  it('mm / cm / inch / px are consistent', () => {
    expect(cm(1)).toBeCloseTo(mm(10), 8);
    expect(inch(1)).toBe(72);
    expect(px(96)).toBe(72);
  });

  it('parseDimension resolves to same value as unit helpers', () => {
    expect(parseDimension('20mm')).toBeCloseTo(mm(20), 8);
    expect(parseDimension('2cm')).toBeCloseTo(cm(2), 8);
    expect(parseDimension('0.5in')).toBeCloseTo(inch(0.5), 8);
    expect(parseDimension('72pt')).toBe(72);
    expect(parseDimension('96px')).toBeCloseTo(px(96), 8);
  });

  it('parseDimension numeric pass-through', () => {
    expect(parseDimension(36)).toBe(36);
  });

  it('parseDimension error on unknown unit', () => {
    expect(() => parseDimension('10em')).toThrow();
  });

  it('landscape / portrait are consistent across all named sizes', () => {
    for (const name of Object.keys(PAGE_SIZES) as Array<
      keyof typeof PAGE_SIZES
    >) {
      const [lw, lh] = landscape(name);
      const [pw, ph] = portrait(name);
      expect(lw).toBeGreaterThanOrEqual(lh);
      expect(ph).toBeGreaterThanOrEqual(pw);
      // dimensions are swapped (or equal for square)
      expect(lw).toBe(ph);
      expect(lh).toBe(pw);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @paragraf/style — integration
// ─────────────────────────────────────────────────────────────────────────────

describe('@paragraf/style — style inheritance integration', () => {
  it('typical publication style sheet resolves correctly', () => {
    const styles = defineStyles({
      defaults: {
        font: {
          family: 'LiberationSerif',
          size: 10,
          weight: 400,
          style: 'normal',
        },
        language: 'en-us',
        alignment: 'justified',
        lineHeight: 14,
        hyphenation: true,
      },
      body: {
        extends: 'defaults',
        spaceAfter: 4,
      },
      heading: {
        extends: 'defaults',
        font: { size: 18, weight: 'bold' },
        alignment: 'left',
        spaceBefore: 18,
        spaceAfter: 8,
        hyphenation: false,
        next: 'body',
      },
      caption: {
        extends: 'body',
        font: { size: 8 },
        alignment: 'left',
      },
    });

    const body = styles.resolve('body');
    expect(body.font.family).toBe('LiberationSerif');
    expect(body.font.size).toBe(10);
    expect(body.language).toBe('en-us');
    expect(body.spaceAfter).toBe(4);

    const heading = styles.resolve('heading');
    expect(heading.font.family).toBe('LiberationSerif'); // inherited from defaults
    expect(heading.font.size).toBe(18);
    expect(heading.font.weight).toBe('bold'); // named weight preserved
    expect(heading.hyphenation).toBe(false);
    expect(heading.next).toBe('body');

    const caption = styles.resolve('caption');
    expect(caption.font.family).toBe('LiberationSerif'); // inherited through body → defaults
    expect(caption.font.size).toBe(8);
    expect(caption.spaceAfter).toBe(4); // inherited from body
  });

  it('resolveWeight converts named weights to numbers', () => {
    const weights: Array<[FontWeight, number]> = [
      ['thin', 100],
      ['extra-light', 200],
      ['light', 300],
      ['normal', 400],
      ['medium', 500],
      ['semi-bold', 600],
      ['bold', 700],
      ['extra-bold', 800],
      ['black', 900],
    ];
    for (const [name, expected] of weights) {
      expect(resolveWeight(name)).toBe(expected);
    }
    expect(resolveWeight(650)).toBe(650); // numeric pass-through
  });

  it('named weight in resolved style is converted by resolveWeight', () => {
    const styles = defineStyles({
      heading: { font: { weight: 'bold' } },
    });
    const resolved = styles.resolve('heading');
    expect(resolved.font.weight).toBe('bold'); // preserved as named
    expect(resolveWeight(resolved.font.weight)).toBe(700); // converted for engine
  });

  it('char styles layer on top of paragraph styles', () => {
    const para = defineStyles({
      body: { font: { family: 'LiberationSerif', size: 10 } },
    });
    const chars = defineCharStyles({
      em: { font: { style: 'italic' } },
      bold: { font: { weight: 700 } },
      link: { color: '#0066cc', font: { style: 'italic' } },
    });

    const base = para.resolve('body');
    const em = chars.resolve('em');
    const bold = chars.resolve('bold');
    const link = chars.resolve('link');

    expect(base.font.family).toBe('LiberationSerif');
    expect(em.font.style).toBe('italic');
    expect(bold.font.weight).toBe(700);
    expect(link.color).toBe('#0066cc');
    expect(link.font.style).toBe('italic');
  });

  it('has() works on both registry types', () => {
    const styles = defineStyles({ body: {}, heading: {} });
    const chars = defineCharStyles({ em: {}, strong: {} });

    expect(styles.has('body')).toBe(true);
    expect(styles.has('ghost')).toBe(false);
    expect(chars.has('em')).toBe(true);
    expect(chars.has('ghost')).toBe(false);
  });

  it('font.stretch and font.variant survive inheritance chain', () => {
    const styles = defineStyles({
      root: { font: { stretch: 'condensed', variant: 'superscript' } },
      child: { extends: 'root', font: { size: 8 } },
    });
    const r = styles.resolve('child');
    expect(r.font.stretch).toBe('condensed');
    expect(r.font.variant).toBe('superscript');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @paragraf/template — integration
// ─────────────────────────────────────────────────────────────────────────────

const FONTS_DIR = path.resolve(__dirname, '../fonts');

const FULL_TEMPLATE: Template = {
  layout: {
    size: 'A4',
    margins: { top: '20mm', right: '20mm', bottom: '20mm', left: '25mm' },
    columns: 1,
    bleed: '3mm',
  },
  fonts: {
    LiberationSerif: {
      regular: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
      bold: path.join(FONTS_DIR, 'LiberationSerif-Bold.ttf'),
      italic: path.join(FONTS_DIR, 'LiberationSerif-Italic.ttf'),
      boldItalic: path.join(FONTS_DIR, 'LiberationSerif-BoldItalic.ttf'),
    },
    Roboto: {
      regular: path.join(FONTS_DIR, 'Roboto-Regular.ttf'),
      bold: path.join(FONTS_DIR, 'Roboto-Bold.ttf'),
      light: path.join(FONTS_DIR, 'Roboto-Light.ttf'), // custom variant
    },
  },
  styles: {
    defaults: {
      font: { family: 'LiberationSerif', size: 10, weight: 400 },
      language: 'en-us',
      lineHeight: 14,
      hyphenation: true,
    },
    'product-name': {
      extends: 'defaults',
      font: { size: 16, weight: 'bold' },
      alignment: 'left',
      spaceBefore: 12,
    },
    body: {
      extends: 'defaults',
      alignment: 'justified',
      spaceAfter: 4,
    },
    caption: {
      extends: 'body',
      font: { size: 8 },
      alignment: 'left',
    },
  },
  content: [
    {
      style: 'product-name',
      text: '{{product.name}}',
    },
    {
      style: 'body',
      text: '{{product.description}}',
      onMissing: 'fallback',
      fallbackText: 'No description available.',
    },
    {
      style: 'caption',
      text: 'Article: {{product.sku}}',
      onMissing: 'skip',
    },
    {
      style: 'caption',
      text: 'Static footer text with no binding',
    },
  ],
};

describe('@paragraf/template — defineTemplate integration', () => {
  it('full realistic template validates without error', () => {
    expect(() => defineTemplate(FULL_TEMPLATE)).not.toThrow();
  });

  it('returned object is the same reference (no cloning)', () => {
    expect(defineTemplate(FULL_TEMPLATE)).toBe(FULL_TEMPLATE);
  });

  it('layout Dimension strings are stored verbatim (resolved by compile layer)', () => {
    const t = defineTemplate(FULL_TEMPLATE);
    const margins = t.layout.margins as DimensionMargins;
    expect(typeof margins.top).toBe('string');
    expect(margins.top).toBe('20mm');
    expect(t.layout.bleed).toBe('3mm');
  });

  it('custom font variant key is preserved', () => {
    const t = defineTemplate(FULL_TEMPLATE);
    expect(t.fonts.Roboto.light).toBe(path.join(FONTS_DIR, 'Roboto-Light.ttf'));
  });

  it('styles are accessible as raw defs after defineTemplate', () => {
    const t = defineTemplate(FULL_TEMPLATE);
    expect(t.styles['product-name'].font?.size).toBe(16);
    expect(t.styles.body.extends).toBe('defaults');
  });

  it('template styles can be passed directly to defineStyles', () => {
    const t = defineTemplate(FULL_TEMPLATE);
    const registry = defineStyles(t.styles);
    const productName = registry.resolve('product-name');
    expect(productName.font.family).toBe('LiberationSerif'); // inherited from defaults
    expect(productName.font.size).toBe(16);
    expect(productName.font.weight).toBe('bold');
  });

  it('content slots are accessible with correct onMissing defaults', () => {
    const t = defineTemplate(FULL_TEMPLATE);
    expect(t.content[0].style).toBe('product-name');
    expect(t.content[0].onMissing).toBeUndefined(); // not set → compile defaults to skip
    expect(t.content[1].onMissing).toBe('fallback');
    expect(t.content[1].fallbackText).toBe('No description available.');
    expect(t.content[2].onMissing).toBe('skip');
  });
});

describe('@paragraf/template + @paragraf/layout — Dimension round-trip', () => {
  it('margin Dimension strings in template resolve via parseDimension', () => {
    const t = defineTemplate(FULL_TEMPLATE);
    const margins = t.layout.margins as DimensionMargins;

    // simulate what @paragraf/compile will do
    const top = parseDimension(margins.top);
    const right = parseDimension(margins.right);
    const bottom = parseDimension(margins.bottom);
    const left = parseDimension(margins.left);

    expect(top).toBeCloseTo(mm(20), 4);
    expect(right).toBeCloseTo(mm(20), 4);
    expect(bottom).toBeCloseTo(mm(20), 4);
    expect(left).toBeCloseTo(mm(25), 4);
  });

  it('bleed Dimension string resolves via parseDimension and expands PageLayout', () => {
    const t = defineTemplate(FULL_TEMPLATE);
    const bleedPts = parseDimension(t.layout.bleed as Dimension);
    expect(bleedPts).toBeCloseTo(mm(3), 4);

    const layout = new PageLayout({
      size: 'A4',
      margins: mm(20),
      bleed: bleedPts,
    });
    const [pw, ph] = layout.pageSize;
    expect(pw).toBeCloseTo(PAGE_SIZES.A4[0] + 2 * bleedPts, 4);
    expect(ph).toBeCloseTo(PAGE_SIZES.A4[1] + 2 * bleedPts, 4);
  });

  it('template style sheet feeds PageLayout → Frame pipeline', () => {
    const t = defineTemplate(FULL_TEMPLATE);
    const bleedPts = parseDimension(t.layout.bleed as Dimension);
    const margins = t.layout.margins as DimensionMargins;

    const layout = new PageLayout({
      size: t.layout.size,
      margins: {
        top: parseDimension(margins.top),
        right: parseDimension(margins.right),
        bottom: parseDimension(margins.bottom),
        left: parseDimension(margins.left),
      },
      columns: t.layout.columns ?? 1,
      bleed: bleedPts,
    });

    const frames = layout.frames(2);
    expect(frames).toHaveLength(2);

    const registry = defineStyles(t.styles);
    const body = registry.resolve('body');
    // confirm the style's lineHeight fits inside the frame
    expect(frames[0].height).toBeGreaterThan(body.lineHeight);
  });
});

describe('@paragraf/template — parseTokens integration', () => {
  it('all content slot texts in FULL_TEMPLATE parse without error', () => {
    const t = defineTemplate(FULL_TEMPLATE);
    for (const slot of t.content) {
      expect(() => parseTokens(slot.text)).not.toThrow();
    }
  });

  it('binding paths in content correspond to expected data shape', () => {
    const t = defineTemplate(FULL_TEMPLATE);
    const allBindings = t.content
      .flatMap((slot) => parseTokens(slot.text))
      .filter((tok) => tok.type === 'binding')
      .map((tok) => (tok as { path: string }).path);

    expect(allBindings).toContain('product.name');
    expect(allBindings).toContain('product.description');
    expect(allBindings).toContain('product.sku');
  });

  it('static slot produces only literal tokens', () => {
    const tokens = parseTokens('Static footer text with no binding');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe('literal');
  });
});
