import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Favorites, { loadFavorites, persistFavorites, toggleFavorite } from './Favorites';

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

describe('favorites storage', () => {
  it('should toggle hearts in and out', () => {
    expect(toggleFavorite([], 'p1')).toEqual(['p1']);
    expect(toggleFavorite(['p1', 'p2'], 'p1')).toEqual(['p2']);
  });

  it('should round-trip through localStorage', () => {
    expect(persistFavorites(['p1', 'p2'])).toBe(true);
    expect(loadFavorites()).toEqual(['p1', 'p2']);
  });
});

describe('Favorites page smoke', () => {
  it('should render the empty state', () => {
    render(<Favorites />);
    expect(screen.getByText('В избранном пока пусто')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Перейти к каталогу' })).toHaveAttribute('href', '/');
  });

  it('should list hearts stored in localStorage', () => {
    persistFavorites(['p1', 'p2']);
    render(<Favorites resolveName={(id) => `Parfum ${id}`} />);
    expect(screen.getByText('Parfum p1')).toBeInTheDocument();
    expect(screen.getByText('Parfum p2')).toBeInTheDocument();
  });

  it('should unheart a product when remove is pressed', () => {
    persistFavorites(['p1']);
    render(<Favorites />);
    fireEvent.click(screen.getByRole('button', { name: 'Убрать p1 из избранного' }));
    expect(screen.getByText('В избранном пока пусто')).toBeInTheDocument();
  });
});
