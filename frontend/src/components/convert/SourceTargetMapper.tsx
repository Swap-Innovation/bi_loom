import { ArrowRight } from 'lucide-react';
import type { ConversionItem } from '../../types';
import { StatusBadge } from '../ui/Badge';

function targetLabel(item: ConversionItem): string {
  const t = item.target_path as {
    table?: string;
    column?: string;
    measure?: string;
    visual?: string;
    report?: string;
    page?: string;
  } | null;
  if (!t) return '—';
  if (t.measure) return `${t.table}.${t.measure}`;
  if (t.table && t.column) return `${t.table}.${t.column}`;
  if (t.visual && t.report) return `${t.report} › ${t.page ?? 'Page'} › ${t.visual}`;
  if (t.visual) return t.visual;
  return '—';
}

interface SourceTargetMapperProps {
  items: ConversionItem[];
  selectedId?: string | null;
  onSelect?: (item: ConversionItem) => void;
}

export function SourceTargetMapper({ items, selectedId, onSelect }: SourceTargetMapperProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">
        No field mappings yet. Run conversion to generate source → target mappings.
      </p>
    );
  }

  return (
    <div className="space-y-1 max-h-[280px] overflow-y-auto">
      {items.map((item) => {
        const source = item.source_name || item.source_id;
        const target = targetLabel(item);
        const selected = item.id === selectedId;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect?.(item)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
              selected ? 'bg-blue-50 border border-primary/30' : 'hover:bg-surface border border-transparent'
            }`}
          >
            <span className="flex-1 truncate font-mono text-xs text-gray-700" title={source}>
              {source}
            </span>
            <ArrowRight size={14} className="text-gray-400 shrink-0" />
            <span
              className={`flex-1 truncate font-mono text-xs ${target === '—' ? 'text-gray-400' : 'text-primary'}`}
              title={target}
            >
              {target}
            </span>
            <StatusBadge status={item.status} />
          </button>
        );
      })}
    </div>
  );
}
