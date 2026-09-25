import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle, Circle, Loader, ChevronDown, ChevronRight,
  Database, Layers, FileText, Search, Variable, Calculator,
  Filter, Layout, BarChart3, Palette, Link2, Package, ArrowRight,
} from 'lucide-react';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/Dialog';
import { DocumentHierarchy } from '../components/parsing/DocumentHierarchy';
import type { ParseSection } from '../components/parsing/parseViewUtils';
import { useJob } from '../hooks/useJob';
import { usePersistedState } from '../hooks/usePersistedState';
import { DocumentCaseList } from '../components/ingest/DocumentCaseList';
import { useIngestFlow } from '../hooks/useIngestFlow';
import { useJobTray } from '../context/JobTrayContext';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  platform_organization: Database,
  data_connectivity: Database,
  semantic_layer: Layers,
  report_document: FileText,
  queries: Search,
  variables: Variable,
  calculations: Calculator,
  filters: Filter,
  layout: Layout,
  visuals: BarChart3,
  formatting: Palette,
  interactivity: Link2,
  mspec: Package,
};

const STEP_LABELS: Record<string, string> = {
  files_detected: 'Export files detected & validated',
  folders_parsed: 'BI Launch Pad folders / categories',
  documents_discovered: 'Documents discovered (WebI, Crystal, Dashboard, Analysis)',
  product_types_identified: 'Product types identified',
  connections_parsed: 'Connections (JDBC/ODBC/OLAP/BEx)',
  universes_parsed: 'Universes / Data foundations',
  data_providers_parsed: 'Data providers',
  classes_parsed: 'Universe classes',
  dimensions_parsed: 'Dimensions',
  measures_parsed: 'Universe measures',
  details_parsed: 'Detail objects',
  contexts_parsed: 'Contexts',
  lovs_parsed: 'Lists of values (LOVs)',
  hierarchies_parsed: 'Hierarchies',
  document_properties_parsed: 'Document properties',
  pages_parsed: 'Pages / report tabs',
  sections_parsed: 'Sections & structure zones',
  queries_parsed: 'Query definitions',
  sql_parsed: 'SQL / MDX statements',
  joins_parsed: 'Joins & relationships',
  result_objects_parsed: 'Result objects',
  query_filters_parsed: 'Query-level filters',
  prompts_parsed: 'Prompts / input controls',
  variables_parsed: 'Variables',
  merged_variables_parsed: 'Merged variables',
  calculations_parsed: 'Calculations',
  formulas_parsed: 'Formulas',
  aggregations_parsed: 'Aggregations',
  report_filters_parsed: 'Report filters',
  block_filters_parsed: 'Block filters',
  scope_of_analysis_parsed: 'Scope of analysis',
  blocks_parsed: 'Blocks & containers',
  breaks_parsed: 'Breaks & grouping',
  positioning_parsed: 'Position & size (x, y, w, h)',
  headers_footers_parsed: 'Headers & footers',
  tables_parsed: 'Tables',
  charts_parsed: 'Charts',
  crosstabs_parsed: 'Crosstabs / matrices',
  free_cells_parsed: 'Free-standing cells',
  unsupported_visuals_parsed: 'Unsupported visuals (flagged)',
  fonts_parsed: 'Fonts & typography',
  colors_parsed: 'Colors (fill, text, series)',
  borders_parsed: 'Borders & lines',
  conditional_formatting_parsed: 'Conditional formatting rules',
  number_formats_parsed: 'Number & date formats',
  drill_paths_parsed: 'Drill paths',
  hyperlinks_parsed: 'Hyperlinks',
  alerts_parsed: 'Alerts',
  dependencies_resolved: 'Dependencies resolved',
  mspec_generated: 'MSpec generated',
};

interface ParseSectionLocal extends ParseSection {}

export function ParsingPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const { trackJob } = useJobTray();
  const [jobId, setJobId] = useState<string | null>(null);
  const [showReparseConfirm, setShowReparseConfirm] = useState(false);
  const [expanded, setExpanded] = usePersistedState<Record<string, boolean>>(
    `parse-expanded-${projectId}`,
    {},
  );

  const { data: parseStatus, refetch } = useQuery({
    queryKey: ['parseStatus', projectId],
    queryFn: () => api.getParseStatus(projectId!),
    enabled: !!projectId,
    refetchInterval: jobId ? 2000 : false,
  });

  const { data: ingestFlow, refetch: refetchIngestFlow } = useIngestFlow(projectId);

  useJob(jobId, {
    onComplete: () => {
      toast.success('Parsing completed');
      setJobId(null);
      refetch();
      refetchIngestFlow();
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workflow', projectId] });
      queryClient.invalidateQueries({ queryKey: ['ingest-flow', projectId] });
    },
    onFailed: () => {
      toast.error('Parsing failed');
      setJobId(null);
      refetch();
      refetchIngestFlow();
      queryClient.invalidateQueries({ queryKey: ['workflow', projectId] });
      queryClient.invalidateQueries({ queryKey: ['ingest-flow', projectId] });
    },
  });

  const parseMutation = useMutation({
    mutationFn: (documentIds?: string[]) => api.startParse(projectId!, documentIds),
    onSuccess: (data) => {
      setJobId(data.job_id);
      const label = data.document_ids?.length
        ? `BO Parse (${data.document_ids.length} docs)`
        : 'BO Parse';
      trackJob({ id: data.job_id, label, projectId: projectId!, pageKey: 'ingest/parsing' });
      toast.info('Parsing started');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to start parsing'),
  });

  const runParse = (documentIds?: string[]) => {
    if (parseStatus?.status === 'COMPLETED' && !documentIds) {
      setShowReparseConfirm(true);
      return;
    }
    parseMutation.mutate(documentIds);
  };

  const completed = parseStatus?.progress?.completed ?? [];
  const sections: ParseSectionLocal[] = parseStatus?.progress?.sections ?? [];
  const currentStep = parseStatus?.progress?.step;
  const isRunning = parseStatus?.status === 'RUNNING' || jobId !== null;
  const grandTotal = parseStatus?.progress?.grand_total;
  const hierarchy = parseStatus?.progress?.hierarchy as {
    folders?: { id: string; name: string; path?: string }[];
    documents?: import('../components/parsing/DocumentHierarchy').HierarchyDocument[];
  } | undefined;
  const hierarchySummary = parseStatus?.progress?.hierarchy_summary as {
    folders?: number; documents?: number; pages?: number; blocks?: number;
    product_types?: Record<string, number>;
  } | undefined;

  const toggleSection = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const StepIcon = ({ done, current }: { done: boolean; current: boolean }) => {
    if (done) return <CheckCircle size={16} className="text-success shrink-0" />;
    if (current) return <Loader size={16} className="text-primary animate-spin shrink-0" />;
    return <Circle size={16} className="text-gray-300 shrink-0" />;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Parsing Business Objects Export</h2>
          <p className="text-sm text-gray-500 mt-1">
            Run parsing below. When finished, continue to <strong>Generate MSpec</strong>.
          </p>
        </div>
      </div>

      <div className="mb-6">
        {!ingestFlow?.checklist?.ready && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
            <strong>Upload required.</strong>{' '}
            Upload a valid Business Objects export on the{' '}
            <Link to={`/projects/${projectId}/ingest/artifacts`} className="text-primary underline">
              Upload page
            </Link>{' '}
            before parsing. Only files currently uploaded to this project are used — sample-data is not parsed directly.
          </div>
        )}
        <DocumentCaseList
          documents={ingestFlow?.documents ?? []}
          onParseSelected={(ids) => runParse(ids)}
          onParseAll={() => runParse()}
          isRunning={isRunning || parseMutation.isPending}
          disabled={!ingestFlow?.checklist?.ready}
          checklistReady={!!ingestFlow?.checklist?.ready}
          primaryLabel={
            isRunning || parseMutation.isPending
              ? 'Parsing…'
              : parseStatus?.status === 'COMPLETED'
                ? 'Re-parse Export'
                : 'Start Parsing'
          }
        />
      </div>

      {grandTotal !== undefined && parseStatus?.status === 'COMPLETED' && (
        <div className="mb-4 p-4 bg-white border border-border rounded-lg flex items-center justify-between">
          <span className="text-sm text-gray-500">Total assets parsed</span>
          <span className="text-2xl font-bold text-primary">{grandTotal}</span>
        </div>
      )}

      {parseStatus?.status === 'COMPLETED' && hierarchy?.documents && hierarchy.documents.length > 0 && (
        <div className="mb-6">
          <DocumentHierarchy
            folders={hierarchy.folders || []}
            documents={hierarchy.documents}
            summary={hierarchySummary}
            headerAction={(
              <Link
                to={`/projects/${projectId}/ingest/mspec`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {ingestFlow?.mspec_pending || !ingestFlow?.has_mspec
                  ? <>Generate MSpec <ArrowRight size={12} /></>
                  : <>View MSpec <ArrowRight size={12} /></>}
              </Link>
            )}
          />
        </div>
      )}

      {parseStatus?.status === 'COMPLETED' && !(hierarchy?.documents?.length) && (
        <div className="mb-6 p-4 bg-white border border-border rounded-lg flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-gray-600">Parsing complete — draft ready for MSpec.</p>
          <Link to={`/projects/${projectId}/ingest/mspec`}>
            <Button size="sm">
              {ingestFlow?.mspec_pending || !ingestFlow?.has_mspec ? 'Generate MSpec' : 'View MSpec'}
              <ArrowRight size={14} />
            </Button>
          </Link>
        </div>
      )}

      {sections.length > 0 ? (
        <div className="space-y-3">
          {sections.map((section) => {
            const sectionId = section.id;
            const Icon = CATEGORY_ICONS[sectionId] || FileText;
            const isExpanded = expanded[sectionId] ?? isRunning;
            const sectionDone = section.status === 'completed';
            const sectionRunning = section.status === 'running' || (
              isRunning && (section.completed_steps?.some((s) => s === currentStep) ?? false)
            );
            const stepsToShow = section.completed_steps ?? [];

            return (
              <Card key={sectionId} className="!p-0 overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface transition-colors text-left"
                  onClick={() => toggleSection(sectionId)}
                >
                  {sectionDone ? (
                    <CheckCircle size={20} className="text-success shrink-0" />
                  ) : sectionRunning ? (
                    <Loader size={20} className="text-primary animate-spin shrink-0" />
                  ) : (
                    <Circle size={20} className="text-gray-300 shrink-0" />
                  )}
                  <Icon size={18} className="text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{section.label}</p>
                    {section.description && (
                      <p className="text-xs text-gray-400 truncate">{section.description}</p>
                    )}
                  </div>
                  {section.count !== undefined && section.count > 0 && (
                    <Badge variant="primary" size="sm">{section.count} assets</Badge>
                  )}
                  {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-border px-5 py-3 bg-surface/50">
                    <div className="space-y-1.5">
                      {stepsToShow.map((step) => {
                        const done = completed.includes(step);
                        const current = currentStep === step;
                        return (
                          <div key={step} className="flex items-center gap-2 pl-6">
                            <StepIcon done={done} current={current} />
                            <span className={`text-xs ${done ? 'text-dark' : current ? 'text-primary font-medium' : 'text-gray-400'}`}>
                              {STEP_LABELS[step] || step}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {section.items && section.items.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Extracted assets</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                          {section.items.map((item: { name: string; type: string; [key: string]: unknown }, i: number) => {
                            const pos = item as { x?: string; y?: string; width?: string; height?: string };
                            const conn = item as { conn_type?: string };
                            const color = item as { seriesColor?: string };
                            return (
                            <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 bg-white rounded border border-border">
                              <span className="font-mono text-dark truncate">{item.name}</span>
                              <Badge variant="outline" size="sm">{item.type}</Badge>
                              {pos.x !== undefined && (
                                <span className="text-gray-400 ml-auto shrink-0">
                                  {pos.x},{pos.y} {pos.width}×{pos.height}
                                </span>
                              )}
                              {conn.conn_type && (
                                <span className="text-gray-400 ml-auto shrink-0">{conn.conn_type}</span>
                              )}
                              {color.seriesColor && (
                                <span className="w-3 h-3 rounded-full ml-auto shrink-0 border" style={{ background: color.seriesColor }} />
                              )}
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <p className="text-gray-500 text-sm text-center py-8">
            Start parsing to see step-by-step progress across all SAP BO asset categories.
          </p>
        </Card>
      )}

      {parseStatus?.status === 'FAILED' && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-error text-sm">
          <strong>Parser Failed:</strong> {parseStatus.error_message}
        </div>
      )}

      {parseStatus?.capability_report && (
        <Card title="Parser Capability Report" className="mt-4">
          {Array.isArray(parseStatus.capability_report.unsupported) && parseStatus.capability_report.unsupported.length > 0 && (
            <div className="text-sm text-warning mb-2">
              <strong>Unsupported:</strong> {(parseStatus.capability_report.unsupported as string[]).join(', ')}
            </div>
          )}
          {Array.isArray(parseStatus.capability_report.warnings) && parseStatus.capability_report.warnings.length > 0 && (
            <div className="text-sm text-gray-500">
              <strong>Warnings:</strong> {(parseStatus.capability_report.warnings as string[]).join(', ')}
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={showReparseConfirm}
        onClose={() => setShowReparseConfirm(false)}
        onConfirm={() => { setShowReparseConfirm(false); parseMutation.mutate(undefined); }}
        title="Re-parse export?"
        message="Re-parsing will refresh the draft parse results. You will need to Generate MSpec again afterward."
        confirmLabel="Re-parse"
        variant="danger"
      />
    </div>
  );
}
