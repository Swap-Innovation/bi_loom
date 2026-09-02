import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, XCircle } from 'lucide-react';
import { api } from '../../services/api';
import { useWorkflow } from '../../hooks/useWorkflow';

interface PreflightChecklistProps {
  projectId: string;
}

type CheckStatus = 'pass' | 'fail' | 'pending';

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === 'pass') return <CheckCircle2 size={16} className="text-success shrink-0" />;
  if (status === 'fail') return <XCircle size={16} className="text-error shrink-0" />;
  return <Circle size={16} className="text-gray-300 shrink-0" />;
}

export function PreflightChecklist({ projectId }: PreflightChecklistProps) {
  const { data: workflow } = useWorkflow(projectId);
  const { data: workspace } = useQuery({
    queryKey: ['conversion', projectId],
    queryFn: () => api.getConversionWorkspace(projectId),
    enabled: !!projectId,
  });

  const mappingTotal = workflow?.summary.mappings_total ?? 0;
  const mappingReviewed = workflow?.summary.mappings_reviewed ?? 0;
  const mappingPct = mappingTotal > 0 ? Math.round((mappingReviewed / mappingTotal) * 100) : 0;

  const checks: { label: string; detail: string; status: CheckStatus }[] = [
    {
      label: 'MSpec generated',
      detail: workflow?.summary.has_mspec ? 'BO artifacts parsed' : 'Parse artifacts first',
      status: workflow?.summary.has_mspec ? 'pass' : 'fail',
    },
    {
      label: 'Target model selected',
      detail: workspace?.selected_target_model?.name ?? 'Import or select a Pluto model',
      status: workflow?.summary.has_target_model ? 'pass' : 'fail',
    },
    {
      label: 'Mappings reviewed',
      detail: `${mappingReviewed}/${mappingTotal} approved (${mappingPct}%)`,
      status: mappingPct >= 80 ? 'pass' : mappingTotal > 0 ? 'pending' : 'fail',
    },
    {
      label: 'Conversion complete',
      detail: workflow?.summary.convert_complete
        ? 'All Convert steps finished'
        : workspace?.overall_progress
          ? `${workspace.overall_progress}% — finish Filters to unlock Deliver`
          : 'Run conversion in Conversion Studio',
      status: workflow?.summary.convert_complete ? 'pass' : (workspace?.overall_progress ?? 0) > 0 ? 'pending' : 'fail',
    },
  ];

  const allPass = checks.every((c) => c.status === 'pass');

  return (
    <div>
      <ul className="space-y-3">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-3 text-sm">
            <StatusIcon status={c.status} />
            <div>
              <p className="font-medium">{c.label}</p>
              <p className="text-xs text-gray-500">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      {!allPass && (
        <p className="text-xs text-warning mt-4">
          Complete all checklist items before generating, or proceed with caution.
        </p>
      )}
    </div>
  );
}

export function usePreflightReady(projectId: string) {
  const { data: workflow } = useWorkflow(projectId);
  const mappingTotal = workflow?.summary.mappings_total ?? 0;
  const mappingReviewed = workflow?.summary.mappings_reviewed ?? 0;
  const mappingPct = mappingTotal > 0 ? (mappingReviewed / mappingTotal) * 100 : 0;
  const convertComplete = Boolean(workflow?.summary.convert_complete);
  const deliverBlocked = workflow?.phases.find((p) => p.id === 'deliver')?.status === 'blocked';
  return Boolean(
    workflow?.summary.has_mspec &&
    workflow?.summary.has_target_model &&
    mappingPct >= 80 &&
    convertComplete &&
    !deliverBlocked,
  );
}
