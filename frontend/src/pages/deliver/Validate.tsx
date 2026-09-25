import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/Badge';
import { ScoreBreakdown } from '../../components/deliver/ScoreBreakdown';
import { PhaseContinueHint } from '../../components/navigation/PhaseContinueHint';
import { useJob } from '../../hooks/useJob';
import { useJobTray } from '../../context/JobTrayContext';
import { EmptyState } from '../../components/ui/EmptyState';
import { Link } from 'react-router-dom';

interface ValidationSection {
  passed?: boolean;
  issues?: number;
  unsupported?: number;
  unmapped?: number;
  [key: string]: unknown;
}

export function ValidatePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const { trackJob } = useJobTray();
  const [jobId, setJobId] = useState<string | null>(null);

  const { data: genStatus } = useQuery({
    queryKey: ['generation-status', projectId],
    queryFn: () => api.getGenerationStatus(projectId!),
    enabled: !!projectId,
  });

  const { data: activeJob } = useQuery({
    queryKey: ['validation-active-job', projectId],
    queryFn: () => api.getActiveValidationJob(projectId!),
    enabled: !!projectId && genStatus?.status === 'COMPLETED',
    refetchInterval: (q) => (q.state.data?.job_id ? 2000 : 8000),
  });

  useEffect(() => {
    if (!activeJob?.job_id) return;
    setJobId((prev) => {
      if (prev === activeJob.job_id) return prev;
      trackJob({
        id: activeJob.job_id,
        label: 'Validation',
        projectId: projectId!,
        pageKey: 'deliver/validate',
      });
      return activeJob.job_id;
    });
  }, [activeJob?.job_id, projectId, trackJob]);

  const { data: validation, refetch } = useQuery({
    queryKey: ['validation', projectId],
    queryFn: () => api.getValidation(projectId!),
    enabled: !!projectId,
    refetchInterval: jobId || activeJob?.job_id ? 2000 : false,
  });

  useEffect(() => {
    if (validation?.job_id && !jobId) {
      setJobId(validation.job_id);
      trackJob({
        id: validation.job_id,
        label: 'Validation',
        projectId: projectId!,
        pageKey: 'deliver/validate',
      });
    }
  }, [validation?.job_id, jobId, projectId, trackJob]);

  const { job, isRunning } = useJob(jobId, {
    onComplete: () => {
      toast.success('Validation complete');
      setJobId(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['workflow', projectId] });
      queryClient.invalidateQueries({ queryKey: ['validation-active-job', projectId] });
      queryClient.invalidateQueries({ queryKey: ['results', projectId] });
    },
    onFailed: (failed) => {
      toast.error(failed.error_message || 'Validation failed');
      setJobId(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['validation-active-job', projectId] });
    },
    pollInterval: 800,
  });

  const validateMutation = useMutation({
    mutationFn: () => api.startValidation(projectId!),
    onSuccess: (data) => {
      setJobId(data.job_id);
      trackJob({ id: data.job_id, label: 'Validation', projectId: projectId!, pageKey: 'deliver/validate' });
      queryClient.invalidateQueries({ queryKey: ['validation-active-job', projectId] });
      toast.info('Validation started');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to start validation'),
  });

  const validating = isRunning || !!activeJob?.job_id || validateMutation.isPending;
  const generated = genStatus?.status === 'COMPLETED';
  const results = validation?.results as Record<string, ValidationSection> | null;
  const score = validation?.migration_score;
  const breakdown = results?.migration_score_breakdown as Record<string, number> | undefined;
  const validated = validation?.status === 'COMPLETED' && !validating;

  const sections = [
    { key: 'structural', label: 'Structural Validation', icon: CheckCircle },
    { key: 'mapping', label: 'Mapping Validation', icon: CheckCircle },
    { key: 'visual', label: 'Visual Validation', icon: AlertTriangle },
  ];

  if (!generated) {
    return (
      <Card>
        <EmptyState
          icon={AlertTriangle}
          title="Generate a package first"
          description="Validation scores the generated Power BI package. Run Generate PBI, then come back here."
          action={
            <Link to={`/projects/${projectId}/deliver/generate`}>
              <Button>Go to Generate</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold">Migration Validation</h2>
          <p className="text-gray-500 text-sm mt-1">Assess migration quality after generation</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {validated && (
            <PhaseContinueHint
              to={`/projects/${projectId}/deliver/results`}
              label="Continue to Results"
              readyMessage="Validation complete."
            />
          )}
          <Button
            onClick={() => validateMutation.mutate()}
            disabled={validating}
          >
            {validating ? 'Validating...' : validated ? 'Re-run Validation' : 'Run Validation'}
          </Button>
        </div>
      </div>

      {validating && (
        <Card className="mb-6 border-primary/30 bg-blue-50/40">
          <div className="flex items-center gap-3">
            <Loader2 className="animate-spin text-primary shrink-0" size={20} />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">
                {(job?.progress as { agent?: string } | null)?.agent || 'Validation Orchestrator'} running
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {(job?.progress as { step_label?: string } | null)?.step_label
                  || `Status: ${job?.status || activeJob?.status || 'RUNNING'}`}
              </p>
            </div>
          </div>
        </Card>
      )}

      {score !== null && score !== undefined && (
        <Card className="mb-6">
          <ScoreBreakdown
            score={score}
            breakdown={breakdown}
            projectId={projectId!}
            issues={{
              unmapped: results?.mapping?.unmapped as number | undefined,
              unsupported: results?.visual?.unsupported as number | undefined,
              manual_actions: results?.manual_actions as number | undefined,
            }}
          />
        </Card>
      )}

      {results ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map(({ key, label, icon: Icon }) => {
            const section = results[key] ?? {};
            const hasIssues = Boolean(section.issues || section.unsupported || section.unmapped);
            const status = section.passed === false ? 'failed' : hasIssues ? 'warning' : 'complete';
            return (
              <Card key={key} title={label}>
                <div className="flex items-center gap-2 mb-3">
                  {hasIssues ? (
                    <AlertTriangle size={18} className="text-warning" />
                  ) : (
                    <Icon size={18} className="text-success" />
                  )}
                  <StatusBadge status={status} />
                </div>
                <dl className="space-y-2 text-sm">
                  {Object.entries(section).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <dt className="text-gray-500 capitalize">{k.replace(/_/g, ' ')}</dt>
                      <dd className="font-mono">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            );
          })}

          {results.manual_actions !== undefined && (
            <Card title="Manual Actions Required">
              <div className="flex items-center gap-2">
                <XCircle size={18} className="text-warning" />
                <span className="font-semibold">{String(results.manual_actions)} manual actions</span>
              </div>
            </Card>
          )}
        </div>
      ) : !validating ? (
        <Card>
          <p className="text-gray-500 text-center py-8">
            Package is ready. Run validation to score mapping coverage, structure, and visuals.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
