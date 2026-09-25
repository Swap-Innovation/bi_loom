import { useEffect, useState } from 'react';
import type { MspecSection } from '../../types';
import { Badge } from '../ui/Badge';
import { TraceabilityBadge, extractSource } from '../mspec/TraceabilityBadge';

interface MspecDetailPanelProps {
  sections: MspecSection[] | null;
  selectedSource?: { type: string; data: unknown } | null;
  initialSection?: string;
  onSectionChange?: (sectionId: string) => void;
}

export function MspecDetailPanel({
  sections, selectedSource, initialSection, onSectionChange,
}: MspecDetailPanelProps) {
  const [activeSection, setActiveSection] = useState(initialSection ?? 'documents');

  useEffect(() => {
    if (initialSection) setActiveSection(initialSection);
  }, [initialSection]);

  const selectSection = (id: string) => {
    setActiveSection(id);
    onSectionChange?.(id);
  };

  if (!sections) {
    return (
      <div className="border border-border rounded-lg bg-white p-6 text-center">
        <p className="text-gray-400 text-sm">Parse BO export first to generate MSpec</p>
      </div>
    );
  }

  const section = sections.find((s) => s.id === activeSection) || sections[0];

  return (
    <div className="border border-border rounded-lg bg-white overflow-hidden flex flex-col h-full min-h-[480px]">
      <div className="px-4 py-3 bg-surface border-b border-border">
        <p className="text-sm font-semibold">MSpec Details</p>
        <p className="text-xs text-gray-400">Migration specification — every parsed BO artifact</p>
      </div>

      {selectedSource && (
        <div className="px-4 py-2 bg-blue-50 border-b border-border">
          <p className="text-xs text-gray-500 uppercase">Selected source</p>
          <p className="text-sm font-mono font-medium">{JSON.stringify(selectedSource).slice(0, 120)}…</p>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="w-44 border-r border-border overflow-y-auto shrink-0">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectSection(s.id)}
              className={`w-full text-left px-3 py-2 text-xs border-b border-border hover:bg-surface ${
                activeSection === s.id ? 'bg-blue-50 text-primary font-medium' : 'text-gray-600'
              }`}
            >
              {s.label}
              <Badge variant="outline" size="sm" className="ml-1">{s.count}</Badge>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <MspecSectionContent section={section} />
        </div>
      </div>
    </div>
  );
}

function MspecSectionContent({ section }: { section: MspecSection }) {
  if (!section.items.length) {
    return <p className="text-sm text-gray-400 text-center py-8">No {section.label.toLowerCase()} in MSpec</p>;
  }

  return (
    <div className="space-y-3">
      {section.items.map((item, idx) => (
        <MspecItemCard key={idx} item={item} sectionId={section.id} />
      ))}
    </div>
  );
}

function MspecItemCard({ item, sectionId }: { item: unknown; sectionId: string }) {
  const data = item as Record<string, unknown>;

  if (sectionId === 'documents') {
    return (
      <div className="border border-border rounded-lg p-3 text-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-semibold">{String(data.name)}</span>
          <Badge variant="outline" size="sm">{String(data.product_type)}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
          <span>Pages: {(data.pages as unknown[])?.length ?? 0}</span>
          <span>Measures: {(data.measures as unknown[])?.length ?? 0}</span>
          <span>Variables: {(data.variables as unknown[])?.length ?? 0}</span>
          <span>Queries: {(data.queries as unknown[])?.length ?? 0}</span>
        </div>
        <details className="mt-2">
          <summary className="text-xs text-primary cursor-pointer">Full document JSON</summary>
          <pre className="text-[10px] mt-1 bg-surface p-2 rounded overflow-x-auto max-h-48">{JSON.stringify(data, null, 2)}</pre>
        </details>
      </div>
    );
  }

  if (sectionId === 'queries') {
    const sql = data.sql ? String(data.sql) : null;
    const tables = data.tables as string[] | undefined;
    return (
      <div className="border border-border rounded-lg p-3 text-sm">
        <p className="font-semibold font-mono">{String(data.name || data.id)}</p>
        <TraceabilityBadge source={extractSource(data)} className="mt-1" />
        {sql && (
          <pre className="text-xs bg-surface p-2 rounded mt-2 overflow-x-auto font-mono">{sql}</pre>
        )}
        {tables && tables.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">Tables: {tables.join(', ')}</p>
        )}
      </div>
    );
  }

  if (sectionId === 'measures' || sectionId === 'variables') {
    const expression = data.expression ? String(data.expression) : null;
    const aggregation = data.aggregation ? String(data.aggregation) : null;
    const promptText = data.prompt_text ? String(data.prompt_text) : null;
    const source = data.source as Record<string, string> | undefined;
    return (
      <div className="border border-border rounded-lg p-3 text-sm">
        <p className="font-semibold font-mono">{String(data.name)}</p>
        {expression && <p className="text-xs text-gray-600 mt-1">Expr: {expression}</p>}
        {aggregation && <Badge variant="outline" size="sm" className="mt-1">{aggregation}</Badge>}
        {promptText && <p className="text-xs text-gray-500 mt-1">Prompt: {promptText}</p>}
        {source?.file && (
          <TraceabilityBadge source={source} className="mt-2" />
        )}
      </div>
    );
  }

  return (
    <details className="border border-border rounded-lg">
      <summary className="px-3 py-2 text-sm font-medium cursor-pointer hover:bg-surface">
        {String(data.name || data.id || data.term || 'Item')}
      </summary>
      <div className="px-3 pb-3">
        <TraceabilityBadge source={extractSource(data)} className="mb-2" />
        <pre className="text-[10px] overflow-x-auto font-mono text-gray-600">{JSON.stringify(data, null, 2)}</pre>
      </div>
    </details>
  );
}
