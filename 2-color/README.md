# paragraf-color

ICC v2/v4 color management for the paragraf typography library.

Pure TypeScript. No native deps. No bundled ICC profile files.

## What it does

- **Parse** ICC v2/v4 profiles: matrix primaries, gamma/LUT tone curves, mft2 CLUT tags
- **Transform** discrete color values (text fills, rules) between profiles via:
  - Matrix + TRC path (e.g. sRGB device → CIEXYZ D50)
  - Chained matrix + XYZ→Lab + LUT path (e.g. sRGB → FOGRA39 CMYK)
  - 3D tetrahedral CLUT interpolation (per ICC spec §10.8)
- **Synthesize** a built-in sRGB IEC61966-2.1 profile in memory — no disk access, valid ICC v4 bytes ready for PDF OutputIntent embedding
- Export **`TaggedColor`** — the integration seam for paragraf-knuth-plass v0.11 PDF/X output

## Install

```sh
npm install paragraf-color
```

## Quick start

```typescript
import { createColorManager } from 'paragraf-color';

const mgr = createColorManager();
const srgb = mgr.loadBuiltinSrgb();

// Transform sRGB red to CIEXYZ D50
const transform = mgr.createTransform(srgb, srgb);
const xyz = transform.apply([1, 0, 0]);
// → [0.4361, 0.2225, 0.0139]

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
  whitePoint: XYZValue;
  matrix?: { r, g, b: XYZValue };        // RGB matrix profiles
  trc?: [TrcCurve, TrcCurve, TrcCurve];  // tone curves
  a2b0?: Mft2Tag;                         // device→PCS LUT
  b2a0?: Mft2Tag;                         // PCS→device LUT
  bytes: Uint8Array;                      // raw ICC bytes for PDF embedding
}
```

### `TaggedColor`

The v0.11 integration seam — passed to `renderToPdf` as a structured fill color:

```typescript
interface TaggedColor {
  source: RGBColor;                          // original sRGB device value
  transformed: CMYKColor | RGBColor | null;  // result of ICC transform
  profileBytes: Uint8Array;                  // for OutputIntent embedding
}
```

> **Note:** `renderToPdf` integration (PdfOptions.iccProfile, TaggedColor fill) is being wired up in paragraf-knuth-plass v0.11, after the document model lands in v0.9.

## Profile bundling policy

No ICC profiles are bundled. Reasons:
- FOGRA39/51 are commercial profiles (FOGRA e.V.)
- sRGB is synthesized in memory from analytical constants — no file needed
- Keeps the npm tarball clean and legally unambiguous

Test fixtures: download free ICC profiles from [ICC.org](https://www.color.org/registry/) at test time.

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

## Roadmap

| Version | Scope |
|---------|-------|
| **v0.1 (current)** | Pure TypeScript: profile parsing, matrix+TRC, tetrahedral LUT, sRGB synthesis |
| v0.2 | paragraf-knuth-plass v0.11 integration (TaggedColor fill, PDF/X OutputIntent) |
| v0.3 | Rust/WASM via [qcms](https://github.com/nicowillis/qcms) — perf upgrade for batch image pipelines |
| v0.4 | CSS Color Level 4 inputs (oklch, display-p3) |
