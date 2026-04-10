// sizes.ts — named page sizes and resolution helpers.
// All dimensions in points (pt). Width × Height.

/** Named page size → [width, height] in points. */
export const PAGE_SIZES = {
  // ISO A-series
  A0: [2383.94, 3370.39] as [number, number],
  A1: [1683.78, 2383.94] as [number, number],
  A2: [1190.55, 1683.78] as [number, number],
  A3: [841.89, 1190.55] as [number, number],
  A4: [595.28, 841.89] as [number, number],
  A5: [419.53, 595.28] as [number, number],
  A6: [297.64, 419.53] as [number, number],
  // ISO B-series
  B4: [708.66, 1000.63] as [number, number],
  B5: [498.9, 708.66] as [number, number],
  // SRA (bleed paper — common in European commercial print)
  SRA3: [907.09, 1275.59] as [number, number],
  SRA4: [637.8, 907.09] as [number, number],
  // North American
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
  const result = (PAGE_SIZES as Record<string, [number, number] | undefined>)[
    size
  ];
  if (result === undefined)
    throw new Error(
      `Unknown page size: "${String(size)}" — valid sizes: ${Object.keys(PAGE_SIZES).join(', ')}`,
    );
  return result;
}

/**
 * Return the size in landscape orientation (wider side as width).
 * If the size is already landscape (or square), it is returned unchanged.
 */
export function landscape(size: PageSize): [number, number] {
  const [w, h] = resolvePageSize(size);
  return w >= h ? [w, h] : [h, w];
}

/**
 * Return the size in portrait orientation (taller side as height).
 * If the size is already portrait (or square), it is returned unchanged.
 */
export function portrait(size: PageSize): [number, number] {
  const [w, h] = resolvePageSize(size);
  return h >= w ? [w, h] : [h, w];
}
