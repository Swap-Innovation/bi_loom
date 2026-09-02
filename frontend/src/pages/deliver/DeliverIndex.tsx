import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useWorkflow } from '../../hooks/useWorkflow';
import { api } from '../../services/api';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { DELIVER_SUB_STEPS } from '../../components/navigation/migrationFlow';
import { PhaseContinueHint } from '../../components/navigation/PhaseContinueHint';

type StepStatus = 'not_started' | 'running' | 'complete' | 'failed' | 'blocked';

function stepStatus(
  id: string,
  summary: { generated: boolean; validated: boolean },
  genStatus?: string | null,
  valStatus?: string | null,
  deliverBlocked?: boolean,
): StepStatus {
  if (deliverBlocked) return 'blocked';
  if (id === 'generate') {
    if (genStatus === 'RUNNING' || genStatus === 'PENDING') return 'running';
    if (genStatus === 'FAILED') return 'failed';
    if (summary.generated) return 'complete';
    return 'not_started';
  }
  if (id === 'validate') {
    if (!summary.generated) return 'blocked';
    if (valStatus === 'RUNNING' || valStatus === 'PENDING') return 'running';
    if (valStatus === 'FAILED') return 'failed';
    if (summary.validated) return 'complete';
    return 'not_started';
  }
  if (id === 'results') {
    if (!summary.generated) return 'blocked';
    if (!summary.validated) return 'not_started';
    return 'complete';
  }
  return 'not_started';
}

const STATUS_LABEL: Record<StepStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'error' }> = {
  not_started: { label: 'Not started', variant: 'default' },
  running: { label: 'In progress', variant: 'warning' },
  complete: { label: 'Complete', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
  blocked: { label: 'Locked', variant: 'default' },
};

export function DeliverIndexPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: workflow } = useWorkflow(projectId);
  const deliverBlocked = workflow?.phases.find((p) => p.id === 'deliver')?.status === 'blocked';

  const { data: genStatus } = useQuery({
    queryKey: ['generation-status', projectId],
    queryFn: () => api.getGenerationStatus(projectId!),
    enabled: !!projectId,
    refetchInterval: 10000,
  });

  const { data: validation } = useQuery({
    queryKey: ['validation', projectId],
    queryFn: () => api.getValidation(projectId!),
    enabled: !!projectId,
  });

  const summary = workflow?.summary ?? { generated: false, validated: false };
  const next = workflow?.next_action;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold">Deliver</h2>
        <p className="text-gray-500 text-sm mt-1">
          Status summary — open Generate PBI, Validate, or Results from the sidebar.
        </p>
        {deliverBlocked && (
          <p className="text-sm text-amber-800 mt-2">
            {workflow?.phases.find((p) => p.id === 'deliver')?.blockers?.[0]
              ?? 'Complete Convert before Deliver.'}
          </p>
        )}
      </div>

      <Card className="mb-6 !p-0 overflow-hidden">
        <ul className="divide-y divide-border">
          {DELIVER_SUB_STEPS.map(({ id, label, path, icon: Icon }) => {
            const status = stepStatus(id, summary, genStatus?.status, validation?.status, deliverBlocked);
            const badge = STATUS_LABEL[status];
            return (
              <li key={id} className="flex items-center gap-4 px-5 py-4">
                <Icon size={20} className="text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{label}</p>
                  <p className="text-xs text-gray-500">/deliver/{path}</p>
                </div>
                <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
              </li>
            );
          })}
        </ul>
      </Card>

      {next?.route.includes('/deliver') && (
        <PhaseContinueHint
          className="text-center"
          to={next.route}
          label={next.label}
          readyMessage="Next deliver step:"
        />
      )}
    </div>
  );
}
