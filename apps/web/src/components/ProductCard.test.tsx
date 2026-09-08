import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductCard } from './ProductCard';
import type { Product } from './ProductCard';

const product: Product = {
  id: 1,
  name: 'Aventus',
  brand: 'Creed',
  description: 'Citrus oud bestseller',
  is_hit: true,
  variants: [
    { id: 11, volume_ml: 3, price_minor_uah: 39000, old_price_minor_uah: 45000, stock: 5 },
    { id: 12, volume_ml: 5, price_minor_uah: 59000, old_price_minor_uah: null, stock: 0 },
    { id: 13, volume_ml: 10, price_minor_uah: 99000, old_price_minor_uah: null, stock: 2 },
  ],
};

describe('ProductCard', () => {
  it('should show three prices for 3/5/10 ml volumes', () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText(/3\s?ml/i)).toBeInTheDocument();
    expect(screen.getByText(/5\s?ml/i)).toBeInTheDocument();
    expect(screen.getByText(/10\s?ml/i)).toBeInTheDocument();
    // prices rendered next to each volume
    expect(screen.getByText(/390/)).toBeInTheDocument();
    expect(screen.getByText(/590/)).toBeInTheDocument();
    expect(screen.getByText(/990/)).toBeInTheDocument();
  });

  it('should show OOS badge for the out-of-stock volume', () => {
    render(<ProductCard product={product} />);
    const badges = screen.getAllByText(/немає в наявності|нет в наличии|out of stock/i);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('should show HIT and discount badges', () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText(/HIT/i)).toBeInTheDocument();
    expect(screen.getByText(/-13%/)).toBeInTheDocument();
  });

  it('should call onAdd with first in-stock variant id', () => {
    const onAdd = vi.fn();
    render(<ProductCard product={product} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: /додати|добавить|add/i }));
    expect(onAdd).toHaveBeenCalledWith(1, 11);
  });

  it('should toggle favorite via heart button', () => {
    const onToggleFavorite = vi.fn();
    render(<ProductCard product={product} isFavorite={false} onToggleFavorite={onToggleFavorite} />);
    const heart = screen.getByRole('button', { name: /обране|избранное|favorite/i });
    expect(heart).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(heart);
    expect(onToggleFavorite).toHaveBeenCalledWith(1);
  });
});
