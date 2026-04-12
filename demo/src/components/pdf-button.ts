// demo/src/components/pdf-button.ts
// Download button for rendered output. Not unit-tested (requires Blob + createObjectURL).

export interface PdfButtonOptions {
  label?: string;
  subtitle?: string;
  mimeType?: string;
  filename?: string;
  onDownload: () => Uint8Array | string | Promise<Uint8Array | string>;
}

export interface PdfButtonHandle {
  el: HTMLElement;
}

export function createPdfButton(opts: PdfButtonOptions): PdfButtonHandle {
  const label = opts.label ?? 'Download';
  const subtitle = opts.subtitle ?? '';
  const mimeType = opts.mimeType ?? 'application/octet-stream';
  const filename = opts.filename ?? 'download';

  const wrapper = document.createElement('div');
  wrapper.className = 'pdf-button-wrapper';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pdf-button';
  btn.textContent = label;

  const sub = document.createElement('span');
  sub.className = 'pdf-button-subtitle';
  sub.textContent = subtitle;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const result = await opts.onDownload();
      const blobPart =
        typeof result === 'string'
          ? result
          : (result as Uint8Array<ArrayBuffer>);
      const blob = new Blob([blobPart], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      btn.disabled = false;
    }
  });

  wrapper.appendChild(btn);
  wrapper.appendChild(sub);

  return { el: wrapper };
}
