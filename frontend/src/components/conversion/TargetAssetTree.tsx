import {
  ChevronRight, ChevronDown, Database, Table2, BarChart3, Layers, FileBarChart,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../ui/Badge';
import type { PbiSemanticModel, PbiReport } from '../../types';

interface TargetAssetTreeProps {
  semanticModel: PbiSemanticModel | null;
  reports: PbiReport[];
  summary?: Record<string, number>;
  selectedId?: string | null;
  onSelect?: (id: string, type: string, data: unknown) => void;
}

export function TargetAssetTree({ semanticModel, reports, summary, selectedId, onSelect }: TargetAssetTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    'semantic-model': true,
    ...Object.fromEntries(reports.map((r) => [`report-${r.id}`, true])),
  }));

  const toggle = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  return (
    <div className="space-y-3">
      {summary && (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Tables" value={summary.tables ?? 0} />
          <MiniStat label="Columns" value={summary.columns ?? 0} />
          <MiniStat label="Measures" value={summary.measures ?? 0} />
          <MiniStat label="Visuals" value={summary.visuals ?? 0} />
        </div>
      )}

      <div className="border border-border rounded-xl bg-white overflow-hidden">
        <div className="px-4 py-3 bg-surface border-b border-border">
          <p className="text-sm font-semibold">Power BI Target Assets</p>
          <p className="text-xs text-gray-400">Semantic Model → Reports → Pages → Visuals</p>
        </div>

        <div className="p-2 max-h-[520px] overflow-y-auto">
          {!semanticModel && !reports.length ? (
            <p className="text-sm text-gray-400 text-center py-6">Select a target semantic model to preview PBI assets</p>
          ) : (
            <>
              {semanticModel && (
                <div>
                  <TreeButton
                    expanded={expanded['semantic-model']}
                    onClick={() => toggle('semantic-model')}
                    icon={Database}
                    label={semanticModel.name}
                    badge="Dataset"
                    selected={selectedId === semanticModel.id}
                    onSelect={() => onSelect?.(semanticModel.id, 'dataset', semanticModel)}
                  />
                  {expanded['semantic-model'] && semanticModel.tables.map((table) => (
                    <div key={table.id} className="pl-5">
                      <TreeButton
                        expanded={expanded[`table-${table.id}`]}
                        onClick={() => toggle(`table-${table.id}`)}
                        icon={Table2}
                        label={table.name}
                        badge={`${table.columns.length} cols`}
                        selected={selectedId === table.id}
                        onSelect={() => onSelect?.(table.id, 'table', table)}
                        depth={1}
                      />
                      {expanded[`table-${table.id}`] && (
                        <>
                          {table.columns.map((col) => (
                            <div
                              key={col.id}
                              className={`flex items-center gap-2 px-3 py-1 text-xs cursor-pointer hover:bg-surface rounded ${selectedId === col.id ? 'bg-pink-50' : ''}`}
                              style={{ paddingLeft: '40px' }}
                              onClick={() => onSelect?.(col.id, 'column', col)}
                            >
                              <span className="text-gray-400">⬦</span>
                              <span className="font-mono">{col.name}</span>
                              <Badge variant="outline" size="sm">{col.type}</Badge>
                            </div>
                          ))}
                          {table.measures.map((m) => (
                            <div
                              key={m.id}
                              className={`flex items-center gap-2 px-3 py-1 text-xs cursor-pointer hover:bg-surface rounded ${selectedId === m.id ? 'bg-pink-50' : ''}`}
                              style={{ paddingLeft: '40px' }}
                              onClick={() => onSelect?.(m.id, 'measure', m)}
                            >
                              <BarChart3 size={12} className="text-primary" />
                              <span className="font-mono">{m.name}</span>
                              <Badge variant="outline" size="sm">measure</Badge>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {reports.map((report) => (
                <div key={report.id} className="mt-1">
                  <TreeButton
                    expanded={expanded[`report-${report.id}`]}
                    onClick={() => toggle(`report-${report.id}`)}
                    icon={FileBarChart}
                    label={report.name}
                    badge={`${report.page_count} pages`}
                    selected={selectedId === report.id}
                    onSelect={() => onSelect?.(report.id, 'report', report)}
                  />
                  {expanded[`report-${report.id}`] && report.pages.map((page) => (
                    <div key={page.id} className="pl-5">
                      <TreeButton
                        expanded={expanded[`page-${page.id}`]}
                        onClick={() => toggle(`page-${page.id}`)}
                        icon={Layers}
                        label={page.name}
                        badge={`${page.visual_count} visuals`}
                        selected={selectedId === page.id}
                        onSelect={() => onSelect?.(page.id, 'page', page)}
                        depth={1}
                      />
                      {expanded[`page-${page.id}`] && page.visuals.map((visual) => (
                        <div
                          key={visual.id}
                          className={`flex items-center gap-2 px-3 py-1 text-xs cursor-pointer hover:bg-surface rounded ${selectedId === visual.id ? 'bg-pink-50' : ''}`}
                          style={{ paddingLeft: '40px' }}
                          onClick={() => onSelect?.(visual.id, 'visual', visual)}
                        >
                          <BarChart3 size={12} className="text-gray-400" />
                          <span>{visual.name}</span>
                          <Badge variant="outline" size="sm">{visual.type}</Badge>
                          {visual.fields.some((f) => f.status === 'unmapped') && (
                            <Badge variant="warning" size="sm">unmapped</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TreeButton({
  expanded, onClick, icon: Icon, label, badge, selected, onSelect, depth = 0,
}: {
  expanded?: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  badge?: string;
  selected?: boolean;
  onSelect?: () => void;
  depth?: number;
}) {
  return (
    <button
      type="button"
      className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-surface rounded-lg text-left ${selected ? 'bg-pink-50' : ''}`}
      style={{ paddingLeft: `${12 + depth * 8}px` }}
      onClick={() => { onClick(); onSelect?.(); }}
    >
      {expanded !== undefined ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="w-3.5" />}
      <Icon size={15} className="text-primary" />
      <span className="text-sm font-medium">{label}</span>
      {badge && <Badge variant="outline" size="sm" className="ml-auto">{badge}</Badge>}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-2 bg-white border border-border rounded-lg text-center">
      <p className="text-[10px] text-gray-500 uppercase">{label}</p>
      <p className="text-lg font-bold text-primary">{value}</p>
    </div>
  );
}
