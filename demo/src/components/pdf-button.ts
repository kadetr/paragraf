// demo/src/components/pdf-button.ts
// "Download PDF" button. Not unit-tested (requires Blob + createObjectURL).

export interface PdfButtonOptions {
  label?: string;
  subtitle?: string;
  onDownload: () => Uint8Array | Promise<Uint8Array>;
}

export interface PdfButtonHandle {
  el: HTMLElement;
}

export function createPdfButton(opts: PdfButtonOptions): PdfButtonHandle {
  const label = opts.label ?? 'Download PDF';
  const subtitle =
    opts.subtitle ?? 'rendered via PDFKit — selectable text, embedded glyphs';

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
      const bytes = await opts.onDownload();
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: 'application/pdf',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'paragraf.pdf';
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
