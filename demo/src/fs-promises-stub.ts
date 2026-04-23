// fs-promises-stub.ts
// Browser build stub for Node.js 'node:fs/promises' module.
// Imported transitively via @paragraf/color's loadProfile() — that function is
// never called in the browser demo (profiles are loaded via loadBuiltinSrgb()).

export async function readFile(): Promise<never> {
  throw new Error(
    '[paragraf-demo] fs/promises.readFile is not available in browser context.',
  );
}
