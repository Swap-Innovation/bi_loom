import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Check, GitCompare } from 'lucide-react';
import { api } from '../../services/api';
import type { TargetModelCatalogItem } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';

interface ModelCatalogProps {
  catalog: TargetModelCatalogItem[];
  activeCatalogId?: string;
  onSelect: (catalogId: string, name: string) => void;
  selecting?: boolean;
}

export function ModelCatalog({ catalog, activeCatalogId, onSelect, selecting }: ModelCatalogProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');

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

  return (
    <div className="space-y-4">
      <div className="border border-border rounded-xl bg-white overflow-hidden">
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
          const isActive = activeCatalogId === model.catalog_id;
          return (
            <Card key={model.catalog_id} className={`!p-0 overflow-hidden ${isActive ? 'border-primary ring-1 ring-primary/20' : ''}`}>
              <div className="flex items-start gap-3 p-4">
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
                    {isActive && <Badge size="sm">Selected</Badge>}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{model.description}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" size="sm">{model.table_count} tables</Badge>
                    <Badge variant="outline" size="sm">{model.column_count} columns</Badge>
                    <Badge variant="outline" size="sm">{model.measure_count} measures</Badge>
                    <Badge variant="outline" size="sm">{model.relationship_count} relationships</Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={isActive ? 'outline' : 'primary'}
                  onClick={() => onSelect(model.catalog_id, model.name)}
                  disabled={selecting || isActive}
                >
                  {isActive ? <><Check size={14} /> Selected</> : 'Select'}
                </Button>
              </div>

              {isExpanded && preview && preview.catalog_id === model.catalog_id && (
                <div className="border-t border-border bg-surface/50 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Schema preview</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {preview.tables.map((table) => (
                      <div key={table.name} className="bg-white border border-border rounded-lg p-3">
                        <p className="font-mono text-sm font-medium">{table.name}</p>
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
                    ))}
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
