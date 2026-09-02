import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useWorkflow } from './useWorkflow';

export function useProject(projectId: string | undefined) {
  const queryClient = useQueryClient();

  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: !!projectId,
  });

  const workflowQuery = useWorkflow(projectId);

  const invalidate = () => {
    if (!projectId) return;
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    queryClient.invalidateQueries({ queryKey: ['workflow', projectId] });
  };

  return {
    project: projectQuery.data,
    workflow: workflowQuery.data,
    isLoading: projectQuery.isLoading || workflowQuery.isLoading,
    invalidate,
  };
}
