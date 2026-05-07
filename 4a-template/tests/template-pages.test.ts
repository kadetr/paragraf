import { describe, it, expect } from 'vitest';
import { defineTemplate } from '../src/index.js';
import type {
  Template,
  TemplatePageSpec,
  TemplateRegionSpec,
} from '../src/index.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MINIMAL: Template = {
  layout: { size: 'A4', margins: '20mm' },
  fonts: { Serif: { regular: './fonts/Serif-Regular.ttf' } },
  styles: { body: { font: { family: 'Serif', size: 10 } } },
  content: [{ style: 'body', text: 'Hello world' }],
};

// ─── TemplatePageSpec / TemplateRegionSpec types ──────────────────────────────

describe('TemplatePageSpec — range types', () => {
  // RT9: TemplatePageSpec accepts range as number
  it('RT9: range as a number (exact page)', () => {
    const spec: TemplatePageSpec = {
      range: 1,
      regions: [{ height: '80mm' }],
    };
    expect(spec.range).toBe(1);
    expect(spec.regions).toHaveLength(1);
  });

  // RT10: TemplatePageSpec accepts range as string ('2+', 'default', '2-5')
  it('RT10: range as string — "2+", "2-5", "default"', () => {
    const fromN: TemplatePageSpec = { range: '2+', regions: [{ height: 100 }] };
    const rangeNM: TemplatePageSpec = {
      range: '2-5',
      regions: [{ height: '50mm' }],
    };
    const fallback: TemplatePageSpec = {
      range: 'default',
      regions: [{ height: '100mm', columns: 2, gutter: '5mm' }],
    };

    expect(fromN.range).toBe('2+');
    expect(rangeNM.range).toBe('2-5');
    expect(fallback.range).toBe('default');
    // TemplateRegionSpec optional fields
    const r = fallback.regions[0] as TemplateRegionSpec;
    expect(r.columns).toBe(2);
    expect(r.gutter).toBe('5mm');
  });
});

// ─── TemplateLayout.pages integration ────────────────────────────────────────

describe('TemplateLayout.pages in defineTemplate', () => {
  // RT11: defineTemplate accepts TemplateLayout.pages without error
  it('RT11: defineTemplate accepts pages in TemplateLayout', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        layout: {
          size: 'A4',
          margins: '20mm',
          pages: [
            { range: 1, regions: [{ height: '60mm' }] },
            {
              range: '2+',
              regions: [{ height: '40mm', columns: 2, gutter: '10mm' }],
            },
          ],
        },
      }),
    ).not.toThrow();
  });

  // RT12: TemplateLayout with only size/margins/bleed (no pages) still valid
  it('RT12: TemplateLayout without pages field is still valid', () => {
    expect(() =>
      defineTemplate({
        ...MINIMAL,
        layout: { size: 'A4', margins: '20mm', bleed: '3mm' },
      }),
    ).not.toThrow();
  });
});
