import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VolumeSelector } from './VolumeSelector';

const variants = [
  { id: 11, volume_ml: 3, price_minor_uah: 39000, old_price_minor_uah: null, stock: 5 },
  { id: 12, volume_ml: 5, price_minor_uah: 59000, old_price_minor_uah: null, stock: 0 },
  { id: 13, volume_ml: 10, price_minor_uah: 99000, old_price_minor_uah: null, stock: 2 },
];

describe('VolumeSelector', () => {
  it('should switch displayed price when volume changes', () => {
    const onChange = vi.fn();
    const { rerender } = render(<VolumeSelector variants={variants} value={3} onChange={onChange} />);
    expect(screen.getByText(/390/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /10\s?ml/i }));
    expect(onChange).toHaveBeenCalledWith(10);
    rerender(<VolumeSelector variants={variants} value={10} onChange={onChange} />);
    expect(screen.getByText(/990/)).toBeInTheDocument();
  });

  it('should mark OOS volume unselectable with badge', () => {
    render(<VolumeSelector variants={variants} value={3} onChange={() => {}} />);
    const oos = screen.getByRole('radio', { name: /5\s?ml/i });
    expect(oos).toBeDisabled();
    expect(oos).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/немає в наявності|нет в наличии|out of stock/i)).toBeInTheDocument();
  });

  it('should render OOS options by default (hideOutOfStock unset or false)', () => {
    const { rerender } = render(<VolumeSelector variants={variants} value={3} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /5\s?ml/i })).toBeInTheDocument();
    rerender(<VolumeSelector variants={variants} value={3} onChange={() => {}} hideOutOfStock={false} />);
    expect(screen.getByRole('radio', { name: /5\s?ml/i })).toBeInTheDocument();
  });

  it('should hide OOS options except current when hideOutOfStock', () => {
    render(<VolumeSelector variants={variants} value={3} onChange={() => {}} hideOutOfStock />);
    expect(screen.getByRole('radio', { name: /3\s?ml/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /10\s?ml/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /5\s?ml/i })).not.toBeInTheDocument();
  });

  it('should keep current OOS option visible but disabled when hideOutOfStock', () => {
    const onChange = vi.fn();
    render(<VolumeSelector variants={variants} value={5} onChange={onChange} hideOutOfStock />);
    const current = screen.getByRole('radio', { name: /5\s?ml/i });
    expect(current).toBeDisabled();
    expect(current).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/немає в наявності|нет в наличии|out of stock/i)).toBeInTheDocument();
    // price stays coherent with the current OOS selection
    expect(screen.getByText(/590/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
