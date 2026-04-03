// demo/src/fonts.ts
// Available fonts for the demo — each one ships as a TTF in /fonts/.

export interface FontOption {
  id: string;
  fileName: string;
  family: string; // CSS font-family name used for FontFace registration
  label: string; // display label in the <select>
}

export const FONTS: readonly FontOption[] = [
  {
    id: 'roboto',
    fileName: 'Roboto-Regular.ttf',
    family: 'Roboto',
    label: 'Roboto',
  },
  {
    id: 'liberation-serif',
    fileName: 'LiberationSerif-Regular.ttf',
    family: 'Liberation Serif',
    label: 'Liberation Serif',
  },
  {
    id: 'liberation-sans',
    fileName: 'LiberationSans-Regular.ttf',
    family: 'Liberation Sans',
    label: 'Liberation Sans',
  },
  {
    id: 'liberation-mono',
    fileName: 'LiberationMono-Regular.ttf',
    family: 'Liberation Mono',
    label: 'Liberation Mono',
  },
];
