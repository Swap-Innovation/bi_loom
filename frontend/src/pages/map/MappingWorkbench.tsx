import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GitCompare } from 'lucide-react';
import { api } from '../../services/api';
import type { Mapping } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SearchInput } from '../../components/ui/SearchInput';
import { Tabs } from '../../components/ui/Tabs';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { SplitPane } from '../../components/ui/SplitPane';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { SourceFieldTree, extractDocumentsFromWorkspace, type SourceField } from '../../components/map/SourceFieldTree';
import { TargetSchemaTree } from '../../components/map/TargetSchemaTree';
import { MappingGrid } from '../../components/map/MappingGrid';
import { MappingInspector } from '../../components/map/MappingInspector';
import { PhaseContinueHint } from '../../components/navigation/PhaseContinueHint';
import { useJob } from '../../hooks/useJob';
import { useJobTray } from '../../context/JobTrayContext';
import { useWorkflow } from '../../hooks/useWorkflow';

export function MappingWorkbench() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const { trackJob } = useJobTray();
  const { data: workflow } = useWorkflow(projectId);

  const [selected, setSelected] = useState<Mapping | null>(null);
  const [highlightField, setHighlightField] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState({ table: '', column: '' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [documentFilter, setDocumentFilter] = useState('');
  const [unmappedOnly, setUnmappedOnly] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<'approve' | 'reject' | null>(null);

  const targetPhase = workflow?.phases.find((p) => p.id === 'target');
  const mapPhase = workflow?.phases.find((p) => p.id === 'map');
  const targetReady = targetPhase?.status === 'complete';
  const mapComplete = mapPhase?.status === 'complete';

  const { data: activeJob } = useQuery({
    queryKey: ['mapping-active-job', projectId],
    queryFn: () => api.getActiveMappingJob(projectId!),
    enabled: !!projectId && targetReady,
    refetchInterval: (q) => (q.state.data?.job_id ? 2000 : 8000),
  });

  // Restore in-progress mapping job after navigation / refresh
  useEffect(() => {
    if (!activeJob?.job_id) return;
    setJobId((prev) => {
      if (prev === activeJob.job_id) return prev;
      trackJob({
        id: activeJob.job_id,
        label: 'AI Mapping',
        projectId: projectId!,
        pageKey: 'map',
      });
      return activeJob.job_id;
    });
  }, [activeJob?.job_id, projectId, trackJob]);

  const { data: workspace } = useQuery({
    queryKey: ['conversion', projectId],
    queryFn: () => api.getConversionWorkspace(projectId!),
    enabled: !!projectId,
  });

  const { data: plutoTree, isLoading: treeLoading } = useQuery({
    queryKey: ['pluto-tree', projectId],
    queryFn: () => api.getPlutoModelTree(projectId!),
    enabled: !!projectId && targetReady,
  });

  const filterParams = useMemo(() => ({
    status: statusFilter === 'all' ? undefined : statusFilter,
    document: documentFilter || undefined,
    unmapped_only: unmappedOnly || undefined,
  }), [statusFilter, documentFilter, unmappedOnly]);

  const { data: mappings, isLoading, refetch } = useQuery({
    queryKey: ['mappings', projectId, filterParams],
    queryFn: () => api.listMappingsFiltered(projectId!, filterParams),
    enabled: !!projectId,
    refetchInterval: jobId || activeJob?.job_id ? 2000 : false,
  });

  const { data: stats } = useQuery({
    queryKey: ['mapping-stats', projectId],
    queryFn: () => api.getMappingStats(projectId!),
    enabled: !!projectId,
    refetchInterval: jobId || activeJob?.job_id ? 2000 : false,
  });

  const { documents, folders } = extractDocumentsFromWorkspace(workspace);

  const documentOptions = useMemo(() => {
    const names = new Set<string>();
    mappings?.forEach((m) => {
      const doc = (m.source_context as { document?: string } | null)?.document;
      if (doc) names.add(doc);
    });
    documents.forEach((d) => names.add(d.name));
    return Array.from(names).sort();
  }, [mappings, documents]);

  const filtered = useMemo(() => {
    if (!mappings) return [];
    if (!search) return mappings;
    const q = search.toLowerCase();
    return mappings.filter((m) =>
      m.source_name.toLowerCase().includes(q) ||
      m.target_table?.toLowerCase().includes(q) ||
      m.target_column?.toLowerCase().includes(q),
    );
  }, [mappings, search]);

  const selectMapping = useCallback((m: Mapping) => {
    setSelected(m);
    setHighlightField(m.source_name);
    setEditTarget({ table: m.target_table || '', column: m.target_column || '' });
  }, []);

  const { job: mappingJob } = useJob(jobId, {
    onComplete: () => {
      toast.success('AI mapping completed');
      setJobId(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['mapping-stats', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workflow', projectId] });
      queryClient.invalidateQueries({ queryKey: ['mappings', projectId] });
      queryClient.invalidateQueries({ queryKey: ['mapping-active-job', projectId] });
    },
    onFailed: (job) => {
      toast.error(job.error_message || 'Mapping failed');
      setJobId(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['mappings', projectId] });
      queryClient.invalidateQueries({ queryKey: ['mapping-stats', projectId] });
      queryClient.invalidateQueries({ queryKey: ['mapping-active-job', projectId] });
    },
    pollInterval: 800,
  });

  const mapProgress = mappingJob?.progress as {
    current?: number;
    total?: number;
    step_label?: string;
    agent?: string;
    stats?: Record<string, number>;
  } | null | undefined;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['mappings', projectId] });
    queryClient.invalidateQueries({ queryKey: ['mapping-stats', projectId] });
    queryClient.invalidateQueries({ queryKey: ['workflow', projectId] });
  };

  const mappingMutation = useMutation({
    mutationFn: () => api.runMapping(projectId!),
    onSuccess: (data) => {
      setJobId(data.job_id);
      trackJob({ id: data.job_id, label: 'AI Mapping', projectId: projectId!, pageKey: 'map' });
      queryClient.invalidateQueries({ queryKey: ['mapping-active-job', projectId] });
      toast.info('Mapping started');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to start mapping'),
  });

  const bulkApproveHighMutation = useMutation({
    mutationFn: () => api.bulkApproveMappings(projectId!, 90),
    onSuccess: (data) => {
      const skipped = data.skipped_unmapped ? ` · skipped ${data.skipped_unmapped} unmapped` : '';
      toast.success(`Approved ${data.approved} high-confidence mappings${skipped}`);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkApproveAllMutation = useMutation({
    mutationFn: () => api.bulkApproveAllMappings(projectId!),
    onSuccess: (data) => {
      const skipped = data.skipped_unmapped
        ? ` · ${data.skipped_unmapped} still need a target`
        : '';
      toast.success(`Approved ${data.approved} mappings${skipped}`);
      setBulkConfirm(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkRejectAllMutation = useMutation({
    mutationFn: () => api.bulkRejectAllMappings(projectId!),
    onSuccess: (data) => {
      toast.success(`Rejected ${data.rejected} mappings`);
      setBulkConfirm(null);
      invalidate();
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveMapping(projectId!, id),
    onSuccess: () => { invalidate(); toast.success('Approved'); },
    onError: (err: Error) => toast.error(err.message || 'Approve failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.rejectMapping(projectId!, id),
    onSuccess: () => { invalidate(); setSelected(null); toast.success('Rejected'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, string> }) =>
      api.updateMapping(projectId!, id, data),
    onSuccess: () => { invalidate(); toast.success('Mapping updated'); },
  });

  const assignTarget = useCallback((table: string, column: string, isMeasure = false) => {
    if (!selected) {
      toast.info('Select a mapping row first');
      return;
    }
    const data: Record<string, string> = isMeasure
      ? { target_table: table, target_measure: column }
      : { target_table: table, target_column: column };
    updateMutation.mutate({ id: selected.id, data });
    setEditTarget({ table, column });
  }, [selected, updateMutation]);

  const handleSourceField = useCallback((field: SourceField) => {
    setHighlightField(field.name);
    const match = filtered.find((m) => m.source_name.toUpperCase() === field.name.toUpperCase());
    if (match) selectMapping(match);
    else toast.info(`No mapping row for "${field.name}"`);
  }, [filtered, selectMapping]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!filtered.length) return;
      const idx = selected ? filtered.findIndex((m) => m.id === selected.id) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = filtered[Math.min(idx + 1, filtered.length - 1)];
        if (next) selectMapping(next);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = filtered[Math.max(idx - 1, 0)];
        if (prev) selectMapping(prev);
      } else if (
        selected && e.key === 'a' && !e.metaKey
        && !(e.target instanceof HTMLInputElement)
        && !(e.target instanceof HTMLTextAreaElement)
        && !bulkConfirm
      ) {
        const canApprove = Boolean(
          selected.target_table && (selected.target_column || selected.target_measure),
        );
        if (canApprove) approveMutation.mutate(selected.id);
        else toast.info('Assign a target before approving');
      } else if (
        selected && e.key === 'r' && !e.metaKey
        && !(e.target instanceof HTMLInputElement)
        && !(e.target instanceof HTMLTextAreaElement)
        && !bulkConfirm
      ) {
        rejectMutation.mutate(selected.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filtered, selected, selectMapping, approveMutation, rejectMutation, bulkConfirm]);

  // Keep selected row in sync after refetch
  useEffect(() => {
    if (!selected || !mappings) return;
    const fresh = mappings.find((m) => m.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [mappings, selected]);

  if (!targetReady) {
    return (
      <Card>
        <EmptyState
          icon={GitCompare}
          title="Target model required"
          description="Select an active Pluto semantic model before running semantic mapping."
          action={
            <Link to={`/projects/${projectId}/target`}>
              <Button>Go to Target Model</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const pendingCount = stats?.pending ?? 0;
  const totalCount = stats?.total ?? 0;
  const mappingRunning = !!jobId || !!activeJob?.job_id;
  const bulkBusy = bulkApproveAllMutation.isPending || bulkRejectAllMutation.isPending;
  const showWorkbench = totalCount > 0 || mappingRunning || isLoading;
  const trulyEmpty = !showWorkbench && !isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-title">Mapping Workbench</h2>
          <p className="text-caption mt-1">
            Review source → target lineage, then approve or reject. Convert unlocks only when every approved row has a target.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {mapComplete && (
            <PhaseContinueHint
              to={`/projects/${projectId}/convert`}
              label="Continue to Convert"
              readyMessage="Mapping review complete."
            />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkConfirm('reject')}
            disabled={!pendingCount || bulkBusy || mappingRunning}
          >
            Reject all
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkConfirm('approve')}
            disabled={!pendingCount || bulkBusy || mappingRunning}
          >
            Approve all
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkApproveHighMutation.mutate()}
            disabled={bulkApproveHighMutation.isPending || mappingRunning || !pendingCount}
          >
            Approve HIGH
          </Button>
          <Button
            size="sm"
            onClick={() => mappingMutation.mutate()}
            disabled={mappingRunning || mappingMutation.isPending}
          >
            {mappingRunning ? 'Mapping…' : 'Run AI Mapping'}
          </Button>
        </div>
      </div>

      {mappingRunning && (
        <Card className="border-primary/30 bg-pink-50/40">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="font-medium text-gray-800">
                {mapProgress?.agent || 'Mapping Orchestrator'} running
              </p>
              <span className="text-caption shrink-0">
                {mapProgress?.total
                  ? `${mapProgress.current ?? 0} / ${mapProgress.total}`
                  : mappingJob?.status || activeJob?.status || 'PENDING'}
              </span>
            </div>
            <ProgressBar
              value={
                mapProgress?.total
                  ? Math.round(((mapProgress.current ?? 0) / mapProgress.total) * 100)
                  : mappingJob?.status === 'RUNNING' || activeJob?.status === 'RUNNING' ? 15 : 5
              }
              label="Live field mapping"
            />
            <p className="text-xs text-gray-600 leading-snug">
              {mapProgress?.step_label || 'Starting pipeline — watch BI Loom Assistant for agent thoughts'}
            </p>
            {totalCount > 0 && (
              <p className="text-[11px] text-success">
                {totalCount} mappings in workbench so far (updates live)
              </p>
            )}
          </div>
        </Card>
      )}

      {stats && (
        <div>
          <ProgressBar value={stats.coverage_pct ?? 0} label="Review progress" />
          <div className="flex gap-4 mt-1 text-caption">
            <span>{stats.total} total</span>
            <span>{stats.pending} pending</span>
            <span>{stats.high_confidence} high</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search…" className="w-48" />
        <Tabs
          tabs={[
            { id: 'all', label: 'All' },
            { id: 'PENDING_REVIEW', label: 'Pending' },
            { id: 'APPROVED', label: 'Approved' },
            { id: 'MODIFIED', label: 'Modified' },
            { id: 'REJECTED', label: 'Rejected' },
          ]}
          active={statusFilter}
          onChange={setStatusFilter}
        />
        {documentOptions.length > 0 && (
          <select
            className="text-sm border border-border rounded-lg px-2 py-1.5"
            value={documentFilter}
            onChange={(e) => setDocumentFilter(e.target.value)}
          >
            <option value="">All documents</option>
            {documentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={unmappedOnly} onChange={(e) => setUnmappedOnly(e.target.checked)} />
          Unmapped only
        </label>
      </div>

      {trulyEmpty ? (
        <Card>
          <EmptyState
            icon={GitCompare}
            title="No mappings yet"
            description="Use Run AI Mapping in the toolbar above to populate the workbench."
          />
        </Card>
      ) : (
        <>
          <div className="h-[520px]">
            <SplitPane
              defaultSizes={[22, 48, 30]}
              left={
                <SourceFieldTree
                  documents={documents}
                  folders={folders}
                  selectedFieldName={highlightField}
                  onSelectField={handleSourceField}
                />
              }
              center={
                <MappingGrid
                  mappings={filtered}
                  selectedId={selected?.id ?? null}
                  loading={isLoading}
                  onSelect={selectMapping}
                  onApprove={(id) => approveMutation.mutate(id)}
                  onReject={(id) => rejectMutation.mutate(id)}
                />
              }
              right={
                <TargetSchemaTree
                  model={plutoTree ?? null}
                  loading={treeLoading}
                  onSelectColumn={(table, col) => assignTarget(table, col, false)}
                  onSelectMeasure={(table, measure) => assignTarget(table, measure, true)}
                />
              }
            />
          </div>

          <MappingInspector
            mapping={selected}
            projectId={projectId!}
            editTarget={editTarget}
            onEditTargetChange={setEditTarget}
            onApprove={() => selected && approveMutation.mutate(selected.id)}
            onReject={() => selected && rejectMutation.mutate(selected.id)}
            onSave={() => selected && updateMutation.mutate({
              id: selected.id,
              data: { target_table: editTarget.table, target_column: editTarget.column },
            })}
            busy={approveMutation.isPending || rejectMutation.isPending || updateMutation.isPending}
          />
        </>
      )}

      <ConfirmDialog
        open={bulkConfirm === 'approve'}
        onClose={() => setBulkConfirm(null)}
        onConfirm={() => bulkApproveAllMutation.mutate()}
        title="Approve all with targets?"
        message={`Approve pending mappings that already have a target (${pendingCount} pending). Rows without a target are skipped — assign a column/measure or reject them.`}
        confirmLabel="Approve mapped"
        loading={bulkApproveAllMutation.isPending}
      />
      <ConfirmDialog
        open={bulkConfirm === 'reject'}
        onClose={() => setBulkConfirm(null)}
        onConfirm={() => bulkRejectAllMutation.mutate()}
        title="Reject all pending?"
        message={`Reject all ${pendingCount} pending mappings. Convert stays locked until enough rows are approved with targets.`}
        confirmLabel="Reject all"
        variant="danger"
        loading={bulkRejectAllMutation.isPending}
      />
    </div>
  );
}
