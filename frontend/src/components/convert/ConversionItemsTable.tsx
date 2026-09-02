import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { ConversionItem } from '../../types';
import { StatusBadge } from '../ui/Badge';
import { Tabs } from '../ui/Tabs';
import { SkeletonTable } from '../ui/Skeleton';

interface ConversionItemsTableProps {
  items: ConversionItem[];
  loading?: boolean;
  selectedId?: string | null;
  onSelect?: (item: ConversionItem) => void;
  stepFilter?: string | null;
  onStepFilterChange?: (step: string | null) => void;
}

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'complete', label: 'Complete' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'failed', label: 'Failed' },
];

const STEP_OPTIONS = [
  { value: '', label: 'All steps' },
  { value: 'report_structure', label: 'Report structure' },
  { value: 'visual', label: 'Visual' },
  { value: 'measures_formulas', label: 'Measures' },
  { value: 'filters_variables', label: 'Filters' },
];

function pathLabel(item: ConversionItem) {
  const p = item.source_path;
  if (!p) return '—';
  return [p.document, p.page, p.block].filter(Boolean).join(' › ');
}

function targetLabel(item: ConversionItem) {
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

export function ConversionItemsTable({
  items, loading, selectedId, onSelect, stepFilter, onStepFilterChange,
}: ConversionItemsTableProps) {
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    let list = items;
    if (statusFilter !== 'all') list = list.filter((i) => i.status === statusFilter);
    if (stepFilter) list = list.filter((i) => i.conversion_step === stepFilter);
    return list;
  }, [items, statusFilter, stepFilter]);

  if (loading) return <SkeletonTable />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs tabs={STATUS_TABS} active={statusFilter} onChange={setStatusFilter} />
        {onStepFilterChange && (
          <select
            className="text-sm border border-border rounded-lg px-2 py-1.5"
            value={stepFilter ?? ''}
            onChange={(e) => onStepFilterChange(e.target.value || null)}
          >
            {STEP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
        <span className="text-xs text-gray-500 ml-auto">{filtered.length} items</span>
      </div>

      <div className="border border-border rounded-xl overflow-hidden bg-white max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface border-b border-border sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Source</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-8" />
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Target</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Path</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Step</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr
                key={item.id}
                onClick={() => onSelect?.(item)}
                className={`border-b border-border cursor-pointer hover:bg-surface ${
                  selectedId === item.id ? 'bg-pink-50' : ''
                }`}
              >
                <td className="px-3 py-2 font-mono text-xs">{item.source_name}</td>
                <td className="px-3 py-2 text-gray-400"><ArrowRight size={14} /></td>
                <td className={`px-3 py-2 font-mono text-xs ${targetLabel(item) === '—' ? 'text-gray-400' : 'text-primary'}`}>
                  {targetLabel(item)}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[140px]">{pathLabel(item)}</td>
                <td className="px-3 py-2 text-xs">{item.conversion_step}</td>
                <td className="px-3 py-2"><StatusBadge status={item.status} /></td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-400">
                  No conversion items — run conversion to populate
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
