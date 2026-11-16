# @paragraf/color-wasm

Rust/WASM acceleration for the ICC colour transforms of
[`@paragraf/color`](../0-color). Part of the
[paragraf](https://github.com/kadetr/paragraf) typesetting library.

The compiled WASM module is included in the npm package; no Rust toolchain is
needed to use it.

## Install

```sh
npm install @paragraf/color-wasm @paragraf/color
```

## Usage

```ts
import { loadColorWasm, createWasmTransform } from '@paragraf/color-wasm';

const wasm = loadColorWasm(); // throws if the WASM module cannot be loaded

// source and dest are ColorProfile objects from @paragraf/color
const transform = createWasmTransform(wasm, source, dest, 'perceptual');
const out = transform.apply([1, 0, 0]);
```

`WasmColorTransform` implements the same `ColorTransform` interface as
`createTransform` from `@paragraf/color`.

Accelerated paths:

- RGB matrix → RGB matrix (matrix + tone curves)
- RGB matrix → CMYK/LUT (matrix + tone curves, XYZ → Lab, CLUT)

Other profile combinations (for example a CMYK source) are handled by the
TypeScript implementation in `@paragraf/color` automatically.

## Building the WASM module (contributors)

```sh
npm run build:wasm --workspace=2c-color-wasm   # needs Rust and wasm-pack
```

## License

MIT
