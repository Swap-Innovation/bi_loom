import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export function useWorkflow(projectId: string | undefined) {
  return useQuery({
    queryKey: ['workflow', projectId],
    queryFn: () => api.getWorkflow(projectId!),
    enabled: !!projectId,
    staleTime: 3000,
  });
}

export function getPhaseById(workflow: import('../types').WorkflowState | undefined, phaseId: string) {
  return workflow?.phases.find((p) => p.id === phaseId);
}

export function isPhaseAccessible(workflow: import('../types').WorkflowState | undefined, phaseId: string) {
  const phase = getPhaseById(workflow, phaseId);
  return phase ? phase.status !== 'blocked' : false;
}
