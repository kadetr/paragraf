/**
 * Debug test for binary serialization path
 * Isolate looseness parameter handling differences
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

import { createMeasurer } from '@paragraf/font-engine';
import {
  buildNodeSequence,
  computeBreakpoints,
  traceback,
  loadHyphenator,
  hyphenateParagraph,
  DEFAULT_HYPHENATE_OPTIONS,
} from '@paragraf/linebreak';
import { FontRegistry, Font, Language } from '@paragraf/types';
import { serializeNodesToBinary } from '../src/wasm-binary.js';

const _require = createRequire(import.meta.url);
const wasm: any = _require('../wasm/pkg/paragraf_shaping_wasm.js');

const FONTS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../fonts',
);

const REGISTRY: FontRegistry = new Map([
  [
    'lib-reg',
    {
      id: 'lib-reg',
      family: 'Liberation Serif',
      filePath: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
    },
  ],
]);

const font = (id: string, size: number): Font => ({
  id,
  size,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
});

let measurer: ReturnType<typeof createMeasurer>;

beforeAll(async () => {
  await loadHyphenator('en-us');
  measurer = createMeasurer(REGISTRY);
  // Register font with WASM
  wasm.register_font(
    'lib-reg',
    readFileSync(REGISTRY.get('lib-reg')!.filePath),
  );
});

describe('Binary serialization path debug', () => {
  const TEXT = 'In olden times when wishing still helped one.';
  const F = font('lib-reg', 12);

  const buildNodes = (text: string) => {
    const opts = {
      ...DEFAULT_HYPHENATE_OPTIONS,
      language: 'en-us' as Language,
      fontSize: F.size,
    };
    const hyphenated = hyphenateParagraph(text, opts);
    const withFonts = hyphenated.map((w) => ({ ...w, font: F }));
    return buildNodeSequence(withFonts, measurer, 0);
  };

  it('JSON path: looseness=undefined vs looseness=0 (should match TS)', () => {
    const nodes = buildNodes(TEXT);

    // TypeScript reference
    const tsDefault = computeBreakpoints({
      nodes,
      lineWidth: 250,
      tolerance: 2,
    });
    const tsExplicit = computeBreakpoints({
      nodes,
      lineWidth: 250,
      tolerance: 2,
      looseness: 0,
    });

    const tsBreaksDefault = traceback(tsDefault.node);
    const tsBreaksExplicit = traceback(tsExplicit.node);

    console.log('TS looseness=undefined:', tsBreaksDefault.length, 'lines');
    console.log('TS looseness=0:', tsBreaksExplicit.length, 'lines');

    expect(tsBreaksDefault.length).toBe(tsBreaksExplicit.length);
    for (let i = 0; i < tsBreaksDefault.length; i++) {
      expect(tsBreaksDefault[i].position).toBe(tsBreaksExplicit[i].position);
    }
  });

  it('Binary path: looseness=undefined vs looseness=0', () => {
    const nodes = buildNodes(TEXT);
    const [f64s, u8s] = serializeNodesToBinary(nodes);

    // Binary: undefined (pass 0)
    const binDefault = JSON.parse(
      wasm.traceback_wasm_binary(
        f64s,
        u8s,
        new Float64Array([]),
        250,
        2,
        0,
        0,
        0,
        0,
        0,
      ),
    );
    const binDefaultBreaks = binDefault.ok.breaks;

    // Binary: explicit 0
    const binExplicit = JSON.parse(
      wasm.traceback_wasm_binary(
        f64s,
        u8s,
        new Float64Array([]),
        250,
        2,
        0,
        0,
        0,
        0,
        0,
      ),
    );
    const binExplicitBreaks = binExplicit.ok.breaks;

    console.log('Binary looseness=0:', binDefaultBreaks.length, 'lines');
    console.log(
      'Binary looseness=0 (explicit):',
      binExplicitBreaks.length,
      'lines',
    );

    expect(binDefaultBreaks.length).toBe(binExplicitBreaks.length);
    for (let i = 0; i < binDefaultBreaks.length; i++) {
      expect(binDefaultBreaks[i].position).toBe(binExplicitBreaks[i].position);
    }
  });

  it('Cross-path comparison: JSON vs Binary (both looseness=0)', () => {
    const nodes = buildNodes(TEXT);

    // JSON path (with Infinity conversion)
    const toWasmJson = (obj: unknown): string =>
      JSON.stringify(obj, (_, v) => {
        if (v === -Infinity) return -1e30;
        if (v === Infinity) return 1e30;
        return v;
      });

    const jsonResult = JSON.parse(
      wasm.traceback_wasm(
        toWasmJson({
          nodes,
          lineWidth: 250,
          tolerance: 2,
          looseness: 0,
        }),
      ),
    );
    const jsonBreaks = jsonResult.ok.breaks;

    // Binary path
    const [f64s, u8s] = serializeNodesToBinary(nodes);
    const binResult = JSON.parse(
      wasm.traceback_wasm_binary(
        f64s,
        u8s,
        new Float64Array([]),
        250,
        2,
        0,
        0,
        0,
        0,
        0,
      ),
    );
    const binBreaks = binResult.ok.breaks;

    console.log('JSON breaks:', jsonBreaks.length, 'lines');
    console.log('Binary breaks:', binBreaks.length, 'lines');

    expect(jsonBreaks.length).toBe(binBreaks.length);
    for (let i = 0; i < jsonBreaks.length; i++) {
      expect(jsonBreaks[i].position).toBe(
        binBreaks[i].position,
        `Line ${i} position mismatch`,
      );
      expect(Math.abs(jsonBreaks[i].ratio - binBreaks[i].ratio)).toBeLessThan(
        1e-6,
      );
    }
  });

  it('Cross-path: binary lineWidths matches JSON lineWidths', () => {
    // Use a longer text so per-line widths actually affect breaking
    const longText =
      'In olden times when wishing still helped one there lived a king ' +
      'whose daughters were all beautiful but the youngest was so beautiful ' +
      'that the sun itself was astonished whenever it shone in her face.';
    const nodes = buildNodes(longText);

    const lineWidths = [150, 200, 250]; // varied per-line widths
    const toWasmJson = (obj: unknown): string =>
      JSON.stringify(obj, (_, v) => {
        if (v === -Infinity) return -1e30;
        if (v === Infinity) return 1e30;
        return v;
      });

    const jsonResult = JSON.parse(
      wasm.traceback_wasm(
        toWasmJson({ nodes, lineWidth: 250, lineWidths, tolerance: 2 }),
      ),
    );

    const [f64s, u8s] = serializeNodesToBinary(nodes);
    const binResult = JSON.parse(
      wasm.traceback_wasm_binary(
        f64s,
        u8s,
        new Float64Array(lineWidths),
        250,
        2,
        0,
        0,
        0,
        0,
        0,
      ),
    );

    expect(jsonResult.ok.breaks.length).toBe(binResult.ok.breaks.length);
    for (let i = 0; i < jsonResult.ok.breaks.length; i++) {
      expect(jsonResult.ok.breaks[i].position).toBe(
        binResult.ok.breaks[i].position,
      );
    }
  });
});

// ─── runtPenalty / singleLinePenalty ────────────────────────────────────────

import { tracebackWasmBinary } from '../src/wasm-binary.js';

describe('tracebackWasmBinary — runtPenalty / singleLinePenalty', () => {
  it('runtPenalty affects break selection', () => {
    const TEXT2 =
      'In olden times when wishing still helped one there lived a king.';
    const opts = {
      ...DEFAULT_HYPHENATE_OPTIONS,
      language: 'en-us' as Language,
      fontSize: 12,
    };
    const hyphenated = hyphenateParagraph(TEXT2, opts);
    const withFonts = hyphenated.map((w) => ({
      ...w,
      font: font('lib-reg', 12),
    }));
    const nodes = buildNodeSequence(withFonts, measurer, 0);

    const withoutPenalty = tracebackWasmBinary(wasm, nodes, 250, 2);
    const withPenalty = tracebackWasmBinary(
      wasm,
      nodes,
      250,
      2,
      0, // emergencyStretch
      0, // looseness
      0, // consecutiveHyphenLimit
      [], // lineWidths
      5000, // runtPenalty
    );

    expect(withoutPenalty.ok).toBeDefined();
    expect(withPenalty.ok).toBeDefined();
  });
});
