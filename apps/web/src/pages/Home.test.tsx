import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Home, buildCatalogQuery } from './Home';
import type { Product } from '../components/ProductCard';
import { DEFAULT_FILTERS } from '../components/FilterSheet';

const products: Product[] = [
  {
    id: 1,
    name: 'Aventus',
    brand: 'Creed',
    family: 'citrus',
    season: ['spring'],
    variants: [
      { id: 11, volume_ml: 3, price_minor_uah: 39000, old_price_minor_uah: null, stock: 5 },
      { id: 12, volume_ml: 5, price_minor_uah: 59000, old_price_minor_uah: null, stock: 1 },
      { id: 13, volume_ml: 10, price_minor_uah: 99000, old_price_minor_uah: null, stock: 2 },
    ],
  },
  {
    id: 2,
    name: 'Sauvage',
    brand: 'Dior',
    family: 'oud',
    season: ['winter'],
    variants: [
      { id: 21, volume_ml: 3, price_minor_uah: 29000, old_price_minor_uah: null, stock: 0 },
      { id: 22, volume_ml: 5, price_minor_uah: 49000, old_price_minor_uah: null, stock: 0 },
      { id: 23, volume_ml: 10, price_minor_uah: 89000, old_price_minor_uah: null, stock: 0 },
    ],
  },
];

describe('Home', () => {
  it('should show skeletons while loading', () => {
    render(<Home loading products={[]} />);
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(1);
  });

  it('should show empty state when no items match', () => {
    render(<Home products={[]} />);
    expect(screen.getByText(/нічого не знайдено|ничего не найдено|no products|empty/i)).toBeInTheDocument();
  });

  it('should render search, family chips, grid and Filters button', () => {
    render(<Home products={products} />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByText('citrus')).toBeInTheDocument();
    expect(screen.getByText('Aventus')).toBeInTheDocument();
    expect(screen.getByText('Sauvage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /фільтри|фильтры|filters/i })).toBeInTheDocument();
  });

  it('should filter grid by search input', () => {
    render(<Home products={products} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Sauvage' } });
    expect(screen.getByText('Sauvage')).toBeInTheDocument();
    expect(screen.queryByText('Aventus')).not.toBeInTheDocument();
  });

  it('should filter grid by season intersection via the filter sheet', () => {
    render(<Home products={products} />);
    fireEvent.click(screen.getByRole('button', { name: /фільтри|фильтры|filters/i }));
    fireEvent.click(screen.getByText('winter'));
    expect(screen.getByText('Sauvage')).toBeInTheDocument();
    expect(screen.queryByText('Aventus')).not.toBeInTheDocument();
  });

  it('should show toast after add-to-cart callback', () => {
    const onAddToCart = vi.fn();
    render(<Home products={products} onAddToCart={onAddToCart} />);
    const addButtons = screen.getAllByRole('button', { name: /додати|добавить|add/i });
    fireEvent.click(addButtons[0]);
    expect(onAddToCart).toHaveBeenCalled();
    expect(screen.getByText(/додано|добавлено|added/i)).toBeInTheDocument();
  });
});

describe('buildCatalogQuery', () => {
  it('should forward server sort keys verbatim and repeat multi-selects', () => {
    const params = buildCatalogQuery(
      {
        ...DEFAULT_FILTERS,
        brands: ['Creed'],
        genders: ['M', 'F'],
        seasons: ['summer', 'winter'],
        sort: 'price_asc',
      },
      'oud',
    );
    expect(params.get('sort')).toBe('price_asc');
    expect(params.getAll('brand')).toEqual(['Creed']);
    expect(params.getAll('gender')).toEqual(['M', 'F']);
    expect(params.getAll('season')).toEqual(['summer', 'winter']);
    expect(params.get('q')).toBe('oud');
  });
});
