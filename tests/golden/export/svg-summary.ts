// tests/golden/export/svg-summary.ts
// Test helper (not shipped): reduces an SVG to a summary that can be stored
// as a snapshot.
//
// A paragraf SVG is one <path> per glyph and about 1 MB per page, which is
// too large to keep in git per case. The summary keeps what a reviewer can
// read in a diff: the root size, the element and attribute counts, the
// colours, and the start point of every glyph outline. A digest of the whole
// normalised markup catches any other change.
//
// Normalising: whitespace between and inside tags is collapsed, numbers are
// rounded to 2 decimals, and id values are renumbered in order of appearance
// (with url(#…) and href="#…" references renamed to match), so generated ids
// do not show up as differences.

import { createHash } from 'crypto';

export interface SvgSummary {
  width: string | null;
  height: string | null;
  viewBox: string | null;
  /** Element name → count. */
  elements: Record<string, number>;
  /** Every distinct fill, stroke, opacity or transform value, with its count. */
  paint: Record<string, number>;
  /** Number of <path> elements. */
  paths: number;
  /** First point of each path ("x,y"), in document order. */
  starts: string[];
  /** sha256 (first 16 hex digits) of the normalised markup. */
  digest: string;
}

const PAINT_ATTRS = new Set([
  'fill',
  'stroke',
  'stroke-width',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'transform',
  'style',
  'class',
]);

const roundNumbers = (s: string): string =>
  s.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (n) => {
    const r = Math.round(Number(n) * 100) / 100;
    return String(Object.is(r, -0) ? 0 : r);
  });

/** Collapse whitespace, round numbers and renumber ids. */
export const normaliseSvg = (svg: string): string => {
  const ids = new Map<string, string>();
  for (const m of svg.matchAll(/\bid="([^"]*)"/g))
    if (!ids.has(m[1])) ids.set(m[1], `id${ids.size + 1}`);
  let out = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .replace(/\s*(\/?>)/g, '$1')
    .trim();
  out = out.replace(/\bid="([^"]*)"/g, (_m, id) => `id="${ids.get(id)}"`);
  out = out.replace(/url\(#([^)]+)\)/g, (m, id) =>
    ids.has(id) ? `url(#${ids.get(id)})` : m,
  );
  out = out.replace(/href="#([^"]+)"/g, (m, id) =>
    ids.has(id) ? `href="#${ids.get(id)}"` : m,
  );
  // Round numbers inside attribute values only, not in text content.
  out = out.replace(/="([^"]*)"/g, (_m, v: string) => `="${roundNumbers(v)}"`);
  return out;
};

export const summariseSvg = (svg: string): SvgSummary => {
  const norm = normaliseSvg(svg);
  const elements: Record<string, number> = {};
  const paint: Record<string, number> = {};
  const starts: string[] = [];
  let paths = 0;
  let root: Record<string, string> | null = null;

  for (const m of norm.matchAll(
    /<([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g,
  )) {
    const tag = m[1];
    elements[tag] = (elements[tag] ?? 0) + 1;
    const attrs: Record<string, string> = {};
    for (const a of m[2].matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    if (tag === 'svg' && !root) root = attrs;
    for (const [k, v] of Object.entries(attrs)) {
      if (PAINT_ATTRS.has(k)) {
        const key = `${tag} ${k}=${v}`;
        paint[key] = (paint[key] ?? 0) + 1;
      }
    }
    if (tag === 'path') {
      paths++;
      const d = attrs.d ?? '';
      const p = /^\s*[Mm]\s*(-?[\d.]+)[\s,]*(-?[\d.]+)/.exec(d);
      starts.push(p ? `${p[1]},${p[2]}` : '-');
    }
  }

  return {
    width: root?.width ?? null,
    height: root?.height ?? null,
    viewBox: root?.viewBox ?? null,
    elements,
    paint,
    paths,
    starts,
    digest: createHash('sha256').update(norm).digest('hex').slice(0, 16),
  };
};
