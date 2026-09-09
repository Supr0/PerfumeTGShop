import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FilterSheet, DEFAULT_FILTERS, FILTER_SHEET_CLOSE_MS } from './FilterSheet';

describe('FilterSheet', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

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

  it('should render the open sheet without the closing state', () => {
    render(
      <FilterSheet
        open
        brands={['Creed']}
        families={[]}
        genders={[]}
        seasons={[]}
        value={DEFAULT_FILTERS}
        onChange={() => {}}
        onClose={() => {}}
        onReset={() => {}}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('fd-filter-sheet');
    expect(dialog).not.toHaveClass('fd-filter-sheet--closing');
    expect(dialog.querySelector('.fd-filter-sheet__body')).not.toBeNull();
  });

  it('should keep the sheet mounted during the close animation on Escape, then unmount and call onClose once', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      return open ? (
        <FilterSheet
          open
          brands={['Creed']}
          families={[]}
          genders={[]}
          seasons={[]}
          value={DEFAULT_FILTERS}
          onChange={() => {}}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          onReset={() => {}}
        />
      ) : null;
    }
    render(<Harness />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    // still mounted mid-animation, closing state applied, onClose deferred
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveClass('fd-filter-sheet--closing');
    expect(onClose).not.toHaveBeenCalled();
    // a second Escape during the animation must not queue another close
    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => {
      vi.advanceTimersByTime(FILTER_SHEET_CLOSE_MS);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose without onReset on backdrop click, after the close animation', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const onReset = vi.fn();
    render(
      <FilterSheet
        open
        brands={['Creed']}
        families={[]}
        genders={[]}
        seasons={[]}
        value={DEFAULT_FILTERS}
        onChange={() => {}}
        onClose={onClose}
        onReset={onReset}
      />,
    );
    fireEvent.click(screen.getByTestId('filter-sheet-backdrop'));
    expect(onReset).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveClass('fd-filter-sheet--closing');
    act(() => {
      vi.advanceTimersByTime(FILTER_SHEET_CLOSE_MS);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onReset).not.toHaveBeenCalled();
  });

  it('should close with animation on the footer apply button, then call onClose once', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <FilterSheet
        open
        brands={['Creed']}
        families={[]}
        genders={[]}
        seasons={[]}
        value={DEFAULT_FILTERS}
        onChange={() => {}}
        onClose={onClose}
        onReset={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Показати' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveClass('fd-filter-sheet--closing');
    act(() => {
      vi.advanceTimersByTime(FILTER_SHEET_CLOSE_MS);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
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
    render(
      <FilterSheet
        open
        brands={['Creed']}
        families={[]}
        genders={[]}
        seasons={[]}
        value={DEFAULT_FILTERS}
        onChange={() => {}}
        onClose={onClose}
        onReset={() => {}}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).not.toHaveClass('fd-filter-sheet--closing');
  });

  it('should return focus to the invoker on Escape close', () => {
    vi.useFakeTimers();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Фільтри
          </button>
          {open && (
            <FilterSheet
              open
              brands={['Creed']}
              families={[]}
              genders={[]}
              seasons={[]}
              value={DEFAULT_FILTERS}
              onChange={() => {}}
              onClose={() => setOpen(false)}
              onReset={() => {}}
            />
          )}
        </>
      );
    }
    render(<Harness />);
    const invoker = screen.getByRole('button', { name: 'Фільтри' });
    invoker.focus();
    fireEvent.click(invoker);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(FILTER_SHEET_CLOSE_MS);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(invoker);
  });
});
