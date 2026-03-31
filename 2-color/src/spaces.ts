/** All channel values are normalized to [0, 1]. */

export interface RGBColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface CMYKColor {
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
}

export interface LabColor {
  /** L* in [0, 100] */
  readonly L: number;
  /** a* typically in [-128, 127] */
  readonly a: number;
  /** b* typically in [-128, 127] */
  readonly b: number;
}

export interface GrayColor {
  readonly gray: number;
}

export type RenderingIntent =
  | 'perceptual'
  | 'relative'
  | 'saturation'
  | 'absolute';

/** Tagged color: source value + the result of an ICC transform, plus profile bytes for PDF/X embedding. */
export interface TaggedColor {
  /** Original device-RGB source value (pre-transform). */
  source: RGBColor;
  /** Result after applying the ICC transform. null if no transform is active. */
  transformed: CMYKColor | RGBColor | GrayColor | null;
  /** Raw ICC profile bytes — embedded in PDF OutputIntent. */
  profileBytes: Uint8Array;
}
