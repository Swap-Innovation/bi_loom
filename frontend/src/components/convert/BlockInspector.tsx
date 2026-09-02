import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import type { ConversionItem } from '../../types';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { SourceTargetMapper } from './SourceTargetMapper';
import { useSelection } from '../../context/SelectionContext';

interface BlockInspectorProps {
  projectId: string;
  blockItems: ConversionItem[];
  onUpdated: () => void;
}

function blockTargetLabel(item: ConversionItem | undefined): string {
  if (!item?.target_path) return '—';
  const t = item.target_path as { visual?: string; report?: string; page?: string };
  if (t.visual && t.report) return `${t.report} › ${t.page ?? 'Page'} › ${t.visual}`;
  if (t.visual) return t.visual;
  return '—';
}

export function BlockInspector({ projectId, blockItems, onUpdated }: BlockInspectorProps) {
  const { sourceData, sourceType, conversionItemId } = useSelection();
  const [overrideStatus, setOverrideStatus] = useState('complete');
  const [overrideTarget, setOverrideTarget] = useState('');

  const blockItem = blockItems.find((i) => i.source_type === 'block');
  const fieldItems = blockItems.filter((i) => i.source_type === 'field');
  const activeItem = blockItems.find((i) => i.id === conversionItemId) ?? blockItem ?? fieldItems[0];

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.updateConversionItem(projectId, activeItem!.id, data),
    onSuccess: () => {
      toast.success('Conversion item updated');
      onUpdated();
    },
    onError: () => toast.error('Update failed'),
  });

  if (sourceType !== 'block' || !sourceData) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-3 bg-surface border-b border-border shrink-0">
          <p className="text-sm font-semibold">Block Inspector</p>
          <p className="text-xs text-gray-400">Select a block to see source → target mapping</p>
        </div>
        <p className="text-sm text-gray-400 text-center py-12 px-4">
          Select a block in the source tree to inspect MSpec details and mapping status
        </p>
      </div>
    );
  }

  const block = sourceData as {
    id: string;
    type: string;
    title?: string;
    name?: string;
    status?: string;
    field_names?: string[];
    documentName?: string;
    pageName?: string;
  };

  const blockTitle = block.title || block.name || block.type;
  const targetLabel = blockTargetLabel(blockItem);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 bg-surface border-b border-border shrink-0">
        <p className="text-sm font-semibold">Block Inspector</p>
        <p className="text-xs text-gray-400">{block.documentName} › {block.pageName}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        <div className="rounded-lg border border-border p-3 bg-surface">
          <p className="text-caption uppercase mb-2">Source → Target</p>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="flex-1 truncate" title={blockTitle}>{blockTitle}</span>
            <ArrowRight size={14} className="text-gray-400 shrink-0" />
            <span className={`flex-1 truncate ${targetLabel === '—' ? 'text-gray-400' : 'text-primary'}`} title={targetLabel}>
              {targetLabel}
            </span>
          </div>
          <div className="flex gap-2 mt-2">
            <StatusBadge status={block.status || 'SUPPORTED'} />
            <span className="text-xs text-gray-500">{block.type}</span>
          </div>
        </div>

        {fieldItems.length > 0 && (
          <div>
            <p className="text-caption uppercase mb-2">Field mappings ({fieldItems.length})</p>
            <SourceTargetMapper
              items={fieldItems}
              selectedId={conversionItemId}
              onSelect={() => {}}
            />
          </div>
        )}

        {block.field_names && block.field_names.length > 0 && fieldItems.length === 0 && (
          <div>
            <p className="text-caption uppercase mb-1">Fields ({block.field_names.length})</p>
            <p className="text-xs text-gray-500">Run conversion to generate field-level mappings.</p>
            <ul className="text-xs font-mono space-y-0.5 max-h-24 overflow-y-auto mt-2">
              {block.field_names.map((f) => <li key={f}>⬦ {f}</li>)}
            </ul>
          </div>
        )}

        {activeItem && (
          <div className="border-t border-border pt-4">
            <p className="text-caption uppercase mb-2">Manual override</p>
            <select
              className="w-full border border-border rounded-lg px-2 py-1.5 text-sm mb-2"
              value={overrideStatus}
              onChange={(e) => setOverrideStatus(e.target.value)}
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="complete">Complete</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </select>
            <input
              className="w-full border border-border rounded-lg px-2 py-1.5 text-sm font-mono mb-2"
              placeholder="Target: Table.Column or visual name"
              value={overrideTarget}
              onChange={(e) => setOverrideTarget(e.target.value)}
            />
            <Button
              size="sm"
              disabled={updateMutation.isPending || !activeItem}
              onClick={() => {
                const data: Record<string, unknown> = { status: overrideStatus };
                if (overrideTarget.includes('.')) {
                  const [table, column] = overrideTarget.split('.');
                  data.target_path = { table, column };
                } else if (overrideTarget) {
                  data.target_path = { visual: overrideTarget };
                }
                updateMutation.mutate(data);
              }}
            >
              Save override
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
