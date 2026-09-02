import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../services/api';
import type { Job } from '../types';

interface UseJobOptions {
  onComplete?: (job: Job) => void;
  onFailed?: (job: Job) => void;
  pollInterval?: number;
}

export function useJob(jobId: string | null, options: UseJobOptions = {}) {
  const { pollInterval = 2000 } = options;
  const [job, setJob] = useState<Job | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const onCompleteRef = useRef(options.onComplete);
  const onFailedRef = useRef(options.onFailed);
  const terminalRef = useRef(false);

  onCompleteRef.current = options.onComplete;
  onFailedRef.current = options.onFailed;

  const poll = useCallback(async () => {
    if (!jobId || terminalRef.current) return;
    const result = await api.getJob(jobId);
    setJob(result);
    if (result.status === 'COMPLETED') {
      terminalRef.current = true;
      setIsPolling(false);
      onCompleteRef.current?.(result);
    } else if (result.status === 'FAILED') {
      terminalRef.current = true;
      setIsPolling(false);
      onFailedRef.current?.(result);
    }
  }, [jobId]);

  useEffect(() => {
    terminalRef.current = false;
    if (!jobId) {
      setJob(null);
      setIsPolling(false);
      return;
    }
    setIsPolling(true);
    poll();
    const interval = setInterval(() => {
      if (terminalRef.current) {
        clearInterval(interval);
        return;
      }
      void poll();
    }, pollInterval);
    return () => clearInterval(interval);
  }, [jobId, poll, pollInterval]);

  return { job, isPolling, isRunning: Boolean(jobId) && (!job || job.status === 'PENDING' || job.status === 'RUNNING') };
}
