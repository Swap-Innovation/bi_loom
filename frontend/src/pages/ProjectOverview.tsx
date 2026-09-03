import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Loader2, Lock, ArrowRight } from 'lucide-react';
import { api } from '../services/api';
import { useWorkflow } from '../hooks/useWorkflow';
import { useJourneyContinue } from '../hooks/useJourneyContinue';
import { Card, StatCard } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

const STATUS_ICONS = {
  complete: CheckCircle2,
  in_progress: Loader2,
  pending: Circle,
  blocked: Lock,
};

export function ProjectOverview() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: !!projectId,
  });

  const { data: mappings } = useQuery({
    queryKey: ['mappings', projectId],
    queryFn: () => api.listMappings(projectId!),
    enabled: !!projectId,
  });

  const { data: workflow } = useWorkflow(projectId);
  const continueAction = useJourneyContinue(projectId);

  if (!project) return <div className="text-ink-faint">Loading...</div>;

  const highConf = mappings?.filter((m) => m.confidence_level === 'HIGH').length ?? 0;
  const pending = mappings?.filter((m) => m.status === 'PENDING_REVIEW').length ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-title">{project.name}</h2>
        <p className="text-body mt-1">{project.description}</p>
        <div className="mt-2"><StatusBadge status={project.status} /></div>
      </div>

      {continueAction && (
        <Card className="mb-6 border-primary/20 bg-primary-soft/40 !p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-eyebrow">Next step</p>
              <p className="font-semibold text-ink mt-1">{continueAction.label}</p>
              {!continueAction.enabled && continueAction.disabledReason && (
                <p className="text-caption mt-1">{continueAction.disabledReason}</p>
              )}
            </div>
            {continueAction.enabled ? (
              <Link to={continueAction.route}>
                <Button size="sm">
                  Continue <ArrowRight size={14} />
                </Button>
              </Link>
            ) : (
              <Button size="sm" disabled title={continueAction.disabledReason}>
                Continue <ArrowRight size={14} />
              </Button>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Mappings" value={mappings?.length ?? 0} />
        <StatCard label="High Confidence" value={highConf} />
        <StatCard label="Pending Review" value={pending} />
        <StatCard label="Artifacts" value={workflow?.summary.artifacts ?? 0} />
      </div>

      <Card title="Migration Phases">
        <div className="space-y-3">
          {workflow?.phases.map((phase) => {
            const Icon = STATUS_ICONS[phase.status] ?? Circle;
            return (
              <div key={phase.id} className="flex items-center gap-3">
                <Icon
                  size={18}
                  className={
                    phase.status === 'complete' ? 'text-success' :
                    phase.status === 'in_progress' ? 'text-primary animate-spin' :
                    phase.status === 'blocked' ? 'text-gray-300' : 'text-gray-400'
                  }
                />
                <div className="flex-1">
                  <p className={`font-medium text-sm ${phase.status === 'blocked' ? 'text-gray-400' : ''}`}>
                    {phase.label}
                  </p>
                  {phase.blockers.length > 0 && (
                    <p className="text-xs text-gray-400">{phase.blockers[0]}</p>
                  )}
                </div>
                {phase.status !== 'blocked' && (
                  <Link to={phase.route} className="text-xs text-primary hover:underline">Open</Link>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
