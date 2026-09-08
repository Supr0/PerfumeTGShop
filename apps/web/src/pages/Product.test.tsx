import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductPage } from './Product';
import type { Product } from '../components/ProductCard';

/** Fixture mirrors the real ProductOut shape: notes are strings, season is an array. */
const product: Product = {
  id: 1,
  name: 'Aventus',
  brand: 'Creed',
  description: 'Citrus oud bestseller',
  family: 'citrus',
  gender: 'M',
  season: ['summer'],
  notes_top: 'Bergamot, Lemon',
  notes_heart: 'Birch',
  notes_base: 'Musk, Amber',
  longevity: 5,
  sillage: 3,
  place_tags: ['daily', 'office'],
  variants: [
    { id: 11, volume_ml: 3, price_minor_uah: 39000, old_price_minor_uah: null, stock: 5 },
    { id: 12, volume_ml: 5, price_minor_uah: 59000, old_price_minor_uah: null, stock: 0 },
    { id: 13, volume_ml: 10, price_minor_uah: 99000, old_price_minor_uah: null, stock: 2 },
  ],
};

describe('ProductPage', () => {
  it('should switch price when volume changes', () => {
    render(<ProductPage product={product} />);
    expect(screen.getByText(/390/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /10\s?ml/i }));
    expect(screen.getByText(/990/)).toBeInTheDocument();
  });

  it('should render description, notes pyramid and characteristics', () => {
    render(<ProductPage product={product} />);
    expect(screen.getByText('Citrus oud bestseller')).toBeInTheDocument();
    // Comma-joined API strings render as separate items.
    expect(screen.getByText('Bergamot')).toBeInTheDocument();
    expect(screen.getByText('Lemon')).toBeInTheDocument();
    expect(screen.getByText('Birch')).toBeInTheDocument();
    expect(screen.getByText('Musk')).toBeInTheDocument();
    expect(screen.getByText('Amber')).toBeInTheDocument();
    // Characteristics come from real ProductOut fields.
    expect(screen.getByText('citrus')).toBeInTheDocument();
    expect(screen.getByText('summer')).toBeInTheDocument();
    expect(screen.getByText('daily, office')).toBeInTheDocument();
  });

  it('should render Similar as stub empty state', () => {
    render(<ProductPage product={product} />);
    expect(screen.getByText(/similar|схожі|похожие/i)).toBeInTheDocument();
    expect(screen.getByText(/soon|скоро/i)).toBeInTheDocument();
  });

  it('should toast on add-to-cart via callback prop', () => {
    const onAddToCart = vi.fn();
    render(<ProductPage product={product} onAddToCart={onAddToCart} />);
    fireEvent.click(screen.getByRole('button', { name: /додати|добавить|add/i }));
    expect(onAddToCart).toHaveBeenCalledWith(1, 11);
    expect(screen.getByText(/додано|добавлено|added/i)).toBeInTheDocument();
  });
});
