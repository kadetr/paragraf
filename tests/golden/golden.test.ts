// tests/golden/golden.test.ts
// Golden-output baseline: composes every case in cases.ts with both the
// WASM engine and the TypeScript fallback, lays the lines out on a page, and
// compares the result with the snapshot in tests/golden/snapshots/<engine>/.
//
//   npm run test:e2e        — compare against snapshots (fails on any diff)
//   npm run golden:update   — rewrite snapshots from current behaviour
//   npm run golden:preview  — also write an SVG per case for visual review
//
// A snapshot records, per line: the words, the adjustment ratio, the word
// spacing, and the x/y position of every text segment. The SVG previews go to
// tests/golden/outputs/ (git-ignored); they are for people to look at and are
// never compared, because glyph outlines make them about 1 MB each.
//
// The two engines measure text differently (rustybuzz vs fontkit), so each
// has its own snapshot set. A change that is meant to alter line breaking
// must update both, and the diff is what gets reviewed.

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  createParagraphComposer,
  createDefaultFontEngine,
  wasmStatus,
  type ParagraphComposer,
} from '@paragraf/typography';
import { createMeasurer, type FontEngine } from '@paragraf/font-engine';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import type { FontRegistry, Measurer } from '@paragraf/types';
import {
  serifRegistry,
  hebrewRegistry,
  arabicRegistry,
} from '../manual/fixtures/fonts.js';
import {
  MARGIN_X,
  MARGIN_TOP,
  PAGE_W,
  PAGE_H,
} from '../manual/fixtures/documents.js';
import { CASES, type GoldenCase, type RegistryName } from './cases.js';
import { serializeLine, toJson, type GoldenSnapshot } from './serialize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = path.join(__dirname, 'snapshots');
const PREVIEW_DIR = path.join(__dirname, 'outputs');
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const PREVIEW = process.env.GOLDEN_PREVIEW === '1';

type Engine = 'wasm' | 'ts';

const REGISTRIES: Record<RegistryName, () => FontRegistry> = {
  serif: serifRegistry,
  hebrew: hebrewRegistry,
  arabic: arabicRegistry,
};

interface Toolkit {
  composer: ParagraphComposer;
  measurer: Measurer;
  fontEngine: FontEngine;
}

/** Compare `actual` with the stored snapshot, or rewrite it in update mode. */
const check = (file: string, actual: string): void => {
  if (UPDATE) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, actual);
    return;
  }
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing golden snapshot ${path.relative(process.cwd(), file)}. ` +
        'Run `npm run golden:update` and review the new file.',
    );
  }
  expect(actual).toBe(fs.readFileSync(file, 'utf8'));
};

const runEngine = (engine: Engine): void => {
  const kits = new Map<RegistryName, Toolkit>();

  beforeAll(async () => {
    for (const name of Object.keys(REGISTRIES) as RegistryName[]) {
      const registry = REGISTRIES[name]();
      kits.set(name, {
        composer: await createParagraphComposer(registry, {
          useWasm: engine === 'wasm',
        }),
        measurer: createMeasurer(registry),
        fontEngine: await createDefaultFontEngine(registry),
      });
    }
  });

  const run = (c: GoldenCase): GoldenSnapshot => {
    const kit = kits.get(c.registry)!;
    const base = { id: c.id, mirrors: c.mirrors, engine };

    let out;
    try {
      out = kit.composer.compose(c.input);
    } catch (e) {
      // An infeasible paragraph is part of current behaviour; record it so a
      // later change (for example an overfull fallback) shows up as a diff.
      return {
        ...base,
        error: e instanceof Error ? e.message : String(e),
        lineCount: 0,
        usedEmergency: false,
        lines: [],
      };
    }

    const rendered = layoutParagraph(out.lines, kit.measurer, {
      x: MARGIN_X,
      y: MARGIN_TOP,
    });

    if (PREVIEW) {
      const svg = renderToSvg(rendered, kit.fontEngine, {
        width: PAGE_W,
        height: PAGE_H,
      });
      const file = path.join(PREVIEW_DIR, engine, `${c.id}.svg`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, svg);
    }

    return {
      ...base,
      lineCount: out.lineCount,
      usedEmergency: out.usedEmergency,
      lines: out.lines.map((line, i) => serializeLine(line, rendered[i])),
    };
  };

  for (const c of CASES) {
    it(`${c.id} (${c.mirrors})`, () => {
      check(path.join(SNAPSHOT_DIR, engine, `${c.id}.json`), toJson(run(c)));
    });
  }
};

describe('golden output — TypeScript engine', () => runEngine('ts'));

// The WASM shaper is a build artefact that is not committed. In CI it must be
// present; locally a missing build skips this half with a visible reason
// instead of silently passing on the TypeScript path.
const wasmLoaded = wasmStatus().status === 'loaded';
if (!wasmLoaded && process.env.CI) {
  describe('golden output — WASM engine', () => {
    it('requires the WASM shaper to be built', () => {
      throw new Error(
        `WASM shaper not loaded (${wasmStatus().status}). ` +
          'Build it with wasm-pack before running the golden tests.',
      );
    });
  });
} else {
  describe.skipIf(!wasmLoaded)('golden output — WASM engine', () =>
    runEngine('wasm'),
  );
}
