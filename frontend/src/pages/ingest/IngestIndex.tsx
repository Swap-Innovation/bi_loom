import { Link, Navigate, useParams } from 'react-router-dom';
import { CheckCircle2, Circle, Loader2, Lock, ArrowRight } from 'lucide-react';
import { useIngestFlow } from '../../hooks/useIngestFlow';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { cn } from '../../utils/cn';

/** Prefer first incomplete runnable step; fall back to first incomplete. */
function nextIngestRoute(steps: { id: string; status: string; can_run: boolean; route: string }[]) {
  const actionable = steps.find((s) => s.can_run && s.status !== 'complete');
  if (actionable) return actionable.route;
  const incomplete = steps.find((s) => s.status !== 'complete');
  if (incomplete) return incomplete.route;
  return steps[steps.length - 1]?.route;
}

export function IngestIndexPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: flow, isLoading } = useIngestFlow(projectId);

  if (isLoading) {
    return <p className="text-gray-500">Loading ingest flow...</p>;
  }

  const steps = flow?.steps ?? [];
  const nextRoute = nextIngestRoute(steps);
  const allComplete = steps.length > 0 && steps.every((s) => s.status === 'complete');

  // Soft-merge hub: jump straight into the next actionable sub-step
  if (nextRoute && !allComplete) {
    return <Navigate to={nextRoute} replace />;
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Ingest</h2>
          <p className="text-gray-500 text-sm mt-1">
            Upload → Parsing → MSpec. All ingest steps are complete.
          </p>
        </div>
        {nextRoute && (
          <Link to={nextRoute}>
            <Button size="sm">
              Open MSpec <ArrowRight size={14} />
            </Button>
          </Link>
        )}
      </div>

      <Card className="mb-6 !p-0 overflow-hidden">
        <div className="divide-y divide-border">
          {steps.map((step, idx) => {
            const Icon = step.status === 'complete' ? CheckCircle2
              : step.status === 'in_progress' ? Loader2
              : step.status === 'blocked' ? Lock
              : Circle;
            const isLast = idx === steps.length - 1;

            return (
              <Link
                key={step.id}
                to={step.route}
                className="flex items-stretch hover:bg-surface/50 transition-colors"
              >
                <div className="flex flex-col items-center px-4 py-5 w-14 shrink-0">
                  <Icon
                    size={20}
                    className={cn(
                      step.status === 'complete' && 'text-success',
                      step.status === 'in_progress' && 'text-primary animate-spin',
                      step.status === 'blocked' && 'text-gray-300',
                      step.status === 'pending' && 'text-gray-300',
                    )}
                  />
                  {!isLast && <div className="w-px flex-1 bg-border mt-2" />}
                </div>
                <div className="flex-1 py-5 pr-5">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Step {step.step}</p>
                  <h3 className="font-semibold">{step.label}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{step.description}</p>
                  {step.blocker && step.status === 'blocked' && (
                    <p className="text-xs text-warning mt-1">{step.blocker}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2 capitalize">{step.status.replace('_', ' ')}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
