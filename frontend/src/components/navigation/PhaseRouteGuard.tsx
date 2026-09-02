import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useWorkflow, isPhaseAccessible, getPhaseById } from '../../hooks/useWorkflow';
import { useIngestFlow } from '../../hooks/useIngestFlow';
import { api } from '../../services/api';
import { CONVERT_SUB_STEPS, DELIVER_SUB_STEPS } from './migrationFlow';

interface PhaseRouteGuardProps {
  phaseId: 'ingest' | 'target' | 'map' | 'convert' | 'deliver';
  children: React.ReactNode;
  /** Ingest route segment: artifacts | parsing | mspec */
  ingestStep?: 'upload' | 'parsing' | 'mspec';
  /** Deliver route segment */
  deliverStep?: 'generate' | 'validate' | 'results';
}

function fallbackRoute(projectId: string, workflow: import('../../types').WorkflowState | undefined): string {
  if (workflow?.next_action?.route) return workflow.next_action.route;
  const open = workflow?.phases.find((p) => p.status !== 'blocked' && p.status !== 'complete');
  if (open) return open.route;
  return `/projects/${projectId}/overview`;
}

export function PhaseRouteGuard({ phaseId, children, ingestStep, deliverStep }: PhaseRouteGuardProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const { data: workflow, isLoading } = useWorkflow(projectId);
  const { data: ingestFlow, isLoading: ingestFlowLoading, isError: ingestFlowError } = useIngestFlow(
    phaseId === 'ingest' ? projectId : undefined,
  );

  const { data: workspace } = useQuery({
    queryKey: ['conversion', projectId],
    queryFn: () => api.getConversionWorkspace(projectId!),
    enabled: !!projectId && phaseId === 'convert',
    staleTime: 5000,
  });

  const { data: genStatus } = useQuery({
    queryKey: ['generation-status', projectId],
    queryFn: () => api.getGenerationStatus(projectId!),
    enabled: !!projectId && phaseId === 'deliver',
    staleTime: 5000,
  });

  if (!projectId) return null;
  if (isLoading || !workflow) {
    return <p className="text-gray-500 text-sm p-2">Checking phase access…</p>;
  }

  if (!isPhaseAccessible(workflow, phaseId)) {
    return <Navigate to={fallbackRoute(projectId, workflow)} replace />;
  }

  // Wait for ingest flow before gating sub-steps (avoids flash / wrong redirect)
  if (phaseId === 'ingest' && ingestStep && ingestFlowLoading) {
    return <p className="text-gray-500 text-sm p-2">Loading ingest steps…</p>;
  }
  if (phaseId === 'ingest' && ingestStep && ingestFlowError) {
    return <p className="text-error text-sm p-2">Could not load ingest steps. Refresh and try again.</p>;
  }

  // Ingest sub-step: redirect locked steps to the first actionable incomplete step
  if (phaseId === 'ingest' && ingestStep && ingestFlow?.steps?.length) {
    const step = ingestFlow.steps.find((s) => s.id === ingestStep);
    if (step && !step.can_run && step.status !== 'complete') {
      const actionable = ingestFlow.steps.find(
        (s) => s.can_run && s.status !== 'complete',
      ) ?? ingestFlow.steps.find((s) => s.status !== 'complete')
        ?? ingestFlow.steps[0];
      const route = actionable.id === 'upload' ? 'artifacts' : actionable.id;
      if (route !== (ingestStep === 'upload' ? 'artifacts' : ingestStep)) {
        return <Navigate to={`/projects/${projectId}/ingest/${route}`} replace />;
      }
    }
  }

  // Convert sub-step: clamp ?step= to first incomplete when jumping ahead
  if (phaseId === 'convert' && workspace) {
    const stepParam = searchParams.get('step');
    const steps = workspace.conversion_steps ?? [];
    let firstIncomplete: string = CONVERT_SUB_STEPS[0].id;
    for (const meta of CONVERT_SUB_STEPS) {
      const s = steps.find((x) => x.id === meta.id);
      if (!s || s.status !== 'complete') {
        firstIncomplete = meta.id;
        break;
      }
    }
    if (stepParam) {
      const idx = CONVERT_SUB_STEPS.findIndex((s) => s.id === stepParam);
      const firstIdx = CONVERT_SUB_STEPS.findIndex((s) => s.id === firstIncomplete);
      if (idx > firstIdx) {
        return <Navigate to={`/projects/${projectId}/convert?step=${firstIncomplete}`} replace />;
      }
      if (idx < 0) {
        return <Navigate to={`/projects/${projectId}/convert?step=${firstIncomplete}`} replace />;
      }
    }
  }

  // Deliver sub-step sequential gates
  if (phaseId === 'deliver' && deliverStep) {
    const generated = workflow.summary?.generated || genStatus?.status === 'COMPLETED';
    const validated = workflow.summary?.validated;
    if (deliverStep === 'validate' && !generated) {
      return <Navigate to={`/projects/${projectId}/deliver/generate`} replace />;
    }
    if (deliverStep === 'results' && !generated) {
      return <Navigate to={`/projects/${projectId}/deliver/${DELIVER_SUB_STEPS[0].path}`} replace />;
    }
    if (deliverStep === 'results' && !validated) {
      return <Navigate to={`/projects/${projectId}/deliver/validate`} replace />;
    }
  }

  // Soft check: phase exists
  if (!getPhaseById(workflow, phaseId)) {
    return <Navigate to={`/projects/${projectId}/overview`} replace />;
  }

  return <>{children}</>;
}
