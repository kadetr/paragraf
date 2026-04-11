// demo/src/components/toggle-group.ts

export interface ToggleOption<T extends string> {
  label: string;
  value: T;
}

export interface ToggleGroupOptions<T extends string> {
  options: ToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export interface ToggleGroupHandle<T extends string> {
  el: HTMLElement;
  getValue(): T;
  setValue(v: T): void;
}

export function createToggleGroup<T extends string>(
  opts: ToggleGroupOptions<T>,
): ToggleGroupHandle<T> {
  let current = opts.value;

  const wrapper = document.createElement('div');
  wrapper.className = 'toggle-group';
  wrapper.setAttribute('role', 'group');

  const buttons = opts.options.map((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.label;
    btn.dataset['value'] = opt.value;
    btn.setAttribute('aria-pressed', String(opt.value === current));

    btn.addEventListener('click', () => {
      if (opt.value === current) return;
      current = opt.value;
      updatePressed();
      opts.onChange(current);
    });

    wrapper.appendChild(btn);
    return btn;
  });

  function updatePressed(): void {
    buttons.forEach((btn) => {
      btn.setAttribute(
        'aria-pressed',
        String(btn.dataset['value'] === current),
      );
    });
  }

  return {
    el: wrapper,
    getValue() {
      return current;
    },
    setValue(v: T) {
      current = v;
      updatePressed();
    },
  };
}
