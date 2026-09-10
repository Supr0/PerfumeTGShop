import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Toast, TOAST_CLOSE_MS, TOAST_DURATION_MS } from './feedback';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Toast auto-dismiss', () => {
  it('should render animated without the closing state on mount', () => {
    render(<Toast message="hello" />);
    const toast = screen.getByRole('status');
    expect(toast).toHaveClass('fd-toast');
    expect(toast).not.toHaveClass('fd-toast--closing');
    expect(toast).toHaveTextContent('hello');
  });

  it('should enter the closing state after the duration, then call onClose after the exit window', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Toast message="hello" onClose={onClose} />);
    expect(screen.getByRole('status')).not.toHaveClass('fd-toast--closing');
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS);
    });
    // exit animation window: still mounted, closing class applied, onClose deferred
    expect(screen.getByRole('status')).toHaveClass('fd-toast--closing');
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(TOAST_CLOSE_MS);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('should respect a custom durationMs', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Toast message="hello" durationMs={1000} onClose={onClose} />);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(screen.getByRole('status')).not.toHaveClass('fd-toast--closing');
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1 + TOAST_CLOSE_MS);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should self-hide without onClose so existing callers dismiss unchanged', () => {
    vi.useFakeTimers();
    render(<Toast message="hello" />);
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS + TOAST_CLOSE_MS);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('should clear timers on unmount and never call onClose after', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { unmount } = render(<Toast message="hello" onClose={onClose} />);
    unmount();
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS + TOAST_CLOSE_MS + 5000);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('should reset the timer on a new message with a single onClose showing the latest text', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { rerender } = render(<Toast message="first" onClose={onClose} />);
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS - 500);
    });
    // re-trigger before the first timer fires: content swaps, timer restarts, no closing state
    rerender(<Toast message="second" onClose={onClose} />);
    expect(screen.getByRole('status')).toHaveTextContent('second');
    expect(screen.getByRole('status')).not.toHaveClass('fd-toast--closing');
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS - 500);
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('second');
    act(() => {
      vi.advanceTimersByTime(500 + TOAST_CLOSE_MS);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('should dismiss without the exit-animation wait when reduced motion is preferred', () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
    );
    const onClose = vi.fn();
    render(<Toast message="hello" onClose={onClose} />);
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
