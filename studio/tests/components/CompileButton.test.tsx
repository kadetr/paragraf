// CompileButton.test.tsx — RT12–RT14

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CompileButton } from '../../src/components/CompileButton.js';

describe('CompileButton (RT12–RT14)', () => {
  beforeEach(() => {
    // Provide a window.studio mock
    (
      window as Window & {
        studio?: { triggerPdfCompile: ReturnType<typeof vi.fn> };
      }
    ).studio = {
      triggerPdfCompile: vi.fn().mockResolvedValue(null),
    };
  });

  it('RT12 — button is enabled when not compiling and no errors', () => {
    render(<CompileButton isCompiling={false} hasErrors={false} />);
    const btn = screen.getByTestId('compile-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('RT13 — button is disabled when isCompiling is true', () => {
    render(<CompileButton isCompiling={true} hasErrors={false} />);
    const btn = screen.getByTestId('compile-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('RT14 — click calls window.studio.triggerPdfCompile() exactly once', () => {
    render(<CompileButton isCompiling={false} hasErrors={false} />);
    const btn = screen.getByTestId('compile-button');
    fireEvent.click(btn);
    const mock = (
      window as Window & {
        studio?: { triggerPdfCompile: ReturnType<typeof vi.fn> };
      }
    ).studio?.triggerPdfCompile;
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
