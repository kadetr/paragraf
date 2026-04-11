// demo/src/components/svg-preview.ts
// Container that displays an SVG string. Uses ResizeObserver to notify the
// parent when the available width changes so it can re-render.
// Not unit-tested (requires real browser layout engine).

export interface SvgPreviewOptions {
  onResize?: (width: number) => void;
}

export interface SvgPreviewHandle {
  el: HTMLElement;
  setSvg(svgString: string): void;
  clear(): void;
}

export function createSvgPreview(
  opts: SvgPreviewOptions = {},
): SvgPreviewHandle {
  const container = document.createElement('div');
  container.className = 'svg-preview';

  if (opts.onResize) {
    const cb = opts.onResize;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        cb(entry.contentRect.width);
      }
    });
    ro.observe(container);
  }

  return {
    el: container,
    setSvg(svgString: string) {
      container.innerHTML = svgString;
    },
    clear() {
      container.innerHTML = '';
    },
  };
}
