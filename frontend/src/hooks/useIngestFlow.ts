import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export function useIngestFlow(projectId: string | undefined) {
  return useQuery({
    queryKey: ['ingest-flow', projectId],
    queryFn: () => api.getIngestFlow(projectId!),
    enabled: !!projectId,
    refetchInterval: 8000,
  });
}
