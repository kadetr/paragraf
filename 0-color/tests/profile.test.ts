import { describe, it, expect } from 'vitest';
import { parseIccProfile, sampleParametricCurve } from '../src/profile';
import { buildSrgbProfileBytes } from '../src/srgb';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal synthetic ICC profile with a 'para' tag for the given type/params. */
function buildParaProfile(fnType: number, params: number[]): Uint8Array {
  // Minimal v4 RGB profile:
  //   header (128 bytes) + tag count (4) + 3 tag entries (3×12=36) + para tag data
  // All three TRC tags (rTRC, gTRC, bTRC) share the same para tag offset.
  //
  // para tag layout (ICC §10.15):
  //   4  sig   'para' = 0x70617261
  //   4  reserved 0
  //   2  functionType
  //   2  reserved 0
  //   4*n  s15Fixed16 parameters
  const paramCount = [1, 3, 4, 5, 7][fnType] ?? 1;
  const tagSize = 12 + paramCount * 4;
  const tagDataOffset = 128 + 4 + 3 * 12; // header + tagCount + 3 entries = 168
  const profileSize = tagDataOffset + tagSize;

  const buf = new ArrayBuffer(profileSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Header
  view.setUint32(0, profileSize);
  bytes[36] = 0x61;
  bytes[37] = 0x63;
  bytes[38] = 0x73;
  bytes[39] = 0x70; // 'acsp'
  bytes[16] = 0x52;
  bytes[17] = 0x47;
  bytes[18] = 0x42;
  bytes[19] = 0x20; // 'RGB '
  bytes[20] = 0x58;
  bytes[21] = 0x59;
  bytes[22] = 0x5a;
  bytes[23] = 0x20; // 'XYZ '

  // Tag count
  view.setUint32(128, 3);

  // Tag entries (rTRC, gTRC, bTRC — all share same offset)
  const tagSigs = [0x72545243, 0x67545243, 0x62545243]; // rTRC, gTRC, bTRC
  for (let i = 0; i < 3; i++) {
    const base = 132 + i * 12;
    view.setUint32(base, tagSigs[i]);
    view.setUint32(base + 4, tagDataOffset);
    view.setUint32(base + 8, tagSize);
  }

  // para tag body at tagDataOffset
  bytes[tagDataOffset] = 0x70; // 'p'
  bytes[tagDataOffset + 1] = 0x61; // 'a'
  bytes[tagDataOffset + 2] = 0x72; // 'r'
  bytes[tagDataOffset + 3] = 0x61; // 'a'
  view.setUint16(tagDataOffset + 8, fnType);
  for (let i = 0; i < Math.min(params.length, paramCount); i++) {
    setS15Fixed16(view, tagDataOffset + 12 + i * 4, params[i]);
  }

  return new Uint8Array(buf);
}

function setS15Fixed16(view: DataView, offset: number, value: number): void {
  const intPart = Math.trunc(value);
  const fracPart = value - intPart;
  const raw = (intPart << 16) | Math.round(fracPart * 0x10000);
  view.setInt32(offset, raw);
}

// ─── sampleParametricCurve unit tests ────────────────────────────────────────

describe('sampleParametricCurve — ICC v4 para types', () => {
  // sRGB-like type 3 params: g=2.4, a=1/1.055, b=0.055/1.055, c=1/12.92, d=0.04045
  const srgbG = 2.4;
  const srgbA = 1 / 1.055;
  const srgbB = 0.055 / 1.055;
  const srgbC = 1 / 12.92;
  const srgbD = 0.04045;

  it('T1 — type 0: Y = x^g', () => {
    const y = sampleParametricCurve(0, [2.2], 0.5);
    expect(y).toBeCloseTo(Math.pow(0.5, 2.2), 8);
  });

  it('T2 — type 3: at x=0 returns 0', () => {
    const y = sampleParametricCurve(3, [srgbG, srgbA, srgbB, srgbC, srgbD], 0);
    expect(y).toBeCloseTo(0, 6);
  });

  it('T3 — type 3: at x=1 returns 1', () => {
    const y = sampleParametricCurve(3, [srgbG, srgbA, srgbB, srgbC, srgbD], 1);
    expect(y).toBeCloseTo(1, 6);
  });

  it('T4 — type 3: below threshold d uses cX (linear segment)', () => {
    const x = srgbD / 2; // well below threshold
    const y = sampleParametricCurve(3, [srgbG, srgbA, srgbB, srgbC, srgbD], x);
    expect(y).toBeCloseTo(srgbC * x, 8);
  });

  it('T5 — type 3: above threshold d uses (aX+b)^g (power segment)', () => {
    const x = 0.5; // well above threshold 0.04045
    const y = sampleParametricCurve(3, [srgbG, srgbA, srgbB, srgbC, srgbD], x);
    expect(y).toBeCloseTo(Math.pow(srgbA * x + srgbB, srgbG), 8);
  });
});

// ─── parseParaTag integration test ───────────────────────────────────────────

describe('parseIccProfile — para tag integration', () => {
  it('T6 — type 3 para tag produces TrcCurve { kind: lut }', () => {
    const srgbParams = [2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045];
    const profile = parseIccProfile(buildParaProfile(3, srgbParams));
    const trc = profile.trc?.[0];
    expect(trc?.kind).toBe('lut');
  });

  it('T7 — type 1 para tag (g, a, b) produces TrcCurve { kind: lut }', () => {
    // type 1: Y = (aX+b)^g if X ≥ -b/a, else 0  — params: [g, a, b]
    const profile = parseIccProfile(buildParaProfile(1, [2.2, 0.9, 0.0]));
    const trc = profile.trc?.[0];
    expect(trc?.kind).toBe('lut');
    if (trc?.kind === 'lut') {
      expect(trc.values.length).toBe(1024);
      // x=1: Y = (0.9*1+0.0)^2.2 ≈ 0.9^2.2 ≈ 0.811
      expect(trc.values[1023]).toBeCloseTo(Math.pow(0.9, 2.2), 3);
    }
  });

  it('T8 — type 2 para tag (g, a, b, c) produces TrcCurve { kind: lut }', () => {
    // type 2: Y = (aX+b)^g + c if X ≥ -b/a, else c  — params: [g, a, b, c]
    const c = 0.1;
    const profile = parseIccProfile(buildParaProfile(2, [2.2, 1.0, 0.0, c]));
    const trc = profile.trc?.[0];
    expect(trc?.kind).toBe('lut');
    if (trc?.kind === 'lut') {
      expect(trc.values.length).toBe(1024);
      // x=0: threshold = -b/a = 0; x=0 ≥ 0, so Y = (1.0*0+0)^2.2 + 0.1 = 0.1
      expect(trc.values[0]).toBeCloseTo(c, 4);
    }
  });

  it('T9 — type 4 para tag (g, a, b, c, d, e, f) produces TrcCurve { kind: lut }', () => {
    // type 4: Y = (aX+b)^g+e if X ≥ d, else cX+f  — params: [g, a, b, c, d, e, f]
    const f = 0.05;
    const profile = parseIccProfile(
      buildParaProfile(4, [2.2, 0.9, 0.0, 0.08, 0.04, 0.0, f]),
    );
    const trc = profile.trc?.[0];
    expect(trc?.kind).toBe('lut');
    if (trc?.kind === 'lut') {
      expect(trc.values.length).toBe(1024);
      // x=0: x < d (0.04), so Y = c*0 + f = 0.05
      expect(trc.values[0]).toBeCloseTo(f, 4);
    }
  });
});

describe('parseIccProfile — sRGB round-trip', () => {
  it('parses colorSpace as RGB', () => {
    const profile = parseIccProfile(buildSrgbProfileBytes());
    expect(profile.colorSpace).toBe('RGB');
  });

  it('parses PCS as XYZ', () => {
    const profile = parseIccProfile(buildSrgbProfileBytes());
    expect(profile.pcs).toBe('XYZ');
  });

  it('parses name as sRGB IEC61966-2.1', () => {
    const profile = parseIccProfile(buildSrgbProfileBytes());
    expect(profile.name).toBe('sRGB IEC61966-2.1');
  });

  it('parses renderingIntent as 0 (perceptual)', () => {
    const profile = parseIccProfile(buildSrgbProfileBytes());
    expect(profile.renderingIntent).toBe(0);
  });

  it('parses D50 white point within tolerance', () => {
    const profile = parseIccProfile(buildSrgbProfileBytes());
    expect(profile.whitePoint.x).toBeCloseTo(0.9642, 3);
    expect(profile.whitePoint.y).toBeCloseTo(1.0, 3);
    expect(profile.whitePoint.z).toBeCloseTo(0.8249, 3);
  });

  it('parses rXYZ primary within tolerance', () => {
    const profile = parseIccProfile(buildSrgbProfileBytes());
    expect(profile.matrix?.r.x).toBeCloseTo(0.4361, 3);
    expect(profile.matrix?.r.y).toBeCloseTo(0.2225, 3);
    expect(profile.matrix?.r.z).toBeCloseTo(0.0139, 3);
  });

  it('parses gXYZ primary within tolerance', () => {
    const profile = parseIccProfile(buildSrgbProfileBytes());
    expect(profile.matrix?.g.x).toBeCloseTo(0.3851, 3);
    expect(profile.matrix?.g.y).toBeCloseTo(0.7169, 3);
    expect(profile.matrix?.g.z).toBeCloseTo(0.0971, 3);
  });

  it('parses bXYZ primary within tolerance', () => {
    const profile = parseIccProfile(buildSrgbProfileBytes());
    expect(profile.matrix?.b.x).toBeCloseTo(0.1431, 3);
    expect(profile.matrix?.b.y).toBeCloseTo(0.0606, 3);
    expect(profile.matrix?.b.z).toBeCloseTo(0.7141, 3);
  });

  it('parses rTRC as gamma ≈ 2.2', () => {
    const profile = parseIccProfile(buildSrgbProfileBytes());
    const trc = profile.trc?.[0];
    expect(trc?.kind).toBe('gamma');
    if (trc?.kind === 'gamma') {
      expect(trc.gamma).toBeCloseTo(2.2, 1);
    }
  });

  it('parses all three TRC curves as gamma type', () => {
    const profile = parseIccProfile(buildSrgbProfileBytes());
    expect(profile.trc?.[0].kind).toBe('gamma');
    expect(profile.trc?.[1].kind).toBe('gamma');
    expect(profile.trc?.[2].kind).toBe('gamma');
  });

  it('preserves raw bytes for PDF embedding', () => {
    const bytes = buildSrgbProfileBytes();
    const profile = parseIccProfile(bytes);
    expect(profile.bytes.byteLength).toBe(bytes.byteLength);
    expect(profile.bytes[36]).toBe(0x61); // acsp
  });

  it('throws on truncated input', () => {
    expect(() => parseIccProfile(new Uint8Array(10))).toThrow();
  });

  it('throws on wrong ICC signature', () => {
    const bytes = buildSrgbProfileBytes().slice();
    bytes[36] = 0x00; // corrupt 'a' in 'acsp'
    expect(() => parseIccProfile(bytes)).toThrow();
  });
});
