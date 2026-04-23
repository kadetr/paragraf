#!/usr/bin/env tsx
// manual/scripts/mt-24-color-profile-inspect.ts
// MT-24 — ICC profile inspection.
//
// Loads 5 profiles and prints their parsed fields: colorSpace, pcs, whitePoint,
// matrix column vectors, TRC types + gamma values, a2b0/b2a0 presence.
//
// Also peeks at the raw tag table to show the actual data-type signatures,
// which reveals the mft1 gap on the Generic CMYK Profile (b2a0 is parsed as
// undefined even though the tag exists, because the parser only handles mft2).
//
// Outputs:
//   mt-24-profiles.json   — full parsed profile summary
//
// Run:  tsx tests/manual/scripts/mt-24-color-profile-inspect.ts

import { readFileSync, existsSync } from 'fs';
import { parseIccProfile, loadBuiltinSrgb } from '@paragraf/color';
import { writeJson } from '../fixtures/output.js';

// ─── Profiles under inspection ─────────────────────────────────────────────────────────

const SYSTEM = '/System/Library/ColorSync/Profiles';

if (!existsSync(SYSTEM)) {
  console.log(
    '[mt-24] macOS ColorSync profiles not found — skipping on this platform.',
  );
  process.exit(0);
}

const PROFILE_PATHS: Array<{ label: string; path: string | null }> = [
  { label: 'builtin-srgb', path: null }, // synthesized in memory
  { label: 'macos-srgb', path: `${SYSTEM}/sRGB Profile.icc` },
  { label: 'adobergb1998', path: `${SYSTEM}/AdobeRGB1998.icc` },
  { label: 'display-p3', path: `${SYSTEM}/Display P3.icc` },
  { label: 'generic-cmyk', path: `${SYSTEM}/Generic CMYK Profile.icc` },
];

// ─── Raw tag-table peek ────────────────────────────────────────────────────────

function peekTags(bytes: Uint8Array): Array<{ tag: string; dataSig: string }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tagCount = view.getUint32(128);
  const result: Array<{ tag: string; dataSig: string }> = [];
  for (let i = 0; i < tagCount; i++) {
    const off = 132 + i * 12;
    const tagSig = String.fromCharCode(
      bytes[off],
      bytes[off + 1],
      bytes[off + 2],
      bytes[off + 3],
    ).trimEnd();
    const tagOff = view.getUint32(off + 4);
    const dataSig = String.fromCharCode(
      bytes[tagOff],
      bytes[tagOff + 1],
      bytes[tagOff + 2],
      bytes[tagOff + 3],
    ).trimEnd();
    result.push({ tag: tagSig, dataSig });
  }
  return result;
}

function describeTrc(
  trc: { kind: string; gamma?: number; values?: unknown } | undefined,
): string {
  if (!trc) return 'none';
  if (trc.kind === 'linear') return 'linear';
  if (trc.kind === 'gamma') return `gamma(${trc.gamma?.toFixed(4)})`;
  if (trc.kind === 'lut')
    return `lut(${(trc.values as unknown[] | undefined)?.length ?? '?'} entries)`;
  return trc.kind;
}

// ─── Inspect ──────────────────────────────────────────────────────────────────

const summaries: unknown[] = [];

for (const { label, path } of PROFILE_PATHS) {
  let bytes: Uint8Array;
  if (path === null) {
    const p = loadBuiltinSrgb();
    bytes = p.bytes;
  } else {
    const buf = readFileSync(path);
    bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  const p = parseIccProfile(bytes);
  const rawTags = peekTags(bytes);

  // A2B0 / B2A0 raw signatures (what's actually in the file vs what was parsed)
  const rawA2B0 = rawTags.find((t) => t.tag === 'A2B0');
  const rawB2A0 = rawTags.find((t) => t.tag === 'B2A0');

  const summary = {
    label,
    path: path ?? '(builtin)',
    colorSpace: p.colorSpace,
    pcs: p.pcs,
    renderingIntent: p.renderingIntent,
    whitePoint: {
      x: +p.whitePoint.x.toFixed(6),
      y: +p.whitePoint.y.toFixed(6),
      z: +p.whitePoint.z.toFixed(6),
    },
    matrix: p.matrix
      ? {
          r: {
            x: +p.matrix.r.x.toFixed(6),
            y: +p.matrix.r.y.toFixed(6),
            z: +p.matrix.r.z.toFixed(6),
          },
          g: {
            x: +p.matrix.g.x.toFixed(6),
            y: +p.matrix.g.y.toFixed(6),
            z: +p.matrix.g.z.toFixed(6),
          },
          b: {
            x: +p.matrix.b.x.toFixed(6),
            y: +p.matrix.b.y.toFixed(6),
            z: +p.matrix.b.z.toFixed(6),
          },
        }
      : null,
    trc: p.trc
      ? [
          describeTrc(p.trc[0] as any),
          describeTrc(p.trc[1] as any),
          describeTrc(p.trc[2] as any),
        ]
      : null,
    a2b0Parsed: !!p.a2b0,
    b2a0Parsed: !!p.b2a0,
    a2b0RawSig: rawA2B0?.dataSig ?? null,
    b2a0RawSig: rawB2A0?.dataSig ?? null,
    mft1GapDetected:
      (!p.a2b0 && rawA2B0?.dataSig === 'mft1') ||
      (!p.b2a0 && rawB2A0?.dataSig === 'mft1'),
    byteCount: bytes.length,
  };

  summaries.push(summary);

  // Console summary
  console.log(`\n── ${label} ──`);
  console.log(`  colorSpace: ${p.colorSpace}  pcs: ${p.pcs}`);
  console.log(
    `  whitePoint: X=${p.whitePoint.x.toFixed(4)} Y=${p.whitePoint.y.toFixed(4)} Z=${p.whitePoint.z.toFixed(4)}`,
  );
  if (p.matrix) {
    console.log(
      `  matrix.r: (${p.matrix.r.x.toFixed(4)}, ${p.matrix.r.y.toFixed(4)}, ${p.matrix.r.z.toFixed(4)})`,
    );
    console.log(
      `  matrix.g: (${p.matrix.g.x.toFixed(4)}, ${p.matrix.g.y.toFixed(4)}, ${p.matrix.g.z.toFixed(4)})`,
    );
    console.log(
      `  matrix.b: (${p.matrix.b.x.toFixed(4)}, ${p.matrix.b.y.toFixed(4)}, ${p.matrix.b.z.toFixed(4)})`,
    );
  }
  if (p.trc) {
    console.log(
      `  TRC R: ${describeTrc(p.trc[0] as any)}  G: ${describeTrc(p.trc[1] as any)}  B: ${describeTrc(p.trc[2] as any)}`,
    );
  }
  console.log(
    `  a2b0: parsed=${p.a2b0 ? 'yes' : 'no'}  rawSig=${rawA2B0?.dataSig ?? 'absent'}`,
  );
  console.log(
    `  b2a0: parsed=${p.b2a0 ? 'yes' : 'no'}  rawSig=${rawB2A0?.dataSig ?? 'absent'}`,
  );
  if (summary.mft1GapDetected) {
    console.log(`  ⚠  mft1 gap: tag present but not parsed (workId 013)`);
  }
}

writeJson('mt-24-profiles.json', summaries);
console.log('\nMT-24 PASS');
