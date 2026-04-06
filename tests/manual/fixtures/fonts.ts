// manual/fixtures/fonts.ts
// Font registry builders shared across all MT scripts.
// All font files are expected at the monorepo root fonts/ directory.

import * as path from 'path';
import { fileURLToPath } from 'url';
import type { FontRegistry, Font } from '@paragraf/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FONTS_DIR = path.resolve(__dirname, '../../../fonts');

// ─── Registry builders ────────────────────────────────────────────────────────

/** Serif registry: LiberationSerif Regular/Bold/Italic. Default for most tests. */
export const serifRegistry = (): FontRegistry =>
  new Map([
    [
      'serif-regular',
      {
        id: 'serif-regular',
        family: 'Liberation Serif',
        filePath: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
      },
    ],
    [
      'serif-bold',
      {
        id: 'serif-bold',
        family: 'Liberation Serif Bold',
        filePath: path.join(FONTS_DIR, 'LiberationSerif-Bold.ttf'),
      },
    ],
    [
      'serif-italic',
      {
        id: 'serif-italic',
        family: 'Liberation Serif Italic',
        filePath: path.join(FONTS_DIR, 'LiberationSerif-Italic.ttf'),
      },
    ],
  ]);

/** Hebrew registry: NotoSansHebrew. Used by MT-02. */
export const hebrewRegistry = (): FontRegistry =>
  new Map([
    [
      'hebrew-regular',
      {
        id: 'hebrew-regular',
        family: 'Noto Sans Hebrew',
        filePath: path.join(FONTS_DIR, 'NotoSansHebrew-Regular.ttf'),
      },
    ],
  ]);

/** Arabic registry: NotoSansArabic. Used by MT-03. */
export const arabicRegistry = (): FontRegistry =>
  new Map([
    [
      'arabic-regular',
      {
        id: 'arabic-regular',
        family: 'Noto Sans Arabic',
        filePath: path.join(FONTS_DIR, 'NotoSansArabic-Regular.ttf'),
      },
    ],
  ]);

/** Full registry: serif + hebrew + arabic. Used by document/multi-font tests. */
export const fullRegistry = (): FontRegistry =>
  new Map([...serifRegistry(), ...hebrewRegistry(), ...arabicRegistry()]);

// ─── Font object helpers ──────────────────────────────────────────────────────

export const font = (
  id: string,
  size: number,
  extra?: Partial<Font>,
): Font => ({
  id,
  size,
  weight: id.includes('bold') ? 700 : 400,
  style: id.includes('italic') ? 'italic' : 'normal',
  stretch: 'normal',
  ...extra,
});

// Commonly-used font objects
export const F12 = font('serif-regular', 12);
export const F12B = font('serif-bold', 12);
export const F12I = font('serif-italic', 12);
export const F10 = font('serif-regular', 10);
export const F18B = font('serif-bold', 18);
export const F8SUP = font('serif-regular', 8, { variant: 'superscript' });
export const F8SUB = font('serif-regular', 8, { variant: 'subscript' });
export const F12HE = font('hebrew-regular', 12);
export const F12AR = font('arabic-regular', 12);
