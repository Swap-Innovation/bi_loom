import { useState } from 'react';
import { Play, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';

interface IngestDocument {
  id: string;
  name: string;
  product_type: string;
  description?: string;
  parsed?: boolean;
  can_parse?: boolean;
}

interface DocumentCaseListProps {
  documents: IngestDocument[];
  onParseSelected: (documentIds: string[]) => void;
  onParseAll: () => void;
  isRunning?: boolean;
  disabled?: boolean;
  /** Primary label for full-export parse (page owns this CTA — not the header) */
  primaryLabel?: string;
  /** Checklist ready even when manifest has no selectable documents (e.g. raw XML) */
  checklistReady?: boolean;
}

export function DocumentCaseList({
  documents, onParseSelected, onParseAll, isRunning, disabled,
  primaryLabel = 'Start Parsing',
  checklistReady = false,
}: DocumentCaseListProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const canStart = !disabled && !isRunning && (checklistReady || documents.length > 0);

  if (!documents.length) {
    return (
      <Card title="Parsing" className="!p-0 overflow-hidden">
        <div className="px-4 py-3 bg-surface border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-gray-600">
            {checklistReady
              ? 'No document manifest — parse the full uploaded export'
              : 'Upload a BO export to see parseable documents'}
          </p>
          <Button size="sm" onClick={onParseAll} disabled={!canStart}>
            {isRunning ? 'Parsing…' : primaryLabel}
          </Button>
        </div>
        {!checklistReady && (
          <p className="text-sm text-gray-500 text-center py-6 px-4">
            Upload a Business Objects export on the Upload page first.
          </p>
        )}
      </Card>
    );
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(documents.map((d) => d.id)));

  return (
    <Card title="Parsing" className="!p-0 overflow-hidden">
      <div className="px-4 py-3 bg-surface border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-600">
          Run the full export, or select documents for a targeted parse
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={selectAll} disabled={disabled || isRunning}>
            Select all
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onParseSelected(Array.from(selected))}
            disabled={disabled || isRunning || selected.size === 0}
          >
            <Play size={14} /> Parse selected ({selected.size})
          </Button>
          <Button size="sm" onClick={onParseAll} disabled={!canStart}>
            {isRunning ? 'Parsing…' : primaryLabel}
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {documents.map((doc) => (
          <li key={doc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface/50">
            <input
              type="checkbox"
              className="rounded border-border"
              checked={selected.has(doc.id)}
              onChange={() => toggle(doc.id)}
              disabled={disabled || isRunning || !doc.can_parse}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{doc.name}</p>
              {doc.description && (
                <p className="text-xs text-gray-500 truncate">{doc.description}</p>
              )}
            </div>
            <Badge variant="outline" size="sm">{doc.product_type}</Badge>
            {doc.parsed && (
              <span className="flex items-center gap-1 text-xs text-success">
                <CheckCircle2 size={14} /> Parsed
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
