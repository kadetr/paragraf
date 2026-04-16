# @paragraf/shaping-wasm

Rust/WASM shaping engine for paragraf. Provides OpenType text shaping and
font metrics via [rustybuzz](https://github.com/RazrFalcon/rustybuzz), compiled
to WebAssembly.

**Node.js only.** The wasm-bindgen glue uses `require('fs')` and `__dirname`
to locate the `.wasm` binary at runtime.

## Install

```bash
npm install @paragraf/shaping-wasm @paragraf/font-engine @paragraf/types
```

## Usage

This package is not typically used directly. `@paragraf/typography` loads the
WASM module automatically and falls back to the TypeScript fontkit engine if the
module is unavailable.

### Manual loading

```ts
import { loadShapingWasm, WasmFontEngine } from '@paragraf/shaping-wasm';

const wasm = loadShapingWasm(); // synchronous CJS require
const engine = new WasmFontEngine(wasm);

await engine.loadFont('regular', './fonts/SourceSerif4-Regular.ttf');

const glyphs = engine.glyphsForString('regular', 'Hello');
const metrics = engine.getFontMetrics('regular', 12);
```

### WASM binary: low-level access

The serialized binary protocol (used by `@paragraf/typography` internally):

```ts
import { serializeNodesToBinary, tracebackWasmBinary } from '@paragraf/shaping-wasm';

const [f64s, u8s] = serializeNodesToBinary(nodes);

const result = tracebackWasmBinary(wasm, nodes, lineWidth, tolerance,
  emergencyStretch, looseness, widowPenalty, orphanPenalty,
  consecutiveHyphenLimit, lineWidths);
if ('error' in result) throw new Error(result.error);
const { breaks, usedEmergency } = result.ok;
```

## WASM build

The compiled WASM artifacts live in `wasm/pkg/` and are included in the
package. They are produced by:

```bash
wasm-pack build --target nodejs wasm/
```

If you modify the Rust source (`wasm/src/lib.rs`), rebuild before running tests.

## Fallback behaviour

`@paragraf/typography` loads this module at startup. If the module is absent
or fails to initialise, all composition falls back to the TypeScript
Knuth-Plass implementation transparently. Call `wasmStatus()` from
`@paragraf/typography` to inspect the current state.

## Benchmark

Combined cache benchmark is owned by `@paragraf/typography`:

`3a-typography/scripts/benchmark-cache.ts`

Run via:

```bash
cd 3a-typography && npm run benchmark:cache
```

## Browser support

Not yet supported. Requires switching to `wasm-pack --target bundler` and an
async `WebAssembly.instantiateStreaming` init path, which is a breaking API
change. Tracked as future work.
