import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { MoveActions } from '../../src/trainer/components/MoveActions';

const defaults = {
  hasPuzzle: true,
  submitted: false,
  bestRevealed: false,
  submitting: false,
  hasMove: false,
  onSubmit: vi.fn(),
  onReset: vi.fn(),
  onReveal: vi.fn(),
  onNext: vi.fn(),
  onUndo: vi.fn(),
  onShowShortcuts: vi.fn(),
};

describe('MoveActions', () => {
  it('keeps the best move toggle visible after reveal', () => {
    render(<MoveActions {...defaults} bestRevealed />);

    const toggle = screen.getByRole('button', { name: /trainer\.shortcuts\.hide_best/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.classList.contains('active')).toBe(true);

    fireEvent.click(toggle);
    expect(defaults.onReveal).toHaveBeenCalled();
  });

  it('shows the reveal label before the best move is revealed', () => {
    render(<MoveActions {...defaults} />);

    const toggle = screen.getByRole('button', { name: /trainer\.shortcuts\.show_best/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.classList.contains('active')).toBe(false);
  });
});
