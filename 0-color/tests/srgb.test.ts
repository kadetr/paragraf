import { describe, it, expect } from 'vitest';
import { buildSrgbProfileBytes } from '../src/srgb';
import { parseIccProfile } from '../src/profile';

const TOTAL_SIZE = 420;

describe('buildSrgbProfileBytes', () => {
  it('has acsp ICC signature at offset 36', () => {
    const bytes = buildSrgbProfileBytes();
    expect(bytes[36]).toBe(0x61); // 'a'
    expect(bytes[37]).toBe(0x63); // 'c'
    expect(bytes[38]).toBe(0x73); // 's'
    expect(bytes[39]).toBe(0x70); // 'p'
  });

  it('has correct total byte length', () => {
    const bytes = buildSrgbProfileBytes();
    expect(bytes.byteLength).toBe(TOTAL_SIZE);
  });

  it('encodes profile size in the first 4 bytes', () => {
    const bytes = buildSrgbProfileBytes();
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect(view.getUint32(0)).toBe(TOTAL_SIZE);
  });

  it('has RGB color space signature at offset 16', () => {
    const bytes = buildSrgbProfileBytes();
    const cs = String.fromCharCode(bytes[16], bytes[17], bytes[18], bytes[19]);
    expect(cs).toBe('RGB ');
  });

  it('has XYZ PCS signature at offset 20', () => {
    const bytes = buildSrgbProfileBytes();
    const pcs = String.fromCharCode(bytes[20], bytes[21], bytes[22], bytes[23]);
    expect(pcs).toBe('XYZ ');
  });

  it('has monitor device class at offset 12', () => {
    const bytes = buildSrgbProfileBytes();
    const dc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    expect(dc).toBe('mntr');
  });

  it('has 8 tags in tag count field', () => {
    const bytes = buildSrgbProfileBytes();
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect(view.getUint32(128)).toBe(8);
  });

  it('has desc tag as first entry in tag directory', () => {
    const bytes = buildSrgbProfileBytes();
    const sig = String.fromCharCode(
      bytes[132],
      bytes[133],
      bytes[134],
      bytes[135],
    );
    expect(sig).toBe('desc');
  });

  it('encodes mluc type signature in desc tag data', () => {
    const bytes = buildSrgbProfileBytes();
    // desc tag offset is at bytes 136-139 in tag directory entry 0
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const descOffset = view.getUint32(136);
    const mluc = String.fromCharCode(
      bytes[descOffset],
      bytes[descOffset + 1],
      bytes[descOffset + 2],
      bytes[descOffset + 3],
    );
    expect(mluc).toBe('mluc');
  });

  it('encodes profile version 4.0 at offset 8', () => {
    const bytes = buildSrgbProfileBytes();
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    // ICC v4.0 = 0x04000000
    expect(view.getUint32(8)).toBe(0x04000000);
  });
});

// ─── buildSrgbProfileBytes — round-trip ───────────────────────────────────────

describe('buildSrgbProfileBytes — round-trip', () => {
  it('parseIccProfile preserves all bytes unchanged — byte-exact round-trip', () => {
    const original = buildSrgbProfileBytes();
    const profile = parseIccProfile(original);
    // profile.bytes must be the exact same Uint8Array (reference equality)
    // because parseIccProfile stores the input directly — no copy
    expect(profile.bytes).toBe(original);
  });

  it('round-tripped bytes are suitable for PDF embedding — all 420 bytes present', () => {
    const original = buildSrgbProfileBytes();
    const profile = parseIccProfile(original);
    expect(profile.bytes.byteLength).toBe(original.byteLength);
  });

  it('round-tripped profile retains ICC signature at byte 36', () => {
    const profile = parseIccProfile(buildSrgbProfileBytes());
    // 'a','c','s','p' = 0x61, 0x63, 0x73, 0x70
    expect(profile.bytes[36]).toBe(0x61);
    expect(profile.bytes[37]).toBe(0x63);
    expect(profile.bytes[38]).toBe(0x73);
    expect(profile.bytes[39]).toBe(0x70);
  });
});
