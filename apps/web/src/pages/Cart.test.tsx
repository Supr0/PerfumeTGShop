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

describe('Cart page smoke (UK default)', () => {
  it('should render the empty state linking to hits', () => {
    render(<Cart />);
    expect(screen.getByText('Кошик порожній')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Дивитися хіти' });
    expect(link).toHaveAttribute('href', '#/');
  });

  it('should list lines with qty controls, total, and checkout link', () => {
    persistCart([
      { productId: '1', variantId: 11, volume_ml: 3, qty: 2, price: 100, name: 'Test Parfum' },
      { productId: '2', variantId: 21, volume_ml: 5, qty: 1, price: 50, name: 'Mini' },
    ]);
    render(<Cart />);
    expect(screen.getByText('Test Parfum')).toBeInTheDocument();
    expect(screen.getByText('Разом: 250 ₴')).toBeInTheDocument();
    const checkout = screen.getByRole('link', { name: 'До оформлення' });
    expect(checkout).toHaveAttribute('href', '#/checkout');
  });

  it('should remove a line when delete is pressed', () => {
    persistCart([{ productId: '1', variantId: 11, volume_ml: 3, qty: 1, price: 100, name: 'Test Parfum' }]);
    render(<Cart />);
    fireEvent.click(screen.getByRole('button', { name: 'Видалити Test Parfum' }));
    expect(screen.getByText('Кошик порожній')).toBeInTheDocument();
  });

  it('should show a notice when switching to an out-of-stock volume', () => {
    persistCart([{ productId: '1', variantId: 11, volume_ml: 3, qty: 1, price: 100, name: 'Test Parfum' }]);
    render(
      <Cart
        volumesByProduct={{ 1: [3, 5] }}
        resolveVolumeStock={() => 0}
      />,
    );
    fireEvent.change(screen.getByLabelText('Обʼєм для Test Parfum'), { target: { value: '5' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Немає в наявності');
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
    fireEvent.change(screen.getByLabelText('Обʼєм для Test Parfum'), { target: { value: '5' } });
    expect(screen.getByLabelText('Обʼєм для Test Parfum')).toHaveValue('5');
  });
});

describe('Cart volume switch (already_in_cart + OOS filter)', () => {
  it('should hide out-of-stock volumes except the current line volume', () => {
    persistCart([{ productId: '1', variantId: 11, volume_ml: 3, qty: 1, price: 100, name: 'Test Parfum' }]);
    render(
      <Cart
        volumesByProduct={{ 1: [3, 5] }}
        resolveVolumeStock={(_productId, volumeMl) => (volumeMl === 3 ? 4 : 0)}
      />,
    );
    expect(screen.getByRole('option', { name: '3 ml' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '5 ml' })).not.toBeInTheDocument();
  });

  it('should always keep the current line volume even when it is out of stock', () => {
    persistCart([{ productId: '1', variantId: 12, volume_ml: 5, qty: 1, price: 100, name: 'Test Parfum' }]);
    render(
      <Cart
        volumesByProduct={{ 1: [3, 5] }}
        resolveVolumeStock={() => 0}
      />,
    );
    expect(screen.getByRole('option', { name: '5 ml' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '3 ml' })).not.toBeInTheDocument();
  });

  it('should show the already-in-cart notice and clear it on qty change', () => {    persistCart([
      { productId: '1', variantId: 11, volume_ml: 3, qty: 1, price: 100, name: 'Alpha' },
      { productId: '1', variantId: 12, volume_ml: 5, qty: 1, price: 120, name: 'Beta' },
    ]);
    render(
      <Cart
        volumesByProduct={{ 1: [3, 5] }}
        resolveVolumeStock={() => 4}
        resolveVariantId={(_productId, volumeMl) => (volumeMl === 5 ? 12 : 11)}
      />,
    );
    fireEvent.change(screen.getByLabelText('Обʼєм для Alpha'), { target: { value: '5' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Такий обʼєм уже в кошику');
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Збільшити Alpha' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should clear the notice when a line is deleted', () => {
    persistCart([
      { productId: '1', variantId: 11, volume_ml: 3, qty: 1, price: 100, name: 'Alpha' },
      { productId: '1', variantId: 12, volume_ml: 5, qty: 1, price: 120, name: 'Beta' },
    ]);
    render(
      <Cart
        volumesByProduct={{ 1: [3, 5] }}
        resolveVolumeStock={() => 4}
        resolveVariantId={(_productId, volumeMl) => (volumeMl === 5 ? 12 : 11)}
      />,
    );
    fireEvent.change(screen.getByLabelText('Обʼєм для Alpha'), { target: { value: '5' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Такий обʼєм уже в кошику');
    fireEvent.click(screen.getByRole('button', { name: 'Видалити Alpha' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('should render the RU already-in-cart string when locale="ru"', () => {
    persistCart([
      { productId: '1', variantId: 11, volume_ml: 3, qty: 1, price: 100, name: 'Alpha' },
      { productId: '1', variantId: 12, volume_ml: 5, qty: 1, price: 120, name: 'Beta' },
    ]);
    render(
      <Cart
        locale="ru"
        volumesByProduct={{ 1: [3, 5] }}
        resolveVolumeStock={() => 4}
        resolveVariantId={(_productId, volumeMl) => (volumeMl === 5 ? 12 : 11)}
      />,
    );
    fireEvent.change(screen.getByLabelText('Объём для Alpha'), { target: { value: '5' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Такой объём уже в корзине');
  });
});

describe('Cart page locale switch', () => {
  it('should render RU strings when locale="ru"', () => {
    render(<Cart locale="ru" />);
    expect(screen.getByText('Корзина пуста')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Смотреть хиты' })).toBeInTheDocument();
  });

  it('should render RU line controls when locale="ru"', () => {
    persistCart([
      { productId: '1', variantId: 11, volume_ml: 3, qty: 2, price: 100, name: 'Test Parfum' },
    ]);
    render(<Cart locale="ru" />);
    expect(screen.getByText('Итого: 200 ₴')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'К оформлению' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Удалить Test Parfum' })).toBeInTheDocument();
  });
});
