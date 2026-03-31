import { describe, it, expect } from 'vitest';
import { parseIccProfile } from '../src/profile';
import { buildSrgbProfileBytes } from '../src/srgb';

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
