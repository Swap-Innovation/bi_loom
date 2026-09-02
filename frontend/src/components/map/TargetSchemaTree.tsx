import { useState } from 'react';
import { ChevronRight, ChevronDown, Database, Table2, BarChart3 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import type { PbiSemanticModel } from '../../types';

interface TargetSchemaTreeProps {
  model: PbiSemanticModel | null;
  loading?: boolean;
  onSelectColumn?: (table: string, column: string) => void;
  onSelectMeasure?: (table: string, measure: string) => void;
}

export function TargetSchemaTree({ model, loading, onSelectColumn, onSelectMeasure }: TargetSchemaTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ root: true });

  const toggle = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  if (loading) {
    return <div className="h-full flex items-center justify-center text-xs text-gray-400">Loading target schema…</div>;
  }

  if (!model) {
    return (
      <div className="border border-dashed border-border rounded-xl h-full flex items-center justify-center p-4 text-center text-xs text-gray-400">
        Select a target semantic model first
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl bg-white overflow-hidden h-full flex flex-col">
      <div className="px-3 py-2 bg-surface border-b border-border shrink-0">
        <p className="text-xs font-semibold">Target Pluto Schema</p>
        <p className="text-[10px] text-gray-400">Click column/measure to assign to selected mapping</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <button
          type="button"
          className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-surface rounded"
          onClick={() => toggle('root')}
        >
          {expanded.root ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Database size={14} className="text-primary" />
          <span className="text-xs font-medium">{model.name}</span>
        </button>
        {expanded.root && model.tables.map((table) => {
          const tKey = `t-${table.id}`;
          return (
            <div key={table.id} className="pl-4">
              <button
                type="button"
                className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-surface rounded text-left"
                onClick={() => toggle(tKey)}
              >
                {expanded[tKey] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Table2 size={12} className="text-gray-400" />
                <span className="text-xs font-mono font-medium">{table.name}</span>
                <Badge variant="outline" size="sm" className="ml-auto text-[9px]">{table.columns.length}</Badge>
              </button>
              {expanded[tKey] && (
                <ul className="pl-5 space-y-0.5 mb-1">
                  {table.columns.map((col) => (
                    <li key={col.id}>
                      <button
                        type="button"
                        className="w-full text-left px-2 py-0.5 rounded text-[11px] font-mono hover:bg-pink-50 hover:text-primary"
                        onClick={() => onSelectColumn?.(table.name, col.name)}
                      >
                        ⬦ {col.name} <span className="text-gray-400">{col.type}</span>
                      </button>
                    </li>
                  ))}
                  {table.measures.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="w-full text-left px-2 py-0.5 rounded text-[11px] font-mono hover:bg-pink-50 hover:text-primary flex items-center gap-1"
                        onClick={() => onSelectMeasure?.(table.name, m.name)}
                      >
                        <BarChart3 size={10} /> {m.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
