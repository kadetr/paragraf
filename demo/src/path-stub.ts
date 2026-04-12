// path-stub.ts
// Browser build stub for Node.js 'path' module. The only path functions needed are
// ones imported by @paragraf/compile's fonts.ts, which is pulled into the demo
// bundle transitively but never called at runtime in the browser.

export function isAbsolute(_p: string): boolean {
  return false;
}
export function resolve(..._parts: string[]): string {
  return _parts.join('/');
}
export function join(..._parts: string[]): string {
  return _parts.join('/');
}
export function dirname(_p: string): string {
  return _p.substring(0, _p.lastIndexOf('/')) || '.';
}
export function basename(_p: string, _ext?: string): string {
  const base = _p.substring(_p.lastIndexOf('/') + 1);
  return _ext && base.endsWith(_ext) ? base.slice(0, -_ext.length) : base;
}
export function extname(_p: string): string {
  const i = _p.lastIndexOf('.');
  return i >= 0 ? _p.slice(i) : '';
}
export const sep = '/';

export default {
  isAbsolute,
  resolve,
  join,
  dirname,
  basename,
  extname,
  sep,
};
