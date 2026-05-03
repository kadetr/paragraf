// Color space types and rendering intent
export type {
  RGBColor,
  CMYKColor,
  LabColor,
  GrayColor,
  RenderingIntent,
  TaggedColor,
} from './spaces.js';

// Profile types and parsing
export type {
  ColorProfile,
  ColorSpace,
  PcsSpace,
  TrcCurve,
  XYZValue,
  Mft2Tag,
} from './profile.js';
export {
  parseIccProfile,
  loadProfile,
  sampleParametricCurve,
} from './profile.js';

// Built-in sRGB profile
export { buildSrgbProfileBytes, loadBuiltinSrgb } from './srgb.js';

// LUT interpolation (exposed for testing / advanced use)
export { eval1DCurve, evalClutTetrahedral, evalLutMft2 } from './lut.js';

// Transform engine
export type { ColorTransform } from './transform.js';
export { createTransform, applyTrcForward, xyzToIccLab } from './transform.js';

// ColorManager
export type { ColorManager, OutputIntent } from './manager.js';
export { createColorManager } from './manager.js';
