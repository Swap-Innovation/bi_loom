import { ArrowRight } from 'lucide-react';
import type { Mapping } from '../../types';
import { cn } from '../../utils/cn';

function targetDisplay(m: Mapping) {
  if (m.target_measure) return `${m.target_table}.${m.target_measure}`;
  if (m.target_table && m.target_column) return `${m.target_table}.${m.target_column}`;
  return 'Unmapped';
}

interface MappingLineageProps {
  mapping: Mapping;
  className?: string;
  compact?: boolean;
}

/** Source → target lineage strip for mapping review. */
export function MappingLineage({ mapping, className, compact }: MappingLineageProps) {
  const ctx = mapping.source_context as Record<string, string> | null;
  const pathParts = [
    ctx?.document || ctx?.report,
    ctx?.page,
    ctx?.block || ctx?.visual,
    mapping.source_name,
  ].filter(Boolean) as string[];

  const target = targetDisplay(mapping);
  const mapped = target !== 'Unmapped';

  if (compact) {
    return (
      <div className={cn('flex items-center gap-1.5 text-[11px] font-mono min-w-0', className)}>
        <span className="truncate text-gray-600 max-w-[40%]" title={pathParts.join(' › ')}>
          {mapping.source_name}
        </span>
        <ArrowRight size={12} className="text-gray-300 shrink-0" />
        <span className={cn('truncate', mapped ? 'text-gray-800' : 'text-gray-400')}>{target}</span>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border border-border bg-surface/50 p-4', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-3">
        Mapping lineage
      </p>
      <div className="flex flex-col sm:flex-row sm:items-stretch gap-3">
        <div className="flex-1 min-w-0 rounded-lg border border-border bg-white px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Source (BO)</p>
          <p className="font-mono text-sm font-semibold text-gray-900 truncate">{mapping.source_name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{mapping.source_type}</p>
          {pathParts.length > 1 && (
            <p className="text-[11px] text-gray-500 mt-2 leading-snug break-words">
              {pathParts.slice(0, -1).join(' › ')}
            </p>
          )}
        </div>

        <div className="flex sm:flex-col items-center justify-center gap-1 shrink-0 text-gray-400 px-1">
          <ArrowRight size={18} className="rotate-90 sm:rotate-0" />
          <span className="text-[10px] font-medium uppercase tracking-wide">
            {Math.round(mapping.confidence)}%
          </span>
        </div>

        <div className={cn(
          'flex-1 min-w-0 rounded-lg border px-3 py-2.5',
          mapped ? 'border-primary/30 bg-white' : 'border-dashed border-border bg-white/60',
        )}
        >
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Target (Pluto)</p>
          <p className={cn(
            'font-mono text-sm font-semibold truncate',
            mapped ? 'text-gray-900' : 'text-gray-400',
          )}
          >
            {target}
          </p>
          {mapped && mapping.target_table && (
            <p className="text-xs text-gray-500 mt-0.5">
              {mapping.target_measure ? 'Measure' : 'Column'} on {mapping.target_table}
            </p>
          )}
          {!mapped && (
            <p className="text-xs text-amber-700 mt-1">Assign a target or reject this row</p>
          )}
        </div>
      </div>
    </div>
  );
}
