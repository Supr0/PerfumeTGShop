import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { VolumeSheet } from './VolumeSheet';
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
  it('should render in-stock volumes with prices and hide OOS', () => {
    render(<VolumeSheet product={product} onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /3\s?ml/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /10\s?ml/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /5\s?ml/i })).not.toBeInTheDocument();
    // live price of the initial (first in-stock) selection
    expect(screen.getByText(/390/)).toBeInTheDocument();
  });

  it('should call onPick with exact ids on option select', () => {
    const onPick = vi.fn();
    render(<VolumeSheet product={product} onPick={onPick} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: /10\s?ml/i }));
    expect(onPick).toHaveBeenCalledWith(1, 13);
    // live price follows the new selection
    expect(screen.getByText(/990/)).toBeInTheDocument();
  });

  it('should call onClose without onPick on Escape', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<VolumeSheet product={product} onPick={onPick} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('should call onClose without onPick on backdrop click', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<VolumeSheet product={product} onPick={onPick} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('volume-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
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
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(invoker);
  });
});
