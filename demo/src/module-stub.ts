// module-stub.ts
// Browser build stub for Node.js 'module' built-in.
// createRequire is used by @paragraf/shaping-wasm to CJS-require the WASM package
// in Node.js. Never called in the browser since loadShapingWasm() is wrapped in
// a try/catch in paragraph.ts and falls back to the TS implementation.

export function createRequire(): (id: string) => never {
  return (_id: string) => {
    throw new Error(
      '[paragraf-demo] require() is not available in browser context.',
    );
  };
}
