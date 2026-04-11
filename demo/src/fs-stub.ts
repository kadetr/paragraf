// fs-stub.ts
// Browser build stub for Node.js 'fs' module. The only fs functions needed are
// ones imported by @paragraf packages that are transitively pulled into the demo
// bundle but never called at runtime (wasm-engine.ts, compile/fonts.ts).

export function readFileSync(): never {
  throw new Error(
    '[paragraf-demo] fs.readFileSync is not available in browser context.',
  );
}
export function existsSync(): boolean {
  return false;
}
export function writeFileSync(): never {
  throw new Error(
    '[paragraf-demo] fs.writeFileSync is not available in browser context.',
  );
}
export function mkdirSync(): never {
  throw new Error(
    '[paragraf-demo] fs.mkdirSync is not available in browser context.',
  );
}
