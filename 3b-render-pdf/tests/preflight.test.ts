// tests/preflight.test.ts
//
// PDF preflight test harness. (#39)
//
// Verifies structural invariants of the PDF output: header, trailer, OutputIntents
// subtype correctness (GTS_PDFA1 for RGB/Lab/Gray, GTS_PDFX for CMYK), and
// documents current limitations (TrimBox/BleedBox, font embedding) for future work.

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToPdf } from '@paragraf/render-pdf';
import type { OutputIntent } from '@paragraf/render-pdf';
import { loadBuiltinSrgb } from '@paragraf/color';
import type { ColorProfile } from '@paragraf/color';
import type { FontEngine } from '@paragraf/font-engine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockFontEngine(): FontEngine {
  return {
    loadFont: vi.fn().mockResolvedValue(undefined),
    glyphsForString: vi.fn().mockReturnValue([{ index: 1, advanceWidth: 600 }]),
    glyphForCodePoint: vi.fn().mockReturnValue(null),
    applyLigatures: vi
      .fn()
      .mockImplementation((_id: string, g: unknown[]) => g),
    applySingleSubstitution: vi
      .fn()
      .mockImplementation((_id: string, g: unknown[]) => g),
    getKerning: vi.fn().mockReturnValue(0),
    getGlyphPath: vi.fn().mockReturnValue({ commands: [], toSVG: () => '' }),
    getFontMetrics: vi.fn().mockReturnValue({
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      xHeight: 500,
      capHeight: 700,
      lineGap: 0,
      baselineShift: 0,
    }),
  } as unknown as FontEngine;
}

// Build a minimal ColorProfile stub with a given colorSpace for testing the
// GTS_PDFA1 vs GTS_PDFX subtype selection without needing a real ICC file.
function makeStubProfile(
  colorSpace: 'RGB' | 'CMYK' | 'Gray' | 'Lab',
): ColorProfile {
  return {
    name: `stub-${colorSpace}`,
    colorSpace,
    pcs: 'XYZ',
    renderingIntent: 0,
    whitePoint: { X: 0.9505, Y: 1.0, Z: 1.089 },
    bytes: new Uint8Array(0),
  } as unknown as ColorProfile;
}

const containsStr = (buf: Buffer, str: string): boolean =>
  buf.toString('latin1').includes(str);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let srgbIntent: OutputIntent;

beforeAll(() => {
  const profile = loadBuiltinSrgb();
  srgbIntent = { profile, condition: 'sRGB' };
});

// ─── 1. PDF structural validity ───────────────────────────────────────────────

describe('PDF preflight — structural validity', () => {
  it('output starts with %PDF- header', async () => {
    const buf = await renderToPdf([], makeMockFontEngine());
    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-');
  });

  it('output ends with %%EOF marker', async () => {
    const buf = await renderToPdf([], makeMockFontEngine());
    const tail = buf.toString('latin1', Math.max(0, buf.length - 64));
    expect(tail).toContain('%%EOF');
  });

  it('output is a non-empty Buffer', async () => {
    const buf = await renderToPdf([], makeMockFontEngine());
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });
});

// ─── 2. OutputIntents presence / absence ─────────────────────────────────────

describe('PDF preflight — OutputIntents', () => {
  it('no /OutputIntents when outputIntent is not provided', async () => {
    const buf = await renderToPdf([], makeMockFontEngine());
    expect(containsStr(buf, '/OutputIntents')).toBe(false);
  });

  it('/OutputIntents present when outputIntent is provided', async () => {
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: srgbIntent,
    });
    expect(containsStr(buf, '/OutputIntents')).toBe(true);
  });
});

// ─── 3. OutputIntent GTS subtype correctness ─────────────────────────────────
//
// CMYK destination profile → PDF/X → GTS_PDFX
// RGB/Lab/Gray destination profile → PDF/A → GTS_PDFA1
//
// This is the regression test for issue #3 (GTS_PDFA1 was hardcoded).

describe('PDF preflight — GTS subtype selection', () => {
  it('RGB profile emits GTS_PDFA1', async () => {
    const intent: OutputIntent = {
      profile: makeStubProfile('RGB'),
      condition: 'sRGB',
    };
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: intent,
    });
    expect(containsStr(buf, 'GTS_PDFA1')).toBe(true);
    expect(containsStr(buf, 'GTS_PDFX')).toBe(false);
  });

  it('Gray profile emits GTS_PDFA1', async () => {
    const intent: OutputIntent = {
      profile: makeStubProfile('Gray'),
      condition: 'Dot Gain 20%',
    };
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: intent,
    });
    expect(containsStr(buf, 'GTS_PDFA1')).toBe(true);
    expect(containsStr(buf, 'GTS_PDFX')).toBe(false);
  });

  it('Lab profile emits GTS_PDFA1', async () => {
    const intent: OutputIntent = {
      profile: makeStubProfile('Lab'),
      condition: 'Lab D50',
    };
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: intent,
    });
    expect(containsStr(buf, 'GTS_PDFA1')).toBe(true);
    expect(containsStr(buf, 'GTS_PDFX')).toBe(false);
  });

  it('CMYK profile emits GTS_PDFX', async () => {
    const intent: OutputIntent = {
      profile: makeStubProfile('CMYK'),
      condition: 'FOGRA39',
    };
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: intent,
    });
    expect(containsStr(buf, 'GTS_PDFX')).toBe(true);
    expect(containsStr(buf, 'GTS_PDFA1')).toBe(false);
  });

  it('built-in sRGB profile (RGB colorSpace) emits GTS_PDFA1', async () => {
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: srgbIntent,
    });
    expect(containsStr(buf, 'GTS_PDFA1')).toBe(true);
  });
});

// ─── 4. Known limitations (current behavior, not conformance failures) ────────
//
// These tests document what the current renderer does NOT emit. Update them
// when the corresponding feature is implemented.

describe('PDF preflight — known limitations', () => {
  it('does not emit /TrimBox (not yet implemented — planned for PDF/X support)', async () => {
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: { profile: makeStubProfile('CMYK'), condition: 'FOGRA39' },
    });
    // TrimBox is required for PDF/X conformance but not yet emitted.
    expect(containsStr(buf, '/TrimBox')).toBe(false);
  });

  it('does not emit /BleedBox (not yet implemented — planned for PDF/X support)', async () => {
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: { profile: makeStubProfile('CMYK'), condition: 'FOGRA39' },
    });
    expect(containsStr(buf, '/BleedBox')).toBe(false);
  });

  it('glyphs are rendered as vector paths — no embedded font streams in output', async () => {
    // paragraf renders glyphs as PDF path commands, not as text with embedded fonts.
    // This means the PDF is not text-searchable but avoids font licensing issues.
    // A /FontDescriptor with /FontFile2 or /FontFile3 would indicate embedded fonts.
    const buf = await renderToPdf([], makeMockFontEngine());
    expect(containsStr(buf, '/FontFile2')).toBe(false);
    expect(containsStr(buf, '/FontFile3')).toBe(false);
  });
});
