// Render smoke test — mounts the full app in jsdom and checks that the main
// screens render without crashing and the calculator reacts to input changes.
// This catches the runtime errors that a type-check can't see.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { StoreProvider } from '../state/store';
import { App } from '../App';

function renderApp() {
  return render(
    <StoreProvider>
      <App />
    </StoreProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('App smoke test', () => {
  it('renders the calculator with a live breakdown', async () => {
    renderApp();
    // Hydration is async; wait for the real screen (splash disappears).
    expect(await screen.findByText('Cost Calculator')).toBeTruthy();
    // Core sections render.
    expect(screen.getByText('Base Print Cost')).toBeTruthy();
    expect(screen.getByText('Production Cost')).toBeTruthy();
    // Filament appears both as line label and in the summary breakdown.
    expect(screen.getAllByText(/Filament/i).length).toBeGreaterThan(0);
    // The seeded draft has a real cost — unit total must not be a dash.
    const unit = document.querySelector('.sticky-unit');
    expect(unit).toBeTruthy();
    expect((unit as HTMLElement).textContent).not.toContain('—');
  });

  it('navigates to Products, Libraries and Settings', async () => {
    renderApp();
    await screen.findByText('Cost Calculator');

    fireEvent.click(screen.getAllByRole('button', { name: 'Products' })[0]);
    expect(await screen.findByText('Saved Products')).toBeTruthy();
    expect(screen.getByText('No products yet')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Libraries' })[0]);
    expect(await screen.findByText('Libraries', { selector: 'h1' })).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]);
    expect(await screen.findByText('Settings', { selector: 'h1' })).toBeTruthy();
  });

  it('recomputes the summary live when grams change', async () => {
    renderApp();
    await screen.findByText('Cost Calculator');

    const grams = document.querySelector<HTMLInputElement>('#grams-0');
    expect(grams).toBeTruthy();

    const readUnitTotal = () =>
      document.querySelector('.sticky-unit')?.textContent?.trim() ?? '';

    const before = readUnitTotal();
    fireEvent.change(grams!, { target: { value: '60' } });
    const after = readUnitTotal();

    expect(after).not.toBe('');
    expect(after).not.toBe(before);
  });
});
