import { Link } from 'react-router-dom';
import { Check, X, Edit, ExternalLink } from 'lucide-react';
import type { Mapping } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ConfidenceBadge, StatusBadge } from '../ui/Badge';
import { TraceabilityBadge } from '../mspec/TraceabilityBadge';
import { MappingLineage } from './MappingLineage';

interface MappingInspectorProps {
  mapping: Mapping | null;
  projectId: string;
  editTarget: { table: string; column: string };
  onEditTargetChange: (v: { table: string; column: string }) => void;
  onApprove: () => void;
  onReject: () => void;
  onSave: () => void;
  busy?: boolean;
}

function targetDisplay(m: Mapping) {
  if (m.target_measure) return `${m.target_table}.${m.target_measure}`;
  if (m.target_table && m.target_column) return `${m.target_table}.${m.target_column}`;
  return '—';
}

export function MappingInspector({
  mapping, projectId, editTarget, onEditTargetChange, onApprove, onReject, onSave, busy,
}: MappingInspectorProps) {
  if (!mapping) {
    return (
      <Card className="!p-4">
        <p className="text-sm text-gray-400 text-center py-4">
          Select a mapping row to inspect lineage and approve or reject
        </p>
        <p className="text-xs text-gray-400 text-center">Shortcuts: ↑↓ navigate · A approve · R reject</p>
      </Card>
    );
  }

  const ctx = mapping.source_context as Record<string, string> | null;
  const mspecPath = ctx?.mspec_path;
  const canApprove = Boolean(
    mapping.target_table && (mapping.target_column || mapping.target_measure),
  );

  return (
    <Card title="Mapping Inspector" className="!p-4 space-y-4">
      <MappingLineage mapping={mapping} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-caption uppercase mb-1">AI recommendation</p>
          <p className="font-mono">{targetDisplay(mapping)}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="font-semibold text-primary">{Math.round(mapping.confidence)}%</span>
            <ConfidenceBadge level={mapping.confidence_level} />
            <StatusBadge status={mapping.status} />
          </div>
          {mapping.reasoning && mapping.reasoning.length > 0 && (
            <div className="mt-3">
              <p className="text-caption uppercase mb-1">Why?</p>
              <ul className="text-xs space-y-1">{mapping.reasoning.map((r, i) => <li key={i}>• {r}</li>)}</ul>
            </div>
          )}
          {mapping.evidence && mapping.evidence.length > 0 && (
            <div className="mt-2">
              <p className="text-caption uppercase mb-1">Evidence</p>
              <ul className="text-xs text-gray-500 space-y-0.5">{mapping.evidence.map((e, i) => <li key={i}>— {e}</li>)}</ul>
            </div>
          )}
          {mspecPath && (
            <Link
              to={`/projects/${projectId}/ingest/mspec`}
              className="inline-flex items-center gap-1 text-xs text-primary mt-3 hover:underline"
            >
              <ExternalLink size={12} /> Trace in MSpec
            </Link>
          )}
          {ctx && <TraceabilityBadge source={{ file: ctx.document, path: mspecPath }} className="mt-2" />}
        </div>

        <div>
          <p className="text-caption uppercase mb-1">Manual override</p>
          <div className="space-y-2">
            <input
              className="w-full border border-border rounded-lg px-3 py-1.5 text-sm font-mono"
              placeholder="Target table"
              value={editTarget.table}
              onChange={(e) => onEditTargetChange({ ...editTarget, table: e.target.value })}
            />
            <input
              className="w-full border border-border rounded-lg px-3 py-1.5 text-sm font-mono"
              placeholder="Target column"
              value={editTarget.column}
              onChange={(e) => onEditTargetChange({ ...editTarget, column: e.target.value })}
            />
          </div>
          {!canApprove && (
            <p className="text-xs text-amber-700 mt-2">
              Assign a target (click schema tree or Save override) before approving.
            </p>
          )}
          <div className="flex gap-2 mt-3 flex-wrap">
            <Button size="sm" onClick={onApprove} disabled={busy || !canApprove}>
              <Check size={14} /> Approve
            </Button>
            <Button size="sm" variant="danger" onClick={onReject} disabled={busy}>
              <X size={14} /> Reject
            </Button>
            <Button size="sm" variant="outline" onClick={onSave} disabled={busy}>
              <Edit size={14} /> Save
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
