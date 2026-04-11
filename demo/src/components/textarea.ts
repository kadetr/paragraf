// demo/src/components/textarea.ts

export interface TextareaOptions {
  label: string;
  value: string;
  maxLength: number;
  debounceMs?: number;
  onChange: (text: string) => void;
}

export interface TextareaHandle {
  el: HTMLElement;
  getText(): string;
  setText(v: string): void;
}

export function createTextarea(opts: TextareaOptions): TextareaHandle {
  const debounceMs = opts.debounceMs ?? 300;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const wrapper = document.createElement('div');
  wrapper.className = 'textarea-wrapper';

  const labelEl = document.createElement('label');
  labelEl.className = 'textarea-label';

  const labelText = document.createElement('span');
  labelText.textContent = opts.label;

  const ta = document.createElement('textarea');
  ta.value = opts.value;
  ta.spellcheck = false;

  const counter = document.createElement('span');
  counter.className = 'char-counter';
  counter.textContent = `${opts.value.length} / ${opts.maxLength}`;

  ta.addEventListener('input', () => {
    counter.textContent = `${ta.value.length} / ${opts.maxLength}`;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      opts.onChange(ta.value);
    }, debounceMs);
  });

  labelEl.appendChild(labelText);
  labelEl.appendChild(ta);
  wrapper.appendChild(labelEl);
  wrapper.appendChild(counter);

  return {
    el: wrapper,
    getText() {
      return ta.value;
    },
    setText(v: string) {
      ta.value = v;
      counter.textContent = `${v.length} / ${opts.maxLength}`;
    },
  };
}
