// App shell: navigation, theme application, product edit context, route wiring.

import { useEffect, useState } from 'react';
import type { Product } from './core/types';
import { useStore } from './state/store';
import { AppShell, type TabId } from './ui/layout';
import { CalculatorScreen, freshDraftFrom } from './screens/calculator/CalculatorScreen';
import { ProductsScreen } from './screens/ProductsScreen';
import { PresetsScreen } from './screens/PresetsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export function App() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<TabId>('calculator');
  // A product that is currently being edited (loads its snapshot into the draft).
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Apply theme to <html data-theme>.
  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    const resolved = state.settings.theme === 'system' ? (prefersDark ? 'dark' : 'light') : state.settings.theme;
    root.dataset.theme = resolved;
  }, [state.settings.theme]);

  // Editing a product → load its snapshot into the draft and go to the calculator.
  const beginEdit = (p: Product) => {
    setEditingProduct(p);
    dispatch({ type: 'draft/load', draft: p.snapshot.input });
    setTab('calculator');
  };

  const beginNew = () => {
    setEditingProduct(null);
    dispatch({ type: 'draft/load', draft: freshDraftFrom({ presets: state.presets, settings: state.settings, currency: state.settings.currency }) });
    setTab('calculator');
  };

  const cancelEdit = () => {
    setEditingProduct(null);
  };

  return (
    <AppShell
      tab={tab}
      onTab={(t) => {
        setTab(t);
        if (t !== 'calculator') setEditingProduct(null);
      }}
      theme={state.settings.theme}
      onTheme={(theme) => dispatch({ type: 'settings/update', patch: { theme } })}
      currency={state.settings.currency}
      onCurrency={(currency) => dispatch({ type: 'settings/update', patch: { currency } })}
    >
      {tab === 'calculator' && (
        <CalculatorScreen
          editing={editingProduct ? { product: editingProduct } : null}
          onCancelEdit={cancelEdit}
        />
      )}
      {tab === 'products' && (
        <ProductsScreen
          onNewProduct={beginNew}
          onEditProduct={beginEdit}
        />
      )}
      {tab === 'presets' && <PresetsScreen currency={state.settings.currency} />}
      {tab === 'settings' && <SettingsScreen />}
    </AppShell>
  );
}