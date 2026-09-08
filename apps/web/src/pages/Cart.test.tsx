import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Cart from './Cart';
import { persistCart } from '../lib/cart';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  clear(): void {
    this.data.clear();
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: new MemoryStorage(), configurable: true });
  vi.restoreAllMocks();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
});

afterEach(() => cleanup());

describe('Cart page smoke', () => {
  it('should render the empty state linking to hits', () => {
    render(<Cart />);
    expect(screen.getByText('Корзина пуста')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Смотреть хиты' });
    expect(link).toHaveAttribute('href', '#/');
  });

  it('should list lines with qty controls, total, and checkout link', () => {
    persistCart([
      { productId: '1', variantId: 11, volume_ml: 3, qty: 2, price: 100, name: 'Test Parfum' },
      { productId: '2', variantId: 21, volume_ml: 5, qty: 1, price: 50, name: 'Mini' },
    ]);
    render(<Cart />);
    expect(screen.getByText('Test Parfum')).toBeInTheDocument();
    expect(screen.getByText('Итого: 250 ₴')).toBeInTheDocument();
    const checkout = screen.getByRole('link', { name: 'К оформлению' });
    expect(checkout).toHaveAttribute('href', '#/checkout');
  });

  it('should remove a line when delete is pressed', () => {
    persistCart([{ productId: '1', variantId: 11, volume_ml: 3, qty: 1, price: 100, name: 'Test Parfum' }]);
    render(<Cart />);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить Test Parfum' }));
    expect(screen.getByText('Корзина пуста')).toBeInTheDocument();
  });

  it('should show a notice when switching to an out-of-stock volume', () => {
    persistCart([{ productId: '1', variantId: 11, volume_ml: 3, qty: 1, price: 100, name: 'Test Parfum' }]);
    render(
      <Cart
        volumesByProduct={{ 1: [3, 5] }}
        resolveVolumeStock={() => 0}
      />,
    );
    fireEvent.change(screen.getByLabelText('Объём для Test Parfum'), { target: { value: '5' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Нет в наличии');
    expect(screen.getByText('Test Parfum')).toBeInTheDocument();
  });

  it('should switch the line volume in ml numbers', () => {
    persistCart([{ productId: '1', variantId: 11, volume_ml: 3, qty: 1, price: 100, name: 'Test Parfum' }]);
    render(
      <Cart
        volumesByProduct={{ 1: [3, 5] }}
        resolveVolumeStock={() => 4}
        resolveVariantId={(_productId, volumeMl) => (volumeMl === 5 ? 12 : 11)}
      />,
    );
    fireEvent.change(screen.getByLabelText('Объём для Test Parfum'), { target: { value: '5' } });
    expect(screen.getByLabelText('Объём для Test Parfum')).toHaveValue('5');
  });
});
