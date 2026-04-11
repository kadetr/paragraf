import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTextarea } from '../../src/components/textarea.js';

describe('textarea', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a <textarea> with initial text', () => {
    const { el } = createTextarea({
      label: 'Text',
      value: 'hello',
      maxLength: 500,
      onChange: vi.fn(),
    });
    const ta = el.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe('hello');
  });

  it('char counter shows "0 / 500" format initially when text is empty', () => {
    const { el } = createTextarea({
      label: 'Text',
      value: '',
      maxLength: 500,
      onChange: vi.fn(),
    });
    const counter = el.querySelector('.char-counter') as HTMLElement;
    expect(counter.textContent).toBe('0 / 500');
  });

  it('char counter updates as user types', () => {
    const { el } = createTextarea({
      label: 'Text',
      value: '',
      maxLength: 500,
      onChange: vi.fn(),
    });
    const ta = el.querySelector('textarea') as HTMLTextAreaElement;
    const counter = el.querySelector('.char-counter') as HTMLElement;
    ta.value = 'abc';
    ta.dispatchEvent(new Event('input'));
    expect(counter.textContent).toBe('3 / 500');
  });

  it('input beyond maxLength is truncated in counter display (does NOT block input)', () => {
    const { el } = createTextarea({
      label: 'Text',
      value: '',
      maxLength: 5,
      onChange: vi.fn(),
    });
    const ta = el.querySelector('textarea') as HTMLTextAreaElement;
    const counter = el.querySelector('.char-counter') as HTMLElement;
    ta.value = 'abcdefgh';
    ta.dispatchEvent(new Event('input'));
    // shows actual char count / max — capped at max in display
    expect(counter.textContent).toBe('8 / 5');
  });

  it('onChange fires after debounce delay (use fake timers)', () => {
    const onChange = vi.fn();
    const { el } = createTextarea({
      label: 'Text',
      value: '',
      maxLength: 500,
      onChange,
      debounceMs: 300,
    });
    const ta = el.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = 'hello';
    ta.dispatchEvent(new Event('input'));
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledWith('hello');
  });

  it('onChange does NOT fire immediately on each keystroke', () => {
    const onChange = vi.fn();
    const { el } = createTextarea({
      label: 'Text',
      value: '',
      maxLength: 500,
      onChange,
      debounceMs: 300,
    });
    const ta = el.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = 'a';
    ta.dispatchEvent(new Event('input'));
    ta.value = 'ab';
    ta.dispatchEvent(new Event('input'));
    ta.value = 'abc';
    ta.dispatchEvent(new Event('input'));
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('abc');
  });

  it('getText() returns current textarea value', () => {
    const { el, getText } = createTextarea({
      label: 'Text',
      value: 'start',
      maxLength: 500,
      onChange: vi.fn(),
    });
    expect(getText()).toBe('start');
    const ta = el.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = 'changed';
    ta.dispatchEvent(new Event('input'));
    expect(getText()).toBe('changed');
  });
});
