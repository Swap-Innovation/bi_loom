import { Link, useParams } from 'react-router-dom';
import type { ConversionItem, ConversionWorkspace } from '../../types';
import { SourceTargetMapper } from './SourceTargetMapper';
import { StatusBadge } from '../ui/Badge';
import { DocumentHierarchy } from '../parsing/DocumentHierarchy';
import { getStepMeta } from './conversionStepConfig';
import { Button } from '../ui/Button';

interface StepAssetsPanelProps {
  stepId: string;
  step: import('../../types').ConversionStep | undefined;
  workspace: ConversionWorkspace;
  items: ConversionItem[];
  selectedItemId?: string | null;
  onSelectItem?: (item: ConversionItem) => void;
}

function ItemList({ items, empty }: { items: ConversionItem[]; empty: string }) {
  if (!items.length) {
    return <p className="text-sm text-gray-400 py-6 text-center">{empty}</p>;
  }
  return (
    <div className="border border-border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-surface sticky top-0">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-gray-500">Source</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-500">Target</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-border">
              <td className="px-3 py-2 font-mono">{item.source_name}</td>
              <td className="px-3 py-2 font-mono text-primary">
                {(item.target_path as { visual?: string; table?: string; column?: string })?.visual
                  ?? ((item.target_path as { table?: string; column?: string })?.table
                    ? `${(item.target_path as { table: string }).table}.${(item.target_path as { column?: string }).column}`
                    : '—')}
              </td>
              <td className="px-3 py-2"><StatusBadge status={item.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StepAssetsPanel({
  stepId, step, workspace, items, selectedItemId, onSelectItem,
}: StepAssetsPanelProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const meta = getStepMeta(stepId);
  const filter = meta?.itemStepFilter;
  const stepItems = filter ? items.filter((i) => i.conversion_step === filter) : items;
  const src = workspace.source_tree;

  if (stepId === 'semantic_mapping') {
    return (
      <div className="rounded-lg border border-border p-4 text-sm text-gray-600 space-y-3">
        <p>Semantic mapping runs on the Mapping page — not in Convert.</p>
        <Link to={`/projects/${projectId}/map`}>
          <Button size="sm" variant="outline">Open Mapping</Button>
        </Link>
      </div>
    );
  }

  if (stepId === 'report_structure' && step?.items?.length) {
    return (
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {step.items.map((it, i) => (
          <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
            <span className="font-mono text-xs">{String(it.source ?? '—')}</span>
            <span className="text-gray-400">→</span>
            <span className="font-mono text-xs text-primary">{String(it.target ?? '—')}</span>
            <StatusBadge status={it.status === 'mapped' ? 'complete' : 'pending'} />
          </div>
        ))}
      </div>
    );
  }

  if (stepId === 'visual_conversion') {
    const visualItems = items.filter((i) => i.conversion_step === 'visual');
    return (
      <div className="space-y-3">
        <SourceTargetMapper
          items={visualItems}
          selectedId={selectedItemId}
          onSelect={onSelectItem}
        />
        {src && (
          <div className="h-48 border border-border rounded-lg overflow-hidden">
            <DocumentHierarchy folders={src.folders} documents={src.documents} compact />
          </div>
        )}
      </div>
    );
  }

  if (stepId === 'measures_formulas' && step?.items?.length) {
    return (
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {step.items.map((it, i) => (
          <div key={i} className="rounded-lg border border-border px-3 py-2">
            <p className="font-mono text-sm font-medium">{String(it.name ?? '—')}</p>
            <p className="text-xs text-gray-500 mt-1 truncate">{String(it.expression ?? '')}</p>
          </div>
        ))}
      </div>
    );
  }

  if (stepId === 'filters_variables') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-gray-500">Filters</p>
          <p className="text-2xl font-bold">{src?.global_filters?.length ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-gray-500">Variables</p>
          <p className="text-2xl font-bold">{src?.global_variables?.length ?? 0}</p>
        </div>
        <ItemList items={stepItems} empty="Run this step to create filter/variable conversion items." />
      </div>
    );
  }

  return <ItemList items={stepItems} empty="Run this step to produce conversion assets." />;
}
