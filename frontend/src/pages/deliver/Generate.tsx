import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useJob } from '../../hooks/useJob';
import { useJobTray } from '../../context/JobTrayContext';
import { useWorkflow } from '../../hooks/useWorkflow';
import { PreflightChecklist, usePreflightReady } from '../../components/deliver/PreflightChecklist';
import { ArtifactPreviewTree } from '../../components/deliver/ArtifactPreviewTree';
import { PhaseContinueHint } from '../../components/navigation/PhaseContinueHint';

export function GeneratePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const { trackJob } = useJobTray();
  const { data: workflow } = useWorkflow(projectId);
  const [jobId, setJobId] = useState<string | null>(null);
  const [overridePreflight, setOverridePreflight] = useState(false);
  const preflightReady = usePreflightReady(projectId!);

  const deliverBlocked = workflow?.phases.find((p) => p.id === 'deliver')?.status === 'blocked';

  const { data: activeJob } = useQuery({
    queryKey: ['generation-active-job', projectId],
    queryFn: () => api.getActiveGenerationJob(projectId!),
    enabled: !!projectId && !deliverBlocked,
    refetchInterval: (q) => (q.state.data?.job_id ? 2000 : 8000),
  });

  useEffect(() => {
    if (!activeJob?.job_id) return;
    setJobId((prev) => {
      if (prev === activeJob.job_id) return prev;
      trackJob({
        id: activeJob.job_id,
        label: 'PBI Generation',
        projectId: projectId!,
        pageKey: 'deliver/generate',
      });
      return activeJob.job_id;
    });
  }, [activeJob?.job_id, projectId, trackJob]);

  const { data: workspace } = useQuery({
    queryKey: ['conversion', projectId],
    queryFn: () => api.getConversionWorkspace(projectId!),
    enabled: !!projectId,
  });

  const { data: genStatus, refetch: refetchGenStatus } = useQuery({
    queryKey: ['generation-status', projectId],
    queryFn: () => api.getGenerationStatus(projectId!),
    enabled: !!projectId,
    refetchInterval: jobId || activeJob?.job_id ? 2000 : false,
  });

  useEffect(() => {
    if (genStatus?.job_id && !jobId) {
      setJobId(genStatus.job_id);
      trackJob({
        id: genStatus.job_id,
        label: 'PBI Generation',
        projectId: projectId!,
        pageKey: 'deliver/generate',
      });
    }
  }, [genStatus?.job_id, jobId, projectId, trackJob]);

  const { job, isRunning } = useJob(jobId, {
    onComplete: () => {
      toast.success('PBI package generated');
      setJobId(null);
      refetchGenStatus();
      queryClient.invalidateQueries({ queryKey: ['workflow', projectId] });
      queryClient.invalidateQueries({ queryKey: ['generation-active-job', projectId] });
      queryClient.invalidateQueries({ queryKey: ['generation-status', projectId] });
    },
    onFailed: (failed) => {
      toast.error(failed.error_message || 'Generation failed');
      setJobId(null);
      refetchGenStatus();
      queryClient.invalidateQueries({ queryKey: ['generation-active-job', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workflow', projectId] });
    },
    pollInterval: 800,
  });

  const generateMutation = useMutation({
    mutationFn: () => api.startGeneration(projectId!),
    onSuccess: (data) => {
      setJobId(data.job_id);
      trackJob({ id: data.job_id, label: 'PBI Generation', projectId: projectId!, pageKey: 'deliver/generate' });
      queryClient.invalidateQueries({ queryKey: ['generation-active-job', projectId] });
      toast.info('Generation started');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to start generation'),
  });

  const generating = isRunning || !!activeJob?.job_id || generateMutation.isPending;
  const canGenerate = (preflightReady || overridePreflight) && !deliverBlocked;
  const genComplete = genStatus?.status === 'COMPLETED' && !generating;
  const targetTree = workspace?.target_tree;
  const previewTree = genStatus?.artifact_tree ?? {
    semantic_model: targetTree?.semantic_model,
    reports: targetTree?.reports,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-title">Generate Power BI Package</h2>
          <p className="text-caption mt-1">Produce .pbip project and migration artifacts from approved mappings</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {genComplete && (
            <PhaseContinueHint
              to={`/projects/${projectId}/deliver/validate`}
              label="Continue to Validate"
              readyMessage="Package ready."
            />
          )}
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generating || !canGenerate}
          >
            {generating ? 'Generating...' : genComplete ? 'Re-generate PBI' : 'Generate PBI'}
          </Button>
        </div>
      </div>

      {deliverBlocked && (
        <Card className="mb-6 border-amber-200 bg-amber-50/60">
          <p className="text-sm text-amber-900">
            {workflow?.phases.find((p) => p.id === 'deliver')?.blockers?.[0]
              ?? 'Complete Convert before generating a package.'}
          </p>
        </Card>
      )}

      {generating && (
        <Card className="mb-6 border-primary/30 bg-pink-50/40">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Loader2 className="animate-spin text-primary shrink-0" size={20} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">
                  {(job?.progress as { agent?: string } | null)?.agent || 'Generate Orchestrator'} running
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {(job?.progress as { step_label?: string } | null)?.step_label
                    || `Status: ${job?.status || activeJob?.status || 'RUNNING'} — watch Migration Assistant for agent steps`}
                </p>
              </div>
              <span className="text-caption shrink-0">
                {(job?.progress as { current?: number; total?: number } | null)?.total
                  ? `${(job?.progress as { current?: number }).current ?? 0}/${(job?.progress as { total?: number }).total}`
                  : job?.status || activeJob?.status}
              </span>
            </div>
          </div>
        </Card>
      )}

      {genComplete && (
        <Card className="mb-6 border-success/30 bg-green-50/50">
          <p className="text-sm text-success font-medium">Last generation completed successfully</p>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Pre-flight checklist">
          <PreflightChecklist projectId={projectId!} />
          {!preflightReady && !deliverBlocked && (
            <label className="flex items-center gap-2 mt-4 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={overridePreflight}
                onChange={(e) => setOverridePreflight(e.target.checked)}
              />
              Override pre-flight and generate anyway
            </label>
          )}
        </Card>

        <Card title="Output preview">
          <ArtifactPreviewTree
            semanticModel={previewTree?.semantic_model as { name?: string; tables?: { name: string; columns?: { name: string }[] }[] } | undefined}
            reports={previewTree?.reports}
            files={genStatus?.files ?? [
              { name: 'migration-package.zip', type: 'zip' },
              { name: 'unsupported-items.json', type: 'json' },
              { name: 'migration-report.md', type: 'markdown' },
              { name: 'README.md', type: 'markdown' },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
