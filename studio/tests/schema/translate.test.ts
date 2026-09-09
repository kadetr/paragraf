import { describe, it, expect } from 'vitest';
import { translateToTemplate } from '../../src/schema/translate.js';
import type { StudioTemplate } from '../../src/schema/types.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const baseLayout = { size: 'A4' as const, margins: 72 };
const baseFonts = { Serif: { regular: './Serif-Regular.ttf' } };
const baseStyles = {
  body: { font: { family: 'Serif' }, fontSize: 12 },
};

function makeTemplate(overrides: Partial<StudioTemplate> = {}): StudioTemplate {
  return {
    layout: baseLayout,
    fonts: baseFonts,
    styles: baseStyles,
    frames: { main: { height: 'auto' } },
    pages: { default: { frames: ['main'] } },
    ...overrides,
  } as StudioTemplate;
}

// ─── RT11 ────────────────────────────────────────────────────────────────────

describe('RT11 — pages["first"] → TemplatePageSpec { range: 1 }', () => {
  it('maps page key "first" to range: 1', () => {
    const t = makeTemplate({
      frames: { main: { height: 'auto' } },
      pages: { first: { frames: ['main'] } },
    });
    const { template } = translateToTemplate(t);
    const firstPage = template.layout.pages?.find((p) => p.range === 1);
    expect(firstPage).toBeDefined();
    expect(firstPage!.range).toBe(1);
  });
});

// ─── RT12 ────────────────────────────────────────────────────────────────────

describe('RT12 — pages["default"] → TemplatePageSpec { range: "default" }', () => {
  it('maps page key "default" to range: "default"', () => {
    const t = makeTemplate();
    const { template } = translateToTemplate(t);
    const defaultPage = template.layout.pages?.find(
      (p) => p.range === 'default',
    );
    expect(defaultPage).toBeDefined();
    expect(defaultPage!.range).toBe('default');
  });
});

// ─── RT13 ────────────────────────────────────────────────────────────────────

describe('RT13 — non-"first"/"default" page key → range: key string', () => {
  it('maps page key "2+" to range: "2+"', () => {
    const t = makeTemplate({
      frames: { main: { height: 'auto' } },
      pages: { '2+': { frames: ['main'] } },
    });
    const { template } = translateToTemplate(t);
    const page = template.layout.pages?.find((p) => p.range === '2+');
    expect(page).toBeDefined();
    expect(page!.range).toBe('2+');
  });
});

// ─── RT14 ────────────────────────────────────────────────────────────────────

describe('RT14 — fixed height: "12mm" → TemplateRegionSpec.height = "12mm"', () => {
  it('passes fixed Dimension height through unchanged', () => {
    const t = makeTemplate({
      frames: { header: { height: '12mm' } },
      pages: { default: { frames: ['header'] } },
    });
    const { template } = translateToTemplate(t);
    const defaultPage = template.layout.pages?.find(
      (p) => p.range === 'default',
    );
    expect(defaultPage).toBeDefined();
    const region = defaultPage!.regions[0];
    expect(region).toBeDefined();
    expect(region.height).toBe('12mm');
  });
});

// ─── RT15 ────────────────────────────────────────────────────────────────────
// A4 = 841.89 pt tall; 72 pt margins top + bottom (each);
// "36mm" = 36 × (72/25.4) ≈ 102.05 pt (fixed frame)
// auto = 841.89 − 72 − 72 − 102.05 ≈ 595.84 pt (±0.5 pt)

describe('RT15 — auto height on A4 page with 72pt margins and one 36mm fixed frame', () => {
  it('computes auto height ≈ 595.84 pt (±0.5 pt)', () => {
    const t = makeTemplate({
      layout: { size: 'A4', margins: 72 },
      frames: {
        fixed: { height: '36mm' },
        main: { height: 'auto' },
      },
      pages: { default: { frames: ['fixed', 'main'] } },
    });
    const { template, errors } = translateToTemplate(t);
    expect(errors).toHaveLength(0);

    const defaultPage = template.layout.pages?.find(
      (p) => p.range === 'default',
    );
    const autoRegion = defaultPage?.regions[1]; // second region (main)
    expect(autoRegion).toBeDefined();

    const resolvedHeight = autoRegion!.height as number;
    expect(typeof resolvedHeight).toBe('number');
    expect(resolvedHeight).toBeCloseTo(595.84, 0); // ±0.5 pt
  });
});

// ─── RT16 ────────────────────────────────────────────────────────────────────

describe('RT16 — computed auto height ≤ 0 → ValidationError', () => {
  it('returns a ValidationError when auto height computes to ≤ 0', () => {
    // A4 = 841.89 pt; margins 72 pt each side; fixed frames total > available
    const t = makeTemplate({
      layout: { size: 'A4', margins: 72 },
      frames: {
        huge: { height: 800 }, // 800 pt fixed > 841.89 - 144 = 697.89 pt available
        main: { height: 'auto' },
      },
      pages: { default: { frames: ['huge', 'main'] } },
    });
    const { errors } = translateToTemplate(t);
    expect(errors.length).toBeGreaterThan(0);
    const err = errors.find((e) => e.field === 'pages.default');
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/auto height/i);
  });
});

// ─── RT17 ────────────────────────────────────────────────────────────────────

describe('RT17 — image frame excluded from Template content, present in imageFrames[]', () => {
  it('records image frames in imageFrames and excludes from regions', () => {
    const t = makeTemplate({
      frames: {
        photo: { type: 'image', height: '200pt' },
        main: { height: 'auto' },
      },
      pages: { default: { frames: ['photo', 'main'] } },
    });
    const { template, imageFrames } = translateToTemplate(t);

    // imageFrames should contain the photo frame
    expect(imageFrames).toHaveLength(1);
    expect(imageFrames[0].name).toBe('photo');
    expect(imageFrames[0].pageKey).toBe('default');
    expect(imageFrames[0].frameIndex).toBe(0); // index 0 in page.frames[]

    // regions should only contain the text frame (main)
    const defaultPage = template.layout.pages?.find(
      (p) => p.range === 'default',
    );
    expect(defaultPage?.regions).toHaveLength(1);
  });
});

// ─── RT18 ────────────────────────────────────────────────────────────────────

describe('RT18 — compile.shaping: "wasm" → CompileOptions.shaping = "wasm"', () => {
  it('maps shaping setting to compileOptions', () => {
    const t = makeTemplate({ compile: { shaping: 'wasm' } });
    const { compileOptions } = translateToTemplate(t);
    expect(compileOptions.shaping).toBe('wasm');
  });
});

// ─── RT19 ────────────────────────────────────────────────────────────────────

describe('RT19 — compile.selectable: true → CompileOptions.selectable = true', () => {
  it('maps selectable setting to compileOptions', () => {
    const t = makeTemplate({ compile: { selectable: true } });
    const { compileOptions } = translateToTemplate(t);
    expect(compileOptions.selectable).toBe(true);
  });
});

// ─── RT20 ────────────────────────────────────────────────────────────────────

describe('RT20 — compile.opticalMargins: true → studioSettings (not CompileOptions)', () => {
  it('routes opticalMargins to studioSettings, not compileOptions', () => {
    const t = makeTemplate({ compile: { opticalMargins: true } });
    const { compileOptions, studioSettings } = translateToTemplate(t);
    expect(studioSettings.opticalMargins).toBe(true);
    // @ts-expect-error opticalMargins is not on CompileOptions
    expect(compileOptions.opticalMargins).toBeUndefined();
  });
});

// ─── RT21 ────────────────────────────────────────────────────────────────────

describe('RT21 — styles section passes through to Template.styles unchanged', () => {
  it('preserves the styles object on the output template', () => {
    const styles = {
      heading: { font: { family: 'Sans' }, fontSize: 24 },
      body: { font: { family: 'Serif' }, fontSize: 12 },
    };
    const t = makeTemplate({ styles });
    const { template } = translateToTemplate(t);
    expect(template.styles).toEqual(styles);
  });
});
