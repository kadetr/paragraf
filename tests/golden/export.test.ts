// tests/golden/export.test.ts
// Export baseline: renders every case in EXPORT_CASES (cases.ts) to PDF and
// SVG and compares a summary of each file with the snapshot in
// tests/golden/snapshots/pdf/<id>.json and snapshots/svg/<id>.json.
//
//   npm run test:e2e        — compare against snapshots (fails on any diff)
//   npm run golden:update   — rewrite snapshots from current behaviour
//   npm run golden:preview  — also write the PDF and SVG files to
//                             tests/golden/outputs/export/ for people to open
//
// The PDF summary (export/pdf-summary.ts) holds the colour operators with
// their values, the text-showing operators with position, font and text,
// the fonts, the page boxes, the OutputIntents and the Info dictionary. Raw
// bytes are not compared; the files are made deterministic anyway (fixed
// date and /ID, see export/render.ts) and the test checks that two renders
// are byte-identical, so a byte diff is always a real change.

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { EXPORT_CASES, CASES } from './cases.js';
import { createKits, renderExportCase } from './export/render.js';
import { summarisePdf } from './export/pdf-summary.js';
import { summariseSvg } from './export/svg-summary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = path.join(__dirname, 'snapshots');
const PREVIEW_DIR = path.join(__dirname, 'outputs', 'export');
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const PREVIEW = process.env.GOLDEN_PREVIEW === '1';

if (UPDATE && process.env.CI) {
  throw new Error('UPDATE_GOLDEN must not be set in CI.');
}

// One member of a flat object: "key": string | number | boolean | null.
const MEMBER = String.raw`\s+"[^"]+": (?:"(?:[^"\\]|\\.)*"|-?[\d.e+-]+|true|false|null)`;
const FLAT_OBJECT = new RegExp(
  String.raw`\{\n(?:${MEMBER},\n)*${MEMBER}\n\s+\}`,
  'g',
);

/**
 * Pretty JSON with short number arrays and flat objects (a text run, a font)
 * on one line, so that a diff shows one changed line per changed item.
 */
const toJson = (v: unknown): string =>
  JSON.stringify(v, null, 2)
    .replace(
      /\[\n\s+(-?[\d.]+(?:,\n\s+-?[\d.]+)*)\n\s+\]/g,
      (_m, body: string) => `[${body.replace(/,\n\s+/g, ', ')}]`,
    )
    .replace(FLAT_OBJECT, (m) =>
      m
        .replace(/\{\n\s+/, '{ ')
        .replace(/,\n\s+/g, ', ')
        .replace(/\n\s+\}$/, ' }'),
    ) + '\n';

const check = (file: string, actual: string): void => {
  if (UPDATE) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, actual);
    return;
  }
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing export snapshot ${path.relative(process.cwd(), file)}. ` +
        'Run `npm run golden:update` and review the new file.',
    );
  }
  expect(actual).toBe(fs.readFileSync(file, 'utf8'));
};

// Rendering a page of glyph paths takes a few hundred ms per case; other
// work on the machine can push that past vitest's 5 s default.
const TIMEOUT = 30_000;

describe('export baseline — PDF and SVG', () => {
  let kits: Awaited<ReturnType<typeof createKits>>;
  beforeAll(async () => {
    kits = await createKits();
  }, TIMEOUT);

  for (const e of EXPORT_CASES) {
    it(
      `${e.id}`,
      async () => {
        const { pdf, svg } = await renderExportCase(e, kits);
        if (PREVIEW) {
          fs.mkdirSync(PREVIEW_DIR, { recursive: true });
          fs.writeFileSync(path.join(PREVIEW_DIR, `${e.id}.pdf`), pdf);
          fs.writeFileSync(path.join(PREVIEW_DIR, `${e.id}.svg`), svg);
        }
        check(
          path.join(SNAPSHOT_DIR, 'pdf', `${e.id}.json`),
          toJson({ id: e.id, from: e.from, ...summarisePdf(pdf) }),
        );
        check(
          path.join(SNAPSHOT_DIR, 'svg', `${e.id}.json`),
          toJson({ id: e.id, from: e.from, ...summariseSvg(svg) }),
        );
      },
      TIMEOUT,
    );
  }

  it(
    'renders byte-identical PDFs on every run (compressed and not)',
    async () => {
      const e = EXPORT_CASES.find((x) => x.cmyk) ?? EXPORT_CASES[0];
      for (const compress of [false, true]) {
        const a = await renderExportCase(e, kits, { compress });
        // Let the clock move on, so a date that is not fixed would differ.
        await new Promise((r) => setTimeout(r, 1100));
        const b = await renderExportCase(e, kits, { compress });
        expect(a.pdf.equals(b.pdf)).toBe(true);
        expect(a.svg).toBe(b.svg);
      }
    },
    TIMEOUT,
  );

  it(
    'summarises a compressed PDF the same as an uncompressed one',
    async () => {
      const e = EXPORT_CASES[0];
      const plain = await renderExportCase(e, kits, { compress: false });
      const packed = await renderExportCase(e, kits, { compress: true });
      expect(packed.pdf.length).toBeLessThan(plain.pdf.length);
      expect(summarisePdf(packed.pdf)).toEqual(summarisePdf(plain.pdf));
    },
    TIMEOUT,
  );

  for (const kind of ['pdf', 'svg']) {
    it(`has exactly one ${kind} snapshot per export case`, () => {
      const dir = path.join(SNAPSHOT_DIR, kind);
      const expected = EXPORT_CASES.map((e) => `${e.id}.json`).sort();
      if (UPDATE) {
        for (const f of fs.readdirSync(dir)) {
          if (!expected.includes(f)) fs.unlinkSync(path.join(dir, f));
        }
      }
      expect(fs.readdirSync(dir).sort()).toEqual(expected);
    });
  }

  it('export cases refer to existing cases and have unique ids', () => {
    const ids = new Set(CASES.map((c) => c.id));
    for (const e of EXPORT_CASES)
      for (const f of e.from) expect(ids, `${e.id} → ${f}`).toContain(f);
    const own = EXPORT_CASES.map((e) => e.id);
    expect(new Set(own).size).toBe(own.length);
  });
});
