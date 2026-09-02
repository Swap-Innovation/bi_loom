import { createContext, useContext, useState, useCallback } from 'react';

interface SelectionState {
  sourceId: string | null;
  sourceType: string | null;
  sourceData: unknown;
  targetId: string | null;
  targetType: string | null;
  targetData: unknown;
  conversionItemId: string | null;
  conversionItemData: unknown;
}

interface SelectionContextValue extends SelectionState {
  selectSource: (id: string, type: string, data: unknown) => void;
  selectTarget: (id: string, type: string, data: unknown) => void;
  selectConversionItem: (id: string | null, data?: unknown) => void;
  clearSelection: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

const initial: SelectionState = {
  sourceId: null, sourceType: null, sourceData: null,
  targetId: null, targetType: null, targetData: null,
  conversionItemId: null, conversionItemData: null,
};

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SelectionState>(initial);

  const selectSource = useCallback((id: string, type: string, data: unknown) => {
    setState((s) => ({ ...s, sourceId: id, sourceType: type, sourceData: data }));
  }, []);

  const selectTarget = useCallback((id: string, type: string, data: unknown) => {
    setState((s) => ({ ...s, targetId: id, targetType: type, targetData: data }));
  }, []);

  const selectConversionItem = useCallback((id: string | null, data?: unknown) => {
    setState((s) => ({ ...s, conversionItemId: id, conversionItemData: data ?? null }));
  }, []);

  const clearSelection = useCallback(() => setState(initial), []);

  return (
    <SelectionContext.Provider value={{ ...state, selectSource, selectTarget, selectConversionItem, clearSelection }}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used within SelectionProvider');
  return ctx;
}
