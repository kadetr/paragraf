// shaping-mode.test.ts
//
// `shaping` on createParagraphComposer / createDefaultFontEngine, with the
// WASM shaper built (the normal state of this repo and of CI).
// The case where the binary is missing is in shaping-mode-absent.test.ts.

import { describe, it, expect, vi, afterEach } from "vitest";
import * as path from "path";
import {
  createParagraphComposer,
  createDefaultFontEngine,
  wasmStatus,
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
const TEXT =
  "Shaping mode selects the engine that measures and breaks this paragraph, and both engines must set it.";

afterEach(() => vi.restoreAllMocks());

// CI builds the binary, so there a missing shaper is a failure. Locally it
// skips this file with a visible reason (same rule as the golden tests).
const loaded = wasmStatus().status === "loaded";

describe.skipIf(loaded || !process.env.CI)("shaping mode — CI guard", () => {
  it("requires the WASM shaper to be built in CI", () => {
    throw new Error(`WASM shaper not loaded (${wasmStatus().status}).`);
  });
});

describe.skipIf(!loaded)("shaping mode — WASM built", () => {
  for (const shaping of ["auto", "wasm", "fontkit"] as const) {
    it(`'${shaping}' composes without a warning`, async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const composer = await createParagraphComposer(REGISTRY, { shaping });
      const out = composer.compose({ text: TEXT, font: FONT, lineWidth: 200 });
      expect(out.lines.length).toBeGreaterThan(1);
      expect(warn).not.toHaveBeenCalled();
    });

    it(`'${shaping}' gives a font engine`, async () => {
      const engine = await createDefaultFontEngine(REGISTRY, { shaping });
      expect(engine).toBeTruthy();
    });
  }

  it("'fontkit' and 'wasm' select different font engines", async () => {
    const a = await createDefaultFontEngine(REGISTRY, { shaping: "fontkit" });
    const b = await createDefaultFontEngine(REGISTRY, { shaping: "wasm" });
    expect(a.constructor.name).not.toBe(b.constructor.name);
  });

  it("'fontkit' is the same engine as the older useWasm: false", async () => {
    const a = await createDefaultFontEngine(REGISTRY, { shaping: "fontkit" });
    const b = await createDefaultFontEngine(REGISTRY, { useWasm: false });
    expect(a.constructor.name).toBe(b.constructor.name);
  });

  it("shaping wins over useWasm when both are given", async () => {
    const a = await createDefaultFontEngine(REGISTRY, {
      shaping: "fontkit",
      useWasm: true,
    });
    const b = await createDefaultFontEngine(REGISTRY, { shaping: "fontkit" });
    expect(a.constructor.name).toBe(b.constructor.name);
  });

  it("rejects an unknown mode", async () => {
    await expect(
      createParagraphComposer(REGISTRY, { shaping: "ts" as any }),
    ).rejects.toThrow(/shaping must be 'auto', 'wasm' or 'fontkit'/);
    await expect(
      createDefaultFontEngine(REGISTRY, { shaping: "ts" as any }),
    ).rejects.toThrow(/shaping must be/);
  });
});
