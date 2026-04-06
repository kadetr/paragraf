// sizes.ts — named page sizes and resolution helpers.
// All dimensions in points (pt). Width × Height.

/** Named page size → [width, height] in points. */
export const PAGE_SIZES = {
  A3: [841.89, 1190.55] as [number, number],
  A4: [595.28, 841.89] as [number, number],
  A5: [419.53, 595.28] as [number, number],
  A6: [297.64, 419.53] as [number, number],
  B4: [708.66, 1000.63] as [number, number],
  B5: [498.9, 708.66] as [number, number],
  Letter: [612.0, 792.0] as [number, number],
  Legal: [612.0, 1008.0] as [number, number],
  Tabloid: [792.0, 1224.0] as [number, number],
} as const;

export type PageSizeName = keyof typeof PAGE_SIZES;

/** Named size string or explicit [width, height] tuple in points. */
export type PageSize = PageSizeName | [number, number];

/**
 * Resolve a PageSize to a concrete [width, height] tuple in points.
 * Pass-through for tuples; lookup for named sizes.
 */
export function resolvePageSize(size: PageSize): [number, number] {
  if (Array.isArray(size)) return size;
  return PAGE_SIZES[size];
}
