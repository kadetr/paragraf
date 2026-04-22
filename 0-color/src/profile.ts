import { readFile } from 'node:fs/promises';

// ─── Public types ────────────────────────────────────────────────────────────

export type ColorSpace = 'RGB' | 'CMYK' | 'Lab' | 'Gray';
export type PcsSpace = 'XYZ' | 'Lab';

export type TrcCurve =
  | { kind: 'gamma'; gamma: number }
  | { kind: 'lut'; values: Float64Array }
  | { kind: 'linear' };

export interface XYZValue {
  x: number;
  y: number;
  z: number;
}

/** A parsed mft2 (16-bit LUT) tag — used for A2B0 / B2A0 CLUT transforms. */
export interface Mft2Tag {
  inChannels: number;
  outChannels: number;
  gridPoints: number;
  /** 9-element row-major 3×3 matrix (only meaningful when inChannels === 3). */
  matrix: number[];
  /** Per-input-channel 1D curves, each normalized to [0, 1]. */
  inputCurves: Float64Array[];
  /** Flattened CLUT: indexed by [gridIdx] * outChannels + outCh, values in [0, 1]. */
  clut: Float64Array;
  /** Per-output-channel 1D curves, each normalized to [0, 1]. */
  outputCurves: Float64Array[];
}

/**
 * A fully-parsed ICC v2/v4 profile.
 * The `bytes` field carries the raw profile data for PDF/X OutputIntent embedding.
 */
export interface ColorProfile {
  readonly name: string;
  readonly colorSpace: ColorSpace;
  readonly pcs: PcsSpace;
  readonly renderingIntent: number;
  readonly whitePoint: XYZValue;
  /** Column-vector primaries (from rXYZ / gXYZ / bXYZ tags). Present on RGB profiles. */
  readonly matrix?: {
    r: XYZValue;
    g: XYZValue;
    b: XYZValue;
  };
  /** Per-channel tone reproduction curves [R, G, B]. Present on RGB matrix profiles. */
  readonly trc?: [TrcCurve, TrcCurve, TrcCurve];
  /** Device → PCS LUT. */
  readonly a2b0?: Mft2Tag;
  /** PCS → device LUT (perceptual intent). */
  readonly b2a0?: Mft2Tag;
  /** PCS → device LUT (relative colorimetric intent). */
  readonly b2a1?: Mft2Tag;
  /** PCS → device LUT (saturation intent). */
  readonly b2a2?: Mft2Tag;
  /** Raw ICC profile bytes for PDF embedding. */
  readonly bytes: Uint8Array;
}

// ─── Parsing helpers ─────────────────────────────────────────────────────────

function readStr4(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

function readS15Fixed16(view: DataView, offset: number): number {
  return view.getInt32(offset) / 65536;
}

function parseXYZTag(view: DataView, tagOffset: number): XYZValue {
  return {
    x: readS15Fixed16(view, tagOffset + 8),
    y: readS15Fixed16(view, tagOffset + 12),
    z: readS15Fixed16(view, tagOffset + 16),
  };
}

function parseCurvTag(view: DataView, tagOffset: number): TrcCurve {
  const count = view.getUint32(tagOffset + 8);
  if (count === 0) return { kind: 'linear' };
  if (count === 1) {
    const raw = view.getUint16(tagOffset + 12);
    return { kind: 'gamma', gamma: raw / 256 };
  }
  const values = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    values[i] = view.getUint16(tagOffset + 12 + i * 2) / 65535;
  }
  return { kind: 'lut', values };
}

function parseParaTag(view: DataView, tagOffset: number): TrcCurve {
  // Parametric curve (ICC v4) — extract function type and use gamma approximation for simple cases.
  const fnType = view.getUint16(tagOffset + 8);
  const gamma = readS15Fixed16(view, tagOffset + 12);
  if (fnType === 0) return { kind: 'gamma', gamma };
  // For types 1–4 (which include the sRGB piecewise), approximate with the gamma parameter.
  return { kind: 'gamma', gamma };
}

function parseMlucTag(
  bytes: Uint8Array,
  view: DataView,
  tagOffset: number,
): string {
  const numRecords = view.getUint32(tagOffset + 8);
  if (numRecords === 0) return '';
  // First record: lang(2) + country(2) + length(4) + offset(4)
  const strLengthBytes = view.getUint32(tagOffset + 20);
  const strOffsetFromTagStart = view.getUint32(tagOffset + 24);
  const strStart = tagOffset + strOffsetFromTagStart;
  const charCount = strLengthBytes / 2;
  let name = '';
  for (let i = 0; i < charCount; i++) {
    name += String.fromCodePoint(view.getUint16(strStart + i * 2));
  }
  return name;
}

/** Handles both old-style `desc` (textDescription, sig='desc') and ICC v4 `mluc`. */
function parseDescTag(
  bytes: Uint8Array,
  view: DataView,
  tagOffset: number,
): string {
  const sig = readStr4(bytes, tagOffset);
  if (sig === 'mluc') return parseMlucTag(bytes, view, tagOffset);
  if (sig === 'desc') {
    // v2 textDescription: 4 sig + 4 reserved + 4 ASCII length + ASCII chars
    const asciiLen = view.getUint32(tagOffset + 8);
    let name = '';
    for (let i = 0; i < asciiLen; i++) {
      const ch = bytes[tagOffset + 12 + i];
      if (ch === 0) break;
      name += String.fromCharCode(ch);
    }
    return name;
  }
  return '';
}

function parseMft1Tag(
  bytes: Uint8Array,
  _view: DataView,
  tagOffset: number,
): Mft2Tag {
  const inCh = bytes[tagOffset + 8];
  const outCh = bytes[tagOffset + 9];
  const gridPoints = bytes[tagOffset + 10];

  // 3×3 matrix (s15Fixed16), row-major
  const matrix: number[] = [];
  for (let i = 0; i < 9; i++) {
    matrix.push(readS15Fixed16(_view, tagOffset + 12 + i * 4));
  }

  const inputTableEntries = _view.getUint16(tagOffset + 48);
  const outputTableEntries = _view.getUint16(tagOffset + 50);

  let dataOffset = tagOffset + 52;

  // Input curves: inCh × inputTableEntries × uint8, normalized /255
  const inputCurves: Float64Array[] = [];
  for (let c = 0; c < inCh; c++) {
    const curve = new Float64Array(inputTableEntries);
    for (let i = 0; i < inputTableEntries; i++) {
      curve[i] = bytes[dataOffset] / 255;
      dataOffset += 1;
    }
    inputCurves.push(curve);
  }

  // CLUT: gridPoints^inCh × outCh × uint8, normalized /255
  const clutSize = Math.pow(gridPoints, inCh) * outCh;
  const clut = new Float64Array(clutSize);
  for (let i = 0; i < clutSize; i++) {
    clut[i] = bytes[dataOffset] / 255;
    dataOffset += 1;
  }

  // Output curves: outCh × outputTableEntries × uint8, normalized /255
  const outputCurves: Float64Array[] = [];
  for (let c = 0; c < outCh; c++) {
    const curve = new Float64Array(outputTableEntries);
    for (let i = 0; i < outputTableEntries; i++) {
      curve[i] = bytes[dataOffset] / 255;
      dataOffset += 1;
    }
    outputCurves.push(curve);
  }

  return {
    inChannels: inCh,
    outChannels: outCh,
    gridPoints,
    matrix,
    inputCurves,
    clut,
    outputCurves,
  };
}

function parseMft2Tag(
  bytes: Uint8Array,
  view: DataView,
  tagOffset: number,
): Mft2Tag {
  const inCh = bytes[tagOffset + 8];
  const outCh = bytes[tagOffset + 9];
  const gridPoints = bytes[tagOffset + 10];

  // 3×3 matrix (s15Fixed16), row-major
  const matrix: number[] = [];
  for (let i = 0; i < 9; i++) {
    matrix.push(readS15Fixed16(view, tagOffset + 12 + i * 4));
  }

  const inputTableEntries = view.getUint16(tagOffset + 48);
  const outputTableEntries = view.getUint16(tagOffset + 50);

  let dataOffset = tagOffset + 52;

  // Input curves: inCh × inputTableEntries × uint16
  const inputCurves: Float64Array[] = [];
  for (let c = 0; c < inCh; c++) {
    const curve = new Float64Array(inputTableEntries);
    for (let i = 0; i < inputTableEntries; i++) {
      curve[i] = view.getUint16(dataOffset) / 65535;
      dataOffset += 2;
    }
    inputCurves.push(curve);
  }

  // CLUT: gridPoints^inCh × outCh × uint16
  const clutSize = Math.pow(gridPoints, inCh) * outCh;
  const clut = new Float64Array(clutSize);
  for (let i = 0; i < clutSize; i++) {
    clut[i] = view.getUint16(dataOffset) / 65535;
    dataOffset += 2;
  }

  // Output curves: outCh × outputTableEntries × uint16
  const outputCurves: Float64Array[] = [];
  for (let c = 0; c < outCh; c++) {
    const curve = new Float64Array(outputTableEntries);
    for (let i = 0; i < outputTableEntries; i++) {
      curve[i] = view.getUint16(dataOffset) / 65535;
      dataOffset += 2;
    }
    outputCurves.push(curve);
  }

  return {
    inChannels: inCh,
    outChannels: outCh,
    gridPoints,
    matrix,
    inputCurves,
    clut,
    outputCurves,
  };
}

// ─── Color space helpers ──────────────────────────────────────────────────────

function sigToColorSpace(sig: string): ColorSpace {
  const s = sig.trim();
  if (s === 'RGB') return 'RGB';
  if (s === 'CMYK') return 'CMYK';
  if (s === 'Lab') return 'Lab';
  if (s === 'GRAY' || s === 'Gray') return 'Gray';
  // Unknown — return as-is cast (shouldn't happen for well-formed profiles)
  return 'RGB';
}

function sigToPcs(sig: string): PcsSpace {
  return sig.trim().startsWith('Lab') ? 'Lab' : 'XYZ';
}

// ─── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a raw ICC v2 or v4 profile from bytes.
 * Throws on malformed or unrecognised input.
 */
export function parseIccProfile(bytes: Uint8Array): ColorProfile {
  if (bytes.byteLength < 128)
    throw new Error('ICC profile too short (< 128 bytes)');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const magic = readStr4(bytes, 36);
  if (magic !== 'acsp')
    throw new Error(`Invalid ICC signature: expected 'acsp', got '${magic}'`);

  const colorSpaceSig = readStr4(bytes, 16);
  const pcsSig = readStr4(bytes, 20);
  const renderingIntent = view.getUint32(64);
  const whitePoint: XYZValue = {
    x: readS15Fixed16(view, 68),
    y: readS15Fixed16(view, 72),
    z: readS15Fixed16(view, 76),
  };

  // Tag directory
  const tagCount = view.getUint32(128);
  const tags = new Map<string, { offset: number; size: number }>();
  for (let i = 0; i < tagCount; i++) {
    const base = 132 + i * 12;
    const sig = readStr4(bytes, base);
    const offset = view.getUint32(base + 4);
    const size = view.getUint32(base + 8);
    tags.set(sig, { offset, size });
  }

  // Profile name (desc tag)
  let name = '';
  const descEntry = tags.get('desc');
  if (descEntry) {
    name = parseDescTag(bytes, view, descEntry.offset);
  }

  // Matrix primaries (rXYZ / gXYZ / bXYZ)
  let matrix: ColorProfile['matrix'];
  const rXYZEntry = tags.get('rXYZ');
  const gXYZEntry = tags.get('gXYZ');
  const bXYZEntry = tags.get('bXYZ');
  if (rXYZEntry && gXYZEntry && bXYZEntry) {
    matrix = {
      r: parseXYZTag(view, rXYZEntry.offset),
      g: parseXYZTag(view, gXYZEntry.offset),
      b: parseXYZTag(view, bXYZEntry.offset),
    };
  }

  // TRC curves (rTRC / gTRC / bTRC)
  let trc: ColorProfile['trc'];
  const rTRCEntry = tags.get('rTRC');
  const gTRCEntry = tags.get('gTRC');
  const bTRCEntry = tags.get('bTRC');
  if (rTRCEntry && gTRCEntry && bTRCEntry) {
    function parseTRC(entry: { offset: number; size: number }): TrcCurve {
      const sig = readStr4(bytes, entry.offset);
      if (sig === 'curv') return parseCurvTag(view, entry.offset);
      if (sig === 'para') return parseParaTag(view, entry.offset);
      return { kind: 'linear' };
    }
    trc = [parseTRC(rTRCEntry), parseTRC(gTRCEntry), parseTRC(bTRCEntry)];
  }

  // A2B0 / B2A0 / B2A1 / B2A2 LUT tags
  function parseLutEntry(entry: {
    offset: number;
    size: number;
  }): Mft2Tag | undefined {
    const sig = readStr4(bytes, entry.offset);
    if (sig === 'mft2') return parseMft2Tag(bytes, view, entry.offset);
    if (sig === 'mft1') return parseMft1Tag(bytes, view, entry.offset);
    return undefined;
  }

  let a2b0: Mft2Tag | undefined;
  let b2a0: Mft2Tag | undefined;
  let b2a1: Mft2Tag | undefined;
  let b2a2: Mft2Tag | undefined;
  const a2b0Entry = tags.get('A2B0');
  const b2a0Entry = tags.get('B2A0');
  const b2a1Entry = tags.get('B2A1');
  const b2a2Entry = tags.get('B2A2');
  if (a2b0Entry) a2b0 = parseLutEntry(a2b0Entry);
  if (b2a0Entry) b2a0 = parseLutEntry(b2a0Entry);
  if (b2a1Entry) b2a1 = parseLutEntry(b2a1Entry);
  if (b2a2Entry) b2a2 = parseLutEntry(b2a2Entry);

  return {
    name,
    colorSpace: sigToColorSpace(colorSpaceSig),
    pcs: sigToPcs(pcsSig),
    renderingIntent,
    whitePoint,
    matrix,
    trc,
    a2b0,
    b2a0,
    b2a1,
    b2a2,
    bytes,
  };
}

/**
 * Load and parse an ICC profile from disk.
 * The raw bytes are preserved on the returned profile for PDF/X embedding.
 */
export async function loadProfile(path: string): Promise<ColorProfile> {
  const buffer = await readFile(path);
  const bytes = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  return parseIccProfile(bytes);
}
