// units.ts — unit converters. All functions return points (pt).
// 1 inch = 72 pt. 1 mm = 72/25.4 pt. 1 cm = 10 mm.

const PT_PER_MM = 72 / 25.4; // ≈ 2.834645669291339
const PT_PER_CM = 72 / 2.54; // ≈ 28.34645669291339
const PT_PER_INCH = 72;

/** Millimetres → points. */
export function mm(value: number): number {
  return value * PT_PER_MM;
}

/** Centimetres → points. */
export function cm(value: number): number {
  return value * PT_PER_CM;
}

/** Inches → points. */
export function inch(value: number): number {
  return value * PT_PER_INCH;
}

/**
 * Pixels → points.
 * @param value   Pixel count.
 * @param dpi     Screen/print resolution in dots per inch. Defaults to 96 (CSS pixel).
 */
export function px(value: number, dpi: number = 96): number {
  return (value * PT_PER_INCH) / dpi;
}
