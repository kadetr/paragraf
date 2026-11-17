# @paragraf/color

ICC v2/v4 color management for the paragraf typography library.

Pure TypeScript. No native deps. No bundled ICC profile files.

## What it does

- **Parse** ICC v2/v4 profiles: matrix primaries, gamma/LUT tone curves, mft2 CLUT tags
- **Transform** discrete color values (text fills, rules) between profiles via:
  - Matrix + TRC path (e.g. sRGB device → CIEXYZ D50)
  - Chained matrix + XYZ→Lab + LUT path (e.g. sRGB → FOGRA39 CMYK)
  - 3D tetrahedral CLUT interpolation (per ICC spec §10.8)
- **Synthesize** a built-in sRGB IEC61966-2.1 profile in memory — no disk access, valid ICC v4 bytes ready for PDF OutputIntent embedding
- Describe a PDF **OutputIntent** (`getOutputIntent`) that `@paragraf/render-pdf` and `@paragraf/compile` embed in the PDF

## Install

```sh
npm install @paragraf/color
```

Requires Node.js 22 or later.

## Quick start

```typescript
import { createColorManager } from '@paragraf/color';

const mgr = createColorManager();
const srgb = mgr.loadBuiltinSrgb();

// sRGB → sRGB: the values come back unchanged (within rounding)
const transform = mgr.createTransform(srgb, srgb);
const same = transform.apply([1, 0, 0]);
// → [1, 0, 0]

// Load a real output profile (e.g. FOGRA39)
const fogra = await mgr.loadProfile('/path/to/FOGRA39.icc');
const toCmyk = mgr.createTransform(srgb, fogra, 'perceptual');
const cmyk = toCmyk.apply([1, 0, 0]);
// → roughly [0, 0.85, 0.72, 0.01]

// Get OutputIntent descriptor for PDF/X embedding
const intent = mgr.getOutputIntent(fogra, 'FOGRA39');
// intent.profile.bytes — embed in PDF OutputIntent stream
```

## API

### `createColorManager(): ColorManager`

Factory. Returns a `ColorManager` instance with a profile cache.

### `ColorManager`

| Method | Description |
|--------|-------------|
| `loadBuiltinSrgb()` | Returns (and caches) the synthesized sRGB IEC61966-2.1 profile |
| `loadProfile(path)` | Reads, parses, and caches an ICC profile from disk |
| `createTransform(src, dest, intent?)` | Creates a compiled `ColorTransform` between two profiles |
| `getOutputIntent(profile, condition)` | Returns `{ profile, condition }` for PDF/X OutputIntent |

### `ColorTransform`

```typescript
interface ColorTransform {
  apply(input: number[]): number[];  // values in [0, 1]
}
```

### `ColorProfile`

The parsed profile type (returned by `loadProfile` / `loadBuiltinSrgb`):

```typescript
interface ColorProfile {
  name: string;
  colorSpace: 'RGB' | 'CMYK' | 'Lab' | 'Gray';
  pcs: 'XYZ' | 'Lab';
  renderingIntent: number;                // from the profile header
  whitePoint: XYZValue;
  matrix?: { r, g, b: XYZValue };        // RGB matrix profiles
  trc?: [TrcCurve, TrcCurve, TrcCurve];  // tone curves
  a2b0?: Mft2Tag;                         // device→PCS LUT
  b2a0?: Mft2Tag;                         // PCS→device LUT (perceptual)
  b2a1?: Mft2Tag;                         // PCS→device LUT (relative colorimetric)
  b2a2?: Mft2Tag;                         // PCS→device LUT (saturation)
  bytes: Uint8Array;                      // raw ICC bytes for PDF embedding
}
```

### `TaggedColor`

A colour value together with its transformed result and the profile bytes:

```typescript
interface TaggedColor {
  source: RGBColor;                                      // original sRGB device value
  transformed: CMYKColor | RGBColor | GrayColor | null;  // result of ICC transform
  profileBytes: Uint8Array;                              // for OutputIntent embedding
}
```

This type is exported for callers that carry colours through their own pipeline. The paragraf renderers do not take a `TaggedColor`; they take an `OutputIntent` and a `ColorTransform` (next section).

## Use with PDF output

`@paragraf/compile` embeds the profile as the PDF OutputIntent. When the profile is a CMYK profile it also converts the text fill colour from sRGB to CMYK:

```typescript
import { compile } from '@paragraf/compile';
import { createColorManager } from '@paragraf/color';

const mgr = createColorManager();
const fogra = await mgr.loadProfile('/path/to/FOGRA39.icc');

const { data } = await compile({
  template,
  data: record,
  output: 'pdf',
  outputIntent: mgr.getOutputIntent(fogra, 'FOGRA39'),
  pdfxConformance: 'PDF/X-3:2003', // optional PDF/X-3 markers
});
```

With `@paragraf/render-pdf` directly, pass `outputIntent` and, to convert the fill colour, `colorTransform` in the options of `renderToPdf` / `renderDocumentToPdf`.

## Profile bundling policy

No ICC profiles are bundled. Reasons:
- FOGRA39/51 are commercial profiles (FOGRA e.V.)
- sRGB is synthesized in memory from analytical constants — no file needed
- Keeps the npm tarball clean and legally unambiguous

The test suite builds its profiles in memory. To try a real output profile, download one from the [ICC registry](https://www.color.org/registry/).

## Architecture

```
spaces.ts     — RGBColor, CMYKColor, LabColor, TaggedColor
profile.ts    — ICC binary parser (header, tag directory, XYZ/curv/mluc/mft2 tags)
srgb.ts       — buildSrgbProfileBytes() + loadBuiltinSrgb()
lut.ts        — eval1DCurve, evalClutTetrahedral (tetrahedral interp), evalLutMft2
transform.ts  — MatrixTrcTransform, LutTransform, ChainedTransform, createTransform
manager.ts    — ColorManager (profile cache + factory)
index.ts      — public API barrel
```

## Status

| Scope | State |
|-------|-------|
| Pure TypeScript: profile parsing, matrix+TRC, tetrahedral LUT, sRGB synthesis | in this package |
| PDF OutputIntent and fill-colour transform | in `@paragraf/render-pdf` and `@paragraf/compile` (`outputIntent`, `pdfxConformance`) |
| Rust/WASM acceleration of the transforms | in [`@paragraf/color-wasm`](https://github.com/kadetr/paragraf/tree/main/2c-color-wasm) |
| CSS Color Level 4 inputs (oklch, display-p3) | not implemented |
