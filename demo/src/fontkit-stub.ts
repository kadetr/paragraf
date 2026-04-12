// fontkit-stub.ts
// Browser build stub for fontkit. fontkit.openSync reads fonts from the file
// system — not available in browsers. The demo uses BrowserWasmFontEngine and
// never calls compile() or FontkitEngine, so this stub is never invoked at runtime.

export function openSync(): never {
  throw new Error(
    '[paragraf-demo] fontkit.openSync is not available in browser context.',
  );
}
