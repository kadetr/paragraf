// demo/src/components/slider.ts

export interface SliderOptions {
  label: string;
  description?: string; // shown as custom tooltip/help text on the label
  highlight?: boolean; // light-blue accent background (KP-specific controls)
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (v: number) => string;
  onChange: (value: number) => void;
}

export interface SliderHandle {
  el: HTMLElement;
  getValue(): number;
  setValue(v: number): void;
}

export function createSlider(opts: SliderOptions): SliderHandle {
  const fmt = opts.format ?? String;

  const wrapper = document.createElement('div');
  wrapper.className = opts.highlight
    ? 'slider-wrapper slider-wrapper--highlight'
    : 'slider-wrapper';

  const labelEl = document.createElement('label');
  labelEl.className = 'slider-label';

  const labelText = document.createElement('span');
  labelText.className = 'slider-label-text';
  labelText.textContent = opts.label;
  if (opts.description) {
    labelText.classList.add('slider-label-tip');
    const tipText = document.createElement('span');
    tipText.className = 'slider-tip-text';
    tipText.textContent = opts.description;
    labelText.appendChild(tipText);
  }

  const valueSpan = document.createElement('span');
  valueSpan.className = 'slider-value';
  valueSpan.textContent = fmt(opts.value);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(opts.min);
  input.max = String(opts.max);
  input.step = String(opts.step);
  input.value = String(opts.value);

  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    valueSpan.textContent = fmt(v);
    opts.onChange(v);
  });

  labelEl.appendChild(labelText);
  labelEl.appendChild(valueSpan);
  labelEl.appendChild(input);
  wrapper.appendChild(labelEl);

  return {
    el: wrapper,
    getValue() {
      return parseFloat(input.value);
    },
    setValue(v: number) {
      input.value = String(v);
      valueSpan.textContent = fmt(v);
    },
  };
}
