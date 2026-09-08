import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterSheet, DEFAULT_FILTERS } from './FilterSheet';

describe('FilterSheet', () => {
  it('should render all controls when open', () => {
    render(
      <FilterSheet
        open
        brands={['Creed', 'Dior']}
        families={['citrus', 'oud']}
        genders={['unisex']}
        seasons={['summer']}
        value={DEFAULT_FILTERS}
        onChange={() => {}}
        onClose={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // brand multi-select
    expect(screen.getByText('Creed')).toBeInTheDocument();
    expect(screen.getByText('Dior')).toBeInTheDocument();
    // family multi-select
    expect(screen.getByText('citrus')).toBeInTheDocument();
    // gender multi-select
    expect(screen.getByText('unisex')).toBeInTheDocument();
    // price range
    expect(screen.getByLabelText(/price min|ціна від|цена от/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/price max|ціна до|цена до/i)).toBeInTheDocument();
    // season
    expect(screen.getByText('summer')).toBeInTheDocument();
    // in-stock toggle
    expect(screen.getByLabelText(/in stock|в наявності|в наличии/i)).toBeInTheDocument();
    // sort
    expect(screen.getByLabelText(/sort|сортуван/i)).toBeInTheDocument();
  });

  it('should render nothing when closed', () => {
    const onClose = vi.fn();
    const { container } = render(
      <FilterSheet
        open={false}
        brands={[]}
        families={[]}
        genders={[]}
        seasons={[]}
        value={DEFAULT_FILTERS}
        onChange={() => {}}
        onClose={onClose}
        onReset={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
