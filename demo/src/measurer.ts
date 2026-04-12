// demo/src/measurer.ts
// createBrowserMeasurer — wraps the WASM measurement functions
// to produce a Measurer compatible with @paragraf/linebreak and @paragraf/render-core.

import type {
  Font,
  FontMetrics,
  Measurer,
  GlueSpaceMetrics,
  FontRegistry,
} from '@paragraf/compile';
import {
  measure_text_wasm,
  space_metrics_wasm,
  font_metrics_wasm,
} from '../../2a-shaping-wasm/wasm/pkg-bundler/knuth_plass_wasm.js';

export function createBrowserMeasurer(registry: FontRegistry): Measurer {
  return {
    measure(content: string, font: Font): number {
      const raw = JSON.parse(measure_text_wasm(content, JSON.stringify(font)));
      if ('error' in raw) throw new Error(`measure_text_wasm: ${raw.error}`);
      return raw.ok.width as number;
    },
    space(font: Font): GlueSpaceMetrics {
      const raw = JSON.parse(space_metrics_wasm(JSON.stringify(font)));
      if ('error' in raw) throw new Error(`space_metrics_wasm: ${raw.error}`);
      return raw.ok as GlueSpaceMetrics;
    },
    metrics(font: Font): FontMetrics {
      const raw = JSON.parse(font_metrics_wasm(JSON.stringify(font)));
      if ('error' in raw) throw new Error(`font_metrics_wasm: ${raw.error}`);
      return raw.ok as FontMetrics;
    },
    registry,
  };
}
