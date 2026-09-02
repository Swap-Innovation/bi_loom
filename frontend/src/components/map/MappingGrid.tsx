import { useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import type { Mapping } from '../../types';
import { ConfidenceBadge, StatusBadge } from '../ui/Badge';
import { SkeletonTable } from '../ui/Skeleton';

interface MappingGridProps {
  mappings: Mapping[];
  selectedId: string | null;
  loading?: boolean;
  onSelect: (mapping: Mapping) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

function targetDisplay(m: Mapping) {
  if (m.target_measure) return `${m.target_table}.${m.target_measure}`;
  if (m.target_table && m.target_column) return `${m.target_table}.${m.target_column}`;
  return '—';
}

function hasTarget(m: Mapping) {
  return Boolean(m.target_table && (m.target_column || m.target_measure));
}

export function MappingGrid({
  mappings, selectedId, loading, onSelect, onApprove, onReject,
}: MappingGridProps) {
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    if (selectedId && rowRefs.current[selectedId]) {
      rowRefs.current[selectedId]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedId]);

  if (loading) return <SkeletonTable />;

  if (!mappings.length) {
    return <p className="text-sm text-gray-500 text-center py-12">No mappings match filters</p>;
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-white h-full flex flex-col">
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="bg-surface border-b border-border sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Source</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Confidence</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Target</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => {
              const selected = m.id === selectedId;
              const canApprove = hasTarget(m);
              return (
                <tr
                  key={m.id}
                  ref={(el) => { rowRefs.current[m.id] = el; }}
                  id={`mapping-row-${m.id}`}
                  onClick={() => onSelect(m)}
                  className={`border-b border-border cursor-pointer transition-colors ${
                    selected ? 'bg-pink-50' : 'hover:bg-surface'
                  }`}
                >
                  <td className="px-3 py-2">
                    <p className="font-mono text-xs font-medium">{m.source_name}</p>
                    <p className="text-[10px] text-gray-400 font-mono truncate max-w-[180px]" title={targetDisplay(m)}>
                      → {targetDisplay(m)}
                    </p>
                    {(m.source_context as { document?: string } | null)?.document && (
                      <p className="text-[10px] text-gray-400 truncate max-w-[140px]">
                        {(m.source_context as { document: string }).document}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{m.source_type}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-primary">{Math.round(m.confidence)}%</span>
                      <ConfidenceBadge level={m.confidence_level} />
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{targetDisplay(m)}</td>
                  <td className="px-3 py-2"><StatusBadge status={m.status} /></td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={`p-1 rounded ${canApprove ? 'hover:bg-green-50 text-success' : 'text-gray-300 cursor-not-allowed'}`}
                        title={canApprove ? 'Approve' : 'Assign a target before approving'}
                        disabled={!canApprove}
                        onClick={() => canApprove && onApprove(m.id)}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-red-50 text-error"
                        title="Reject"
                        onClick={() => onReject(m.id)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
