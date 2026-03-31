import { parseIccProfile } from './profile.js';
import type { ColorProfile } from './profile.js';

// ─── sRGB D50-adapted primaries (ICC specification) ───────────────────────────

const SRGB_RX = 0.4361,
  SRGB_RY = 0.2225,
  SRGB_RZ = 0.0139;
const SRGB_GX = 0.3851,
  SRGB_GY = 0.7169,
  SRGB_GZ = 0.0971;
const SRGB_BX = 0.1431,
  SRGB_BY = 0.0606,
  SRGB_BZ = 0.7141;
const D50_X = 0.9642,
  D50_Y = 1.0,
  D50_Z = 0.8249;
const SRGB_GAMMA = 2.2;
const SRGB_NAME = 'sRGB IEC61966-2.1';

// ─── Layout constants (must be consistent with parser) ────────────────────────

// Header: 128 bytes
// Tag count: 4 bytes
// Tag table: 8 tags × 12 bytes = 96 bytes
// Data start: 228
const DATA_START = 128 + 4 + 8 * 12; // = 228
const DESC_SIZE = 64; // mluc: 4+4+4+4+12+34+2(pad) = 64
const XYZ_SIZE = 20; // 'XYZ ' + 4 reserved + 3×4(s15Fixed16)
const TRC_SIZE = 16; // 'curv' + 4 reserved + 4 count + 2 value + 2 pad
const TOTAL_SIZE = DATA_START + DESC_SIZE + XYZ_SIZE * 4 + TRC_SIZE * 3; // 420

// ─── Helpers ─────────────────────────────────────────────────────────────────

function writeStr(u8: Uint8Array, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) u8[offset + i] = s.charCodeAt(i);
}

function toS15Fixed16(v: number): number {
  return Math.round(v * 65536);
}

function writeXYZTag(
  view: DataView,
  u8: Uint8Array,
  offset: number,
  x: number,
  y: number,
  z: number,
): void {
  writeStr(u8, offset, 'XYZ ');
  view.setUint32(offset + 4, 0);
  view.setInt32(offset + 8, toS15Fixed16(x));
  view.setInt32(offset + 12, toS15Fixed16(y));
  view.setInt32(offset + 16, toS15Fixed16(z));
}

function writeCurvGammaTag(
  view: DataView,
  u8: Uint8Array,
  offset: number,
  gamma: number,
): void {
  writeStr(u8, offset, 'curv');
  view.setUint32(offset + 4, 0); // reserved
  view.setUint32(offset + 8, 1); // count = 1
  view.setUint16(offset + 12, Math.round(gamma * 256)); // u8Fixed8 gamma value
  // 2 padding bytes at offset+14 remain 0
}

// ─── Profile builder ─────────────────────────────────────────────────────────

/**
 * Synthesize a minimal valid ICC v4 sRGB profile in memory.
 * Contains: header, desc (mluc), wtpt, rXYZ, gXYZ, bXYZ, rTRC, gTRC, bTRC.
 * Uses gamma 2.2 TRC and D50-adapted sRGB primaries from the ICC specification.
 * No disk I/O — safe to call in any environment.
 */
export function buildSrgbProfileBytes(): Uint8Array {
  const buf = new ArrayBuffer(TOTAL_SIZE);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);

  // ── Header (128 bytes) ────────────────────────────────────────────────────
  view.setUint32(0, TOTAL_SIZE); // profile size
  //  4-7: preferred CMM = 0
  view.setUint32(8, 0x04000000); // ICC version 4.0
  writeStr(u8, 12, 'mntr'); // device class: display monitor
  writeStr(u8, 16, 'RGB '); // color space
  writeStr(u8, 20, 'XYZ '); // PCS
  // 24-35: creation datetime = 0 (epoch)
  writeStr(u8, 36, 'acsp'); // mandatory ICC file signature
  // 40-63: platform, flags, manufacturer, model, attributes = 0
  view.setUint32(64, 0); // rendering intent: perceptual
  // PCS illuminant (D50) at offsets 68–79
  view.setInt32(68, toS15Fixed16(D50_X));
  view.setInt32(72, toS15Fixed16(D50_Y));
  view.setInt32(76, toS15Fixed16(D50_Z));
  // 80-127: profile creator, profile ID (MD5), reserved = 0

  // ── Tag count (offset 128) ────────────────────────────────────────────────
  view.setUint32(128, 8);

  // ── Tag table (offsets 132 … 227) ────────────────────────────────────────
  const descOffset = DATA_START;
  const wtptOffset = descOffset + DESC_SIZE;
  const rXYZOffset = wtptOffset + XYZ_SIZE;
  const gXYZOffset = rXYZOffset + XYZ_SIZE;
  const bXYZOffset = gXYZOffset + XYZ_SIZE;
  const rTRCOffset = bXYZOffset + XYZ_SIZE;
  const gTRCOffset = rTRCOffset + TRC_SIZE;
  const bTRCOffset = gTRCOffset + TRC_SIZE;

  const tagTable: Array<[string, number, number]> = [
    ['desc', descOffset, DESC_SIZE],
    ['wtpt', wtptOffset, XYZ_SIZE],
    ['rXYZ', rXYZOffset, XYZ_SIZE],
    ['gXYZ', gXYZOffset, XYZ_SIZE],
    ['bXYZ', bXYZOffset, XYZ_SIZE],
    ['rTRC', rTRCOffset, TRC_SIZE],
    ['gTRC', gTRCOffset, TRC_SIZE],
    ['bTRC', bTRCOffset, TRC_SIZE],
  ];
  let tablePos = 132;
  for (const [sig, off, size] of tagTable) {
    writeStr(u8, tablePos, sig);
    view.setUint32(tablePos + 4, off);
    view.setUint32(tablePos + 8, size);
    tablePos += 12;
  }

  // ── Tag data ──────────────────────────────────────────────────────────────

  // desc (mluc): 17-char name 'sRGB IEC61966-2.1', UTF-16BE, padded to 64 bytes
  {
    const name = SRGB_NAME; // 17 chars → 34 bytes UTF-16BE
    const nameUtf16Len = name.length * 2;
    let p = descOffset;
    writeStr(u8, p, 'mluc');
    p += 4;
    view.setUint32(p, 0);
    p += 4; // reserved
    view.setUint32(p, 1);
    p += 4; // numRecords = 1
    view.setUint32(p, 12);
    p += 4; // recordSize = 12
    // Record[0]: language='en', country='US'
    writeStr(u8, p, 'en');
    p += 2;
    writeStr(u8, p, 'US');
    p += 2;
    view.setUint32(p, nameUtf16Len);
    p += 4; // string length in bytes
    view.setUint32(p, 28);
    p += 4; // offset from mluc start (4+4+4+4+12 = 28)
    for (let i = 0; i < name.length; i++) {
      view.setUint16(p, name.charCodeAt(i));
      p += 2;
    }
    // 2 padding bytes remain 0
  }

  // wtpt (D50)
  writeXYZTag(view, u8, wtptOffset, D50_X, D50_Y, D50_Z);

  // rXYZ / gXYZ / bXYZ
  writeXYZTag(view, u8, rXYZOffset, SRGB_RX, SRGB_RY, SRGB_RZ);
  writeXYZTag(view, u8, gXYZOffset, SRGB_GX, SRGB_GY, SRGB_GZ);
  writeXYZTag(view, u8, bXYZOffset, SRGB_BX, SRGB_BY, SRGB_BZ);

  // rTRC / gTRC / bTRC (gamma 2.2)
  writeCurvGammaTag(view, u8, rTRCOffset, SRGB_GAMMA);
  writeCurvGammaTag(view, u8, gTRCOffset, SRGB_GAMMA);
  writeCurvGammaTag(view, u8, bTRCOffset, SRGB_GAMMA);

  return u8;
}

// ─── Public helper ────────────────────────────────────────────────────────────

/**
 * Build and parse the built-in sRGB profile entirely in memory.
 * The returned `ColorProfile.bytes` contains the raw ICC bytes for PDF embedding.
 */
export function loadBuiltinSrgb(): ColorProfile {
  return parseIccProfile(buildSrgbProfileBytes());
}
