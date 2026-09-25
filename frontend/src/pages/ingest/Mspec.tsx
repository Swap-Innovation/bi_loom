import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileText, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import type { MspecDetail } from '../../types';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { MspecDetailPanel } from '../../components/conversion/MspecDetailPanel';
import { MspecSearch } from '../../components/mspec/MspecSearch';
import { PhaseContinueHint } from '../../components/navigation/PhaseContinueHint';
import { useIngestFlow } from '../../hooks/useIngestFlow';
import { useAiActivity } from '../../context/AiActivityContext';
import { usePageContext } from '../../hooks/usePageContext';

const SECTION_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Documents' },
  { id: 'queries', label: 'Queries' },
  { id: 'measures', label: 'Measures' },
  { id: 'variables', label: 'Variables' },
  { id: 'filters', label: 'Filters' },
  { id: 'visuals', label: 'Visuals' },
];

function downloadMspecJson(detail: MspecDetail) {
  const blob = new Blob([JSON.stringify(detail.mspec, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `mspec-v${detail.version}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function IngestMspecPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const { pageKey } = usePageContext();
  const { startAgent, addThought, addAction, completeAgent, failAgent } = useAiActivity();
  const { data: ingestFlow } = useIngestFlow(projectId);
  const [rawView, setRawView] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('documents');
  const [highlightItem, setHighlightItem] = useState<{ section: string; item: unknown } | null>(null);

  const mspecStep = ingestFlow?.steps?.find((s) => s.id === 'mspec');
  const flowReady = ingestFlow !== undefined;
  const needsGenerate = flowReady && (
    Boolean(ingestFlow.mspec_pending)
    || (!ingestFlow.has_mspec && (
      mspecStep?.action === 'generate' || mspecStep?.status === 'pending'
    ))
  );

  const { data: versions } = useQuery({
    queryKey: ['mspec-versions', projectId],
    queryFn: () => api.listMspecVersions(projectId!),
    enabled: !!projectId && flowReady && !needsGenerate,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['mspec-detail', projectId, selectedVersionId],
    queryFn: () => api.getMspecDetail(projectId!, selectedVersionId ?? undefined),
    enabled: !!projectId && flowReady && !needsGenerate,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const runId = startAgent('MSpec Agent', 'Generating migration specification', pageKey);
      addThought(runId, 'Load parse draft from last completed parse run', 'complete');
      addThought(runId, 'Validate documents → pages → blocks structure', 'running');
      addAction(runId, 'Materialize MSpecDocument from draft…', 'running');
      try {
        const result = await api.generateMspec(projectId!);
        addThought(runId, 'Validate documents → pages → blocks structure', 'complete');
        for (const step of result.steps) {
          addAction(runId, step.label, 'complete');
        }
        completeAgent(
          runId,
          `MSpec v${result.version} · ${result.document_count} docs · ${result.pages} pages · ${result.blocks} blocks`,
        );
        return result;
      } catch (err) {
        failAgent(runId, (err as Error).message);
        throw err;
      }
    },
    onSuccess: () => {
      toast.success('MSpec generated');
      queryClient.invalidateQueries({ queryKey: ['mspec-detail', projectId] });
      queryClient.invalidateQueries({ queryKey: ['mspec-versions', projectId] });
      queryClient.invalidateQueries({ queryKey: ['ingest-flow', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workflow', projectId] });
      queryClient.invalidateQueries({ queryKey: ['conversion', projectId] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to generate MSpec'),
  });

  if (!flowReady) return <SkeletonCard />;

  if (needsGenerate) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-title">Generate MSpec</h2>
          <p className="text-caption mt-1">
            Parsing is complete. Materialize the migration specification as a separate step before selecting a target model.
          </p>
        </div>

        <Card>
          <div className="flex flex-col items-center text-center py-8 px-4 gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
              <FileText size={22} className="text-primary" />
            </div>
            <div>
              <p className="font-semibold text-dark">MSpec draft ready</p>
              <p className="text-sm text-gray-500 mt-1 max-w-md">
                Generate writes the parsed BO inventory into a versioned MSpec document used by Target, Mapping, and Convert.
                Progress streams in BI Loom Assistant.
              </p>
            </div>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <><Loader2 size={14} className="animate-spin" /> Generating…</>
              ) : (
                'Generate MSpec'
              )}
            </Button>
            <Link to={`/projects/${projectId}/ingest/parsing`} className="text-xs text-primary hover:underline">
              Back to Parsing
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (isLoading) return <SkeletonCard />;
  if (error || !data?.mspec) {
    return (
      <Card>
        <p className="text-gray-500 text-center py-12">No MSpec available yet.</p>
        <div className="flex justify-center gap-3 mt-4">
          <Link to={`/projects/${projectId}/ingest/parsing`}>
            <Button size="sm">Go to Parsing</Button>
          </Link>
        </div>
      </Card>
    );
  }

  const filteredSections = data.sections?.filter((s) =>
    SECTION_TABS.some((t) => t.id === s.id),
  ) ?? [];

  const tabSections = filteredSections.map((s) => ({
    id: s.id,
    label: SECTION_TABS.find((t) => t.id === s.id)?.label ?? s.label,
    count: s.count,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-title">MSpec</h2>
          <p className="text-caption mt-1">
            Migration specification — queries, measures, variables, filters, and source traceability
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {versions && versions.length > 1 && (
            <select
              className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white"
              value={selectedVersionId ?? versions[0]?.id ?? ''}
              onChange={(e) => setSelectedVersionId(e.target.value || null)}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} — {new Date(v.created_at).toLocaleString()}
                </option>
              ))}
            </select>
          )}
          <Badge variant="outline">v{data.version}</Badge>
          <Button variant="outline" size="sm" onClick={() => downloadMspecJson(data)}>
            <Download size={14} className="mr-1" /> Export JSON
          </Button>
          <button
            type="button"
            onClick={() => setRawView(!rawView)}
            className="text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-surface"
          >
            {rawView ? 'Structured' : 'Raw JSON'}
          </button>
        </div>
      </div>

      <MspecSearch
        projectId={projectId!}
        search={search}
        onSearchChange={setSearch}
        onSelectResult={(section, item) => {
          setActiveTab(section);
          setHighlightItem({ section, item });
          setRawView(false);
        }}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {tabSections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveTab(s.id)}
            className={`p-3 border rounded-lg text-center transition-colors ${
              activeTab === s.id ? 'border-primary bg-blue-50' : 'border-border bg-white hover:border-primary/50'
            }`}
          >
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-xl font-bold text-primary">{s.count}</p>
          </button>
        ))}
      </div>

      {highlightItem && (
        <Card className="!p-3 bg-blue-50 border-primary/30">
          <p className="text-xs text-gray-500 mb-1">Selected from search — {highlightItem.section}</p>
          <pre className="text-[10px] overflow-x-auto font-mono">{JSON.stringify(highlightItem.item, null, 2)}</pre>
          <button type="button" className="text-xs text-primary mt-2" onClick={() => setHighlightItem(null)}>
            Clear selection
          </button>
        </Card>
      )}

      {rawView ? (
        <Card className="!p-0 overflow-hidden">
          <pre className="text-xs p-4 overflow-auto max-h-[70vh] font-mono bg-surface">
            {JSON.stringify(data.mspec, null, 2)}
          </pre>
        </Card>
      ) : (
        <div className="space-y-3">
          <Tabs tabs={tabSections} active={activeTab} onChange={setActiveTab} />
          <div className="h-[65vh]">
            <MspecDetailPanel
              sections={filteredSections}
              initialSection={activeTab}
              onSectionChange={setActiveTab}
            />
          </div>
        </div>
      )}

      <PhaseContinueHint
        className="text-right"
        to={`/projects/${projectId}/target`}
        label="Continue to Target Model"
        readyMessage="MSpec ready."
      />
    </div>
  );
}
