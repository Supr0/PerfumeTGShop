import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { VolumeSheet, VOLUME_SHEET_CLOSE_MS } from './VolumeSheet';
import type { Product } from './ProductCard';

const product: Product = {
  id: 1,
  name: 'Aventus',
  brand: 'Creed',
  description: null,
  variants: [
    { id: 11, volume_ml: 3, price_minor_uah: 39000, old_price_minor_uah: null, stock: 5 },
    { id: 12, volume_ml: 5, price_minor_uah: 59000, old_price_minor_uah: null, stock: 0 },
    { id: 13, volume_ml: 10, price_minor_uah: 99000, old_price_minor_uah: null, stock: 2 },
  ],
};

describe('VolumeSheet', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should render in-stock volumes with per-option prices and hide OOS', () => {
    render(<VolumeSheet product={product} onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /3\s?ml\s?—\s?390/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /10\s?ml\s?—\s?990/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /5\s?ml/i })).not.toBeInTheDocument();
  });

  it('should leave every option unchecked until tap (neutral pick)', () => {
    render(<VolumeSheet product={product} onPick={() => {}} onClose={() => {}} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThan(0);
    radios.forEach((radio) => expect(radio).toHaveAttribute('aria-checked', 'false'));
  });

  it('should render the open sheet without the closing state', () => {
    render(<VolumeSheet product={product} onPick={() => {}} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('fd-volume-sheet');
    expect(dialog).not.toHaveClass('fd-volume-sheet--closing');
    expect(dialog.querySelector('.fd-volume-sheet__body')).not.toBeNull();
  });

  it('should call onPick with exact ids on option select, then onClose after the close animation', () => {
    vi.useFakeTimers();
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<VolumeSheet product={product} onPick={onPick} onClose={onClose} />);
    fireEvent.click(screen.getByRole('radio', { name: /10\s?ml/i }));
    expect(onPick).toHaveBeenCalledWith(1, 13);
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(VOLUME_SHEET_CLOSE_MS);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should keep the sheet mounted during the close animation on Escape, then unmount and call onClose once', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      return open ? (
        <VolumeSheet
          product={product}
          onPick={() => {}}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      ) : null;
    }
    render(<Harness />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    // still mounted mid-animation, closing state applied, onClose deferred
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveClass('fd-volume-sheet--closing');
    expect(onClose).not.toHaveBeenCalled();
    // a second Escape during the animation must not queue another close
    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => {
      vi.advanceTimersByTime(VOLUME_SHEET_CLOSE_MS);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose without onPick on backdrop click, after the close animation', () => {
    vi.useFakeTimers();
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<VolumeSheet product={product} onPick={onPick} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('volume-sheet-backdrop'));
    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(VOLUME_SHEET_CLOSE_MS);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('should skip the close animation when reduced motion is preferred', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    );
    const onClose = vi.fn();
    render(<VolumeSheet product={product} onPick={() => {}} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).not.toHaveClass('fd-volume-sheet--closing');
  });

  it('should never render a toast', () => {
    const onPick = vi.fn();
    const { container } = render(<VolumeSheet product={product} onPick={onPick} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: /10\s?ml/i }));
    expect(onPick).toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('should render the UK close label by default', () => {
    render(<VolumeSheet product={product} onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Закрити' })).toBeInTheDocument();
  });

  it('should render the RU close label when locale="ru"', () => {
    render(<VolumeSheet product={product} onPick={() => {}} onClose={() => {}} locale="ru" />);
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
  });

  it('should return focus to the invoker on Escape close', () => {
    vi.useFakeTimers();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            +
          </button>
          {open && <VolumeSheet product={product} onPick={() => {}} onClose={() => setOpen(false)} />}
        </>
      );
    }
    render(<Harness />);
    const invoker = screen.getByRole('button', { name: '+' });
    invoker.focus();
    fireEvent.click(invoker);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(VOLUME_SHEET_CLOSE_MS);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(invoker);
  });
});
