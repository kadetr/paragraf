import { describe, it, expect, vi } from 'vitest';
import { createSlider } from '../../src/components/slider.js';

describe('slider', () => {
  it('renders a <label> containing an <input type="range">', () => {
    const { el } = createSlider({
      label: 'Test',
      min: 0,
      max: 10,
      step: 1,
      value: 5,
      onChange: vi.fn(),
    });
    expect(el.querySelector('label')).toBeTruthy();
    const input = el.querySelector('input[type="range"]');
    expect(input).toBeTruthy();
  });

  it('initial value is set on the input', () => {
    const { el } = createSlider({
      label: 'Test',
      min: 0,
      max: 10,
      step: 1,
      value: 7,
      onChange: vi.fn(),
    });
    const input = el.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('7');
  });

  it('live display span shows value formatted with provided format fn', () => {
    const { el } = createSlider({
      label: 'Test',
      min: 0,
      max: 10,
      step: 1,
      value: 3,
      format: (v) => `${v} pt`,
      onChange: vi.fn(),
    });
    const span = el.querySelector('.slider-value') as HTMLElement;
    expect(span.textContent).toBe('3 pt');
  });

  it('onChange callback fires when input value changes', () => {
    const onChange = vi.fn();
    const { el } = createSlider({
      label: 'Test',
      min: 0,
      max: 10,
      step: 1,
      value: 5,
      onChange,
    });
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = '8';
    input.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith(8);
  });

  it('setValue() updates input.value and display span', () => {
    const { el, setValue } = createSlider({
      label: 'Test',
      min: 0,
      max: 10,
      step: 1,
      value: 5,
      onChange: vi.fn(),
    });
    setValue(9);
    const input = el.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('9');
    const span = el.querySelector('.slider-value') as HTMLElement;
    expect(span.textContent).toBe('9');
  });

  it('min/max/step are forwarded to input attributes', () => {
    const { el } = createSlider({
      label: 'Test',
      min: 2,
      max: 20,
      step: 0.5,
      value: 5,
      onChange: vi.fn(),
    });
    const input = el.querySelector('input') as HTMLInputElement;
    expect(input.min).toBe('2');
    expect(input.max).toBe('20');
    expect(input.step).toBe('0.5');
  });
});
