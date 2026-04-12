import { describe, it, expect, vi } from 'vitest';
import { createToggleGroup } from '../../src/components/toggle-group.js';

describe('toggle-group', () => {
  it('renders one <button> per option', () => {
    const { el } = createToggleGroup({
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
        { label: 'C', value: 'c' },
      ],
      value: 'a',
      onChange: vi.fn(),
    });
    expect(el.querySelectorAll('button').length).toBe(3);
  });

  it('initially selected option has aria-pressed="true"', () => {
    const { el } = createToggleGroup({
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
      value: 'b',
      onChange: vi.fn(),
    });
    const buttons = el.querySelectorAll('button');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking another option changes aria-pressed and fires onChange', () => {
    const onChange = vi.fn();
    const { el } = createToggleGroup({
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
      value: 'a',
      onChange,
    });
    const buttons = el.querySelectorAll<HTMLButtonElement>('button');
    buttons[1].click();
    expect(onChange).toHaveBeenCalledWith('b');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking already-selected option is a no-op (no re-fire)', () => {
    const onChange = vi.fn();
    const { el } = createToggleGroup({
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
      value: 'a',
      onChange,
    });
    const buttons = el.querySelectorAll<HTMLButtonElement>('button');
    buttons[0].click();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('setValue() changes selected option without firing onChange', () => {
    const onChange = vi.fn();
    const { el, setValue } = createToggleGroup({
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
      value: 'a',
      onChange,
    });
    setValue('b');
    expect(onChange).not.toHaveBeenCalled();
    const buttons = el.querySelectorAll('button');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('getValue() returns the currently selected option value', () => {
    const { getValue, setValue } = createToggleGroup({
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
      value: 'a',
      onChange: vi.fn(),
    });
    expect(getValue()).toBe('a');
    setValue('b');
    expect(getValue()).toBe('b');
  });
});
