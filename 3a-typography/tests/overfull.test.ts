// overfull.test.ts
//
// compose() on paragraphs that cannot be set within tolerance, with real
// fonts and both engines. The default returns lines and reports what
// happened; `onInfeasible: 'throw'` keeps the behaviour before v0.7.

import { describe, it, expect, beforeAll } from "vitest";
import * as path from "path";
import {
  createParagraphComposer,
  ParagraphComposer,
} from "@paragraf/typography";
import { FontRegistry, Font } from "@paragraf/types";

const FONTS_DIR = path.resolve(__dirname, "../../fonts");
const FONT: Font = {
  id: "liberation-regular",
  size: 12,
  weight: 400,
  style: "normal",
  stretch: "normal",
};
const REGISTRY: FontRegistry = new Map([
  [
    "liberation-regular",
    {
      id: "liberation-regular",
      family: "Liberation Serif",
      filePath: path.join(FONTS_DIR, "LiberationSerif-Regular.ttf"),
    },
  ],
]);

const URL =
  "https://example.com/a/very/long/path/that/cannot/be/hyphenated/anywhere/index.html";
const URL_TEXT = `The report is published at ${URL} and is updated every week.`;

const GERMAN =
  "Die Donaudampfschifffahrtsgesellschaft und das " +
  "Rindfleischetikettierungsüberwachungsgesetz sowie die " +
  "Rechtsschutzversicherungsgesellschaften stehen im " +
  "Bundesausbildungsförderungsgesetz nebeneinander.";

// German text with four pieces that stay unbreakable under default settings:
// a word that contains a digit is never hyphenated, in any language. The
// other words are too short to be hyphenated, so the lines can be joined
// back into the text without removing hyphens.
const GERMAN_UNBREAKABLE =
  "Die Zahl RE2024000000118734 und das Los " +
  "AZ77123456789012345 und die IBAN " +
  "DE89370400440532013000 sind im Buch " +
  "ISBN9783161484100X da.";

for (const useWasm of [true, false]) {
  describe(`overfull fallback in compose() — ${useWasm ? "WASM" : "TypeScript"} engine`, () => {
    let composer: ParagraphComposer;

    beforeAll(async () => {
      composer = await createParagraphComposer(REGISTRY, { useWasm });
      await composer.ensureLanguage("de");
    });

    // ── A URL wider than the measure ─────────────────────────────────────

    it("a URL wider than the measure throws under onInfeasible: 'throw'", () => {
      expect(() =>
        composer.compose({
          text: URL_TEXT,
          font: FONT,
          lineWidth: 200,
          tolerance: 2,
          hyphenation: false,
          onInfeasible: "throw",
        }),
      ).toThrow(/could not be set within tolerance/);
    });

    it("by default the URL gets a line of its own, marked overfull", () => {
      const out = composer.compose({
        text: URL_TEXT,
        font: FONT,
        lineWidth: 200,
        tolerance: 2,
        hyphenation: false,
      });
      expect(out.usedFallback).toBe(true);

      const overfull = out.lines.filter((l) => l.overfull);
      expect(overfull.length).toBe(1);
      expect(overfull[0].words).toEqual([URL]);

      // The overflow is the URL's width minus the measure.
      const urlWidth = composer.measurer!.measure(URL, FONT);
      expect(urlWidth).toBeGreaterThan(200);
      expect(overfull[0].overflow!).toBeCloseTo(urlWidth - 200, 3);

      // No word is lost and none is duplicated.
      expect(out.lines.flatMap((l) => l.words).join(" ")).toBe(URL_TEXT);

      // Lines that are not overfull carry neither field.
      for (const l of out.lines.filter((x) => !x.overfull)) {
        expect(l.overflow).toBeUndefined();
      }
    });

    // ── Long German compounds in a narrow column ─────────────────────────

    it("long German compounds in a narrow column: infeasible in strict mode", () => {
      expect(() =>
        composer.compose({
          text: GERMAN,
          font: FONT,
          lineWidth: 90,
          tolerance: 1,
          language: "de",
          onInfeasible: "throw",
        }),
      ).toThrow(/could not be set within tolerance/);
    });

    it("by default it is set; each compound that cannot fit is reported", () => {
      // Since v0.7.1 German capitalised words are hyphenated, so long nouns
      // no longer stick out. A word that contains a digit is never
      // hyphenated: the four reference numbers have no break points and are
      // each wider than 90 pt.
      const out = composer.compose({
        text: GERMAN_UNBREAKABLE,
        font: FONT,
        lineWidth: 90,
        tolerance: 1,
        language: "de",
      });
      expect(out.usedFallback).toBe(true);
      expect(out.lines.flatMap((l) => l.words).join(" ")).toBe(
        GERMAN_UNBREAKABLE,
      );

      const overfull = out.lines.filter((l) => l.overfull);
      expect(overfull.map((l) => l.words)).toEqual([
        ["RE2024000000118734"],
        ["AZ77123456789012345"],
        ["DE89370400440532013000"],
        ["ISBN9783161484100X"],
      ]);
      for (const l of overfull) {
        const width = composer.measurer!.measure(l.words[0], FONT);
        expect(l.overflow!).toBeCloseTo(width - 90, 3);
      }
      for (const l of out.lines) {
        expect(Number.isFinite(l.ratio)).toBe(true);
        expect(Number.isFinite(l.wordSpacing)).toBe(true);
        expect(l.wordSpacing).toBeGreaterThanOrEqual(0);
      }
    });

    // ── Emergency stretch is still tried first ───────────────────────────

    it("emergencyStretch is used before the fallback", () => {
      const input = {
        text: "the report is published on our website and it is updated every single week by the team that wrote it",
        font: FONT,
        lineWidth: 110,
        tolerance: 0.5,
        hyphenation: false,
      };
      expect(() =>
        composer.compose({ ...input, onInfeasible: "throw" }),
      ).toThrow(/could not be set within tolerance/);

      // Without emergency stretch: fallback.
      expect(composer.compose(input).usedFallback).toBe(true);

      // With enough emergency stretch: rescued within tolerance, no fallback.
      const rescued = composer.compose({ ...input, emergencyStretch: 60 });
      expect(rescued.usedEmergency).toBe(true);
      expect(rescued.usedFallback).toBe(false);
      expect(rescued.lines.some((l) => l.overfull)).toBe(false);
    });

    // ── Feasible paragraphs are not affected by the option ───────────────

    it("a feasible paragraph is identical under both settings", () => {
      const input = {
        text: URL_TEXT.replace(URL, "our website"),
        font: FONT,
        lineWidth: 200,
        tolerance: 2,
      };
      const a = composer.compose({ ...input, onInfeasible: "throw" });
      const b = composer.compose(input);
      expect(b.lines).toEqual(a.lines);
      expect(b.usedFallback).toBe(false);
      expect(a.usedFallback).toBe(false);
    });
  });
}
