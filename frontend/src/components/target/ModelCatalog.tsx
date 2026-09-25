import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Check, GitCompare } from 'lucide-react';
import { api } from '../../services/api';
import type { CatalogSelectionItem, TargetModelCatalogItem } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';

interface AppliedSelection {
  catalogIds: string[];
  tablesByCatalog: Record<string, string[]>;
}

interface ModelCatalogProps {
  catalog: TargetModelCatalogItem[];
  /** Active Pluto catalog_id (may be "composite"). */
  activeCatalogId?: string;
  /** Restored multi-select from the active model's _meta. */
  appliedSelection?: AppliedSelection;
  onApply: (selections: CatalogSelectionItem[]) => void;
  applying?: boolean;
}

function sameStringSets(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

export function ModelCatalog({
  catalog,
  activeCatalogId,
  appliedSelection,
  onApply,
  applying,
}: ModelCatalogProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');
  const [checkedModels, setCheckedModels] = useState<Set<string>>(new Set());
  const [checkedTables, setCheckedTables] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    if (!appliedSelection?.catalogIds?.length) return;
    setCheckedModels(new Set(appliedSelection.catalogIds));
    const next: Record<string, Set<string>> = {};
    for (const cid of appliedSelection.catalogIds) {
      const tables = appliedSelection.tablesByCatalog[cid];
      const fallback = catalog.find((c) => c.catalog_id === cid)?.table_names ?? [];
      next[cid] = new Set(tables?.length ? tables : fallback);
    }
    setCheckedTables(next);
  }, [appliedSelection, catalog]);

  const { data: preview } = useQuery({
    queryKey: ['catalog-preview', expandedId],
    queryFn: () => api.getCatalogPreview(expandedId!),
    enabled: !!expandedId,
  });

  const canCompare = !!compareA && !!compareB && compareA !== compareB;
  const { data: compareResult } = useQuery({
    queryKey: ['catalog-compare', compareA, compareB],
    queryFn: () => api.compareCatalogModels(compareA, compareB),
    enabled: canCompare,
  });

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    catalog.forEach((m) => map.set(m.catalog_id, m.name));
    return map;
  }, [catalog]);

  const tableCountSelected = useMemo(
    () => Array.from(checkedModels).reduce((n, cid) => n + (checkedTables[cid]?.size ?? 0), 0),
    [checkedModels, checkedTables],
  );

  const isDirty = useMemo(() => {
    const appliedIds = appliedSelection?.catalogIds ?? [];
    const currentIds = Array.from(checkedModels).sort();
    const appliedSorted = [...appliedIds].sort();
    if (!sameStringSets(currentIds, appliedSorted)) return checkedModels.size > 0;
    for (const cid of currentIds) {
      const cur = Array.from(checkedTables[cid] ?? []).sort();
      const app = [...(appliedSelection?.tablesByCatalog[cid] ?? [])].sort();
      if (!sameStringSets(cur, app)) return true;
    }
    return false;
  }, [appliedSelection, checkedModels, checkedTables]);

  const canApply =
    checkedModels.size > 0 &&
    tableCountSelected > 0 &&
    Array.from(checkedModels).every((cid) => (checkedTables[cid]?.size ?? 0) > 0);

  const toggleModel = (catalogId: string, tableNames: string[]) => {
    setCheckedModels((prev) => {
      const next = new Set(prev);
      if (next.has(catalogId)) {
        next.delete(catalogId);
        setCheckedTables((t) => {
          const copy = { ...t };
          delete copy[catalogId];
          return copy;
        });
      } else {
        next.add(catalogId);
        setCheckedTables((t) => ({
          ...t,
          [catalogId]: new Set(tableNames),
        }));
        setExpandedId(catalogId);
      }
      return next;
    });
  };

  const toggleTable = (catalogId: string, tableName: string) => {
    setCheckedTables((prev) => {
      const current = new Set(prev[catalogId] ?? []);
      if (current.has(tableName)) current.delete(tableName);
      else current.add(tableName);
      return { ...prev, [catalogId]: current };
    });
    setCheckedModels((prev) => {
      if (prev.has(catalogId)) return prev;
      const next = new Set(prev);
      next.add(catalogId);
      return next;
    });
  };

  const selectAllTables = (catalogId: string, tableNames: string[]) => {
    setCheckedModels((prev) => new Set(prev).add(catalogId));
    setCheckedTables((prev) => ({ ...prev, [catalogId]: new Set(tableNames) }));
  };

  const clearTables = (catalogId: string) => {
    setCheckedTables((prev) => ({ ...prev, [catalogId]: new Set() }));
  };

  const handleApply = () => {
    const selections: CatalogSelectionItem[] = Array.from(checkedModels).map((catalog_id) => ({
      catalog_id,
      tables: Array.from(checkedTables[catalog_id] ?? []),
    }));
    onApply(selections);
  };

  const modelIsApplied = (catalogId: string) =>
    (appliedSelection?.catalogIds ?? []).includes(catalogId) ||
    (activeCatalogId === catalogId && !appliedSelection?.catalogIds?.length);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 rounded-lg border border-border bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-800">Coverage selection</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Check models and tables to widen source-field coverage. Apply merges them into one active target.
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {checkedModels.size} model{checkedModels.size === 1 ? '' : 's'} · {tableCountSelected} table
              {tableCountSelected === 1 ? '' : 's'}
              {isDirty ? ' · unsaved changes' : appliedSelection?.catalogIds?.length ? ' · applied' : ''}
            </p>
          </div>
          <Button size="sm" onClick={handleApply} disabled={!canApply || applying || (!isDirty && !!appliedSelection?.catalogIds?.length)}>
            {applying ? 'Applying…' : 'Apply for coverage'}
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-lg bg-white overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface/60"
          onClick={() => setCompareOpen((v) => !v)}
        >
          <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
            <GitCompare size={16} className="text-gray-400" />
            Compare models
          </span>
          <span className="text-xs text-gray-400">{compareOpen ? 'Hide' : 'Optional'}</span>
        </button>

        {compareOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-border bg-surface/40">
            <p className="text-xs text-gray-500 pt-3">
              Pick two catalog models to see table and column differences.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-xs text-gray-500">
                First model
                <select
                  className="mt-1 w-full border border-border rounded-lg px-2.5 py-2 text-sm bg-white"
                  value={compareA}
                  onChange={(e) => setCompareA(e.target.value)}
                >
                  <option value="">Select…</option>
                  {catalog.map((m) => (
                    <option key={m.catalog_id} value={m.catalog_id} disabled={m.catalog_id === compareB}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-gray-500">
                Second model
                <select
                  className="mt-1 w-full border border-border rounded-lg px-2.5 py-2 text-sm bg-white"
                  value={compareB}
                  onChange={(e) => setCompareB(e.target.value)}
                >
                  <option value="">Select…</option>
                  {catalog.map((m) => (
                    <option key={m.catalog_id} value={m.catalog_id} disabled={m.catalog_id === compareA}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {compareA && compareB && compareA === compareB && (
              <p className="text-xs text-amber-700">Choose two different models to compare.</p>
            )}
            {canCompare && (
              <p className="text-xs text-gray-600">
                Comparing <span className="font-medium">{nameById.get(compareA)}</span>
                {' '}vs{' '}
                <span className="font-medium">{nameById.get(compareB)}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {compareResult && canCompare && (
        <Card className="!p-4 bg-surface">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Comparison</p>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="font-medium mb-1">Only in first</p>
              <p className="text-gray-600">{compareResult.only_in_a.join(', ') || '—'}</p>
            </div>
            <div>
              <p className="font-medium mb-1">Shared tables</p>
              <p className="text-gray-600">{compareResult.in_both.join(', ') || '—'}</p>
            </div>
            <div>
              <p className="font-medium mb-1">Only in second</p>
              <p className="text-gray-600">{compareResult.only_in_b.join(', ') || '—'}</p>
            </div>
          </div>
          {compareResult.column_diffs.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border space-y-2">
              {compareResult.column_diffs.map((d) => (
                <div key={d.table} className="text-xs">
                  <span className="font-mono font-medium">{d.table}</span>
                  {d.only_in_a.length > 0 && (
                    <span className="text-gray-500 ml-2">First only: {d.only_in_a.join(', ')}</span>
                  )}
                  {d.only_in_b.length > 0 && (
                    <span className="text-gray-500 ml-2">Second only: {d.only_in_b.join(', ')}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="space-y-3">
        {catalog.map((model) => {
          const isExpanded = expandedId === model.catalog_id;
          const isChecked = checkedModels.has(model.catalog_id);
          const isApplied = modelIsApplied(model.catalog_id);
          const tableNames = model.table_names ?? [];
          const selectedTableSet = checkedTables[model.catalog_id] ?? new Set<string>();
          const selectedTableCount = selectedTableSet.size;

          return (
            <Card
              key={model.catalog_id}
              className={`!p-0 overflow-hidden ${
                isChecked || isApplied ? 'border-primary ring-1 ring-primary/20' : ''
              }`}
            >
              <div className="flex items-start gap-3 p-4">
                <input
                  type="checkbox"
                  className="mt-1.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  checked={isChecked}
                  onChange={() => toggleModel(model.catalog_id, tableNames)}
                  aria-label={`Include ${model.name}`}
                />
                <button
                  type="button"
                  className="mt-1 text-gray-400 hover:text-primary"
                  onClick={() => setExpandedId(isExpanded ? null : model.catalog_id)}
                >
                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{model.name}</p>
                    {isApplied && (
                      <Badge size="sm">{isChecked ? 'In coverage' : 'Applied'}</Badge>
                    )}
                    {isChecked && !isApplied && <Badge size="sm" variant="outline">Pending</Badge>}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{model.description}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" size="sm">
                      {isChecked ? `${selectedTableCount}/` : ''}
                      {model.table_count} tables
                    </Badge>
                    <Badge variant="outline" size="sm">{model.column_count} columns</Badge>
                    <Badge variant="outline" size="sm">{model.measure_count} measures</Badge>
                    <Badge variant="outline" size="sm">{model.relationship_count} relationships</Badge>
                  </div>

                  {(isChecked || isExpanded) && tableNames.length > 0 && (
                    <div className="mt-3 rounded-lg border border-border bg-surface/40 p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase">Tables</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline"
                            onClick={() => selectAllTables(model.catalog_id, tableNames)}
                          >
                            All
                          </button>
                          <button
                            type="button"
                            className="text-xs text-gray-500 hover:underline"
                            onClick={() => clearTables(model.catalog_id)}
                          >
                            None
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {tableNames.map((tableName) => (
                          <label
                            key={tableName}
                            className="flex items-center gap-2 text-sm font-mono text-gray-700 cursor-pointer rounded px-1.5 py-1 hover:bg-white"
                          >
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                              checked={selectedTableSet.has(tableName)}
                              onChange={() => toggleTable(model.catalog_id, tableName)}
                            />
                            <span className="truncate">{tableName}</span>
                          </label>
                        ))}
                      </div>
                      {isChecked && selectedTableCount === 0 && (
                        <p className="text-xs text-amber-700 mt-2">Select at least one table for this model.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {isExpanded && preview && preview.catalog_id === model.catalog_id && (
                <div className="border-t border-border bg-surface/50 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Schema preview</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {preview.tables.map((table) => {
                      const included = !isChecked || selectedTableSet.has(table.name);
                      return (
                        <div
                          key={table.name}
                          className={`bg-white border border-border rounded-lg p-3 ${included ? '' : 'opacity-50'}`}
                        >
                          <p className="font-mono text-sm font-medium flex items-center gap-2">
                            {table.name}
                            {isChecked && included && <Check size={12} className="text-primary" />}
                          </p>
                          {table.description && <p className="text-xs text-gray-500">{table.description}</p>}
                          <ul className="mt-2 space-y-0.5">
                            {table.columns.map((col) => (
                              <li key={col.column} className="text-xs font-mono text-gray-600 flex gap-2">
                                <span>{col.column}</span>
                                <span className="text-gray-400">{col.type}</span>
                                {col.synonyms?.length > 0 && (
                                  <span className="text-primary truncate">({col.synonyms.join(', ')})</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
