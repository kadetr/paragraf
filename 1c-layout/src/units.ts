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

/**
 * A dimension value: either a number (already in points) or a string with a
 * unit suffix — '20mm', '2cm', '0.5in', '100px', '36pt'.
 * Use parseDimension() to resolve to points before passing to layout APIs.
 */
export type Dimension = number | string;

/**
 * Resolve a Dimension to points.
 * - number → pass-through (already in points)
 * - '20mm' → mm(20), '2cm' → cm(2), '0.5in' → inch(0.5), '100px' → px(100), '36pt' → 36
 * @throws if the string format is unrecognised
 */
export function parseDimension(d: Dimension): number {
  if (typeof d === 'number') return d;
  const m = d.trim().match(/^(-?[\d.]+)(mm|cm|in|pt|px)$/i);
  if (!m)
    throw new Error(
      `Unrecognised dimension: "${d}" — expected format like "20mm", "2cm", "0.5in", "36pt", "100px"`,
    );
  const value = parseFloat(m[1]);
  switch (m[2].toLowerCase()) {
    case 'mm':
      return mm(value);
    case 'cm':
      return cm(value);
    case 'in':
      return inch(value);
    case 'pt':
      return value;
    case 'px':
      return px(value);
    default:
      throw new Error(`Unknown unit: "${m[2]}"`);
  }
}
