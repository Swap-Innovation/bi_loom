import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useJob } from '../hooks/useJob';
import { useAiActivity, type ActivityStatus, type StepKind } from './AiActivityContext';

interface ActiveJob {
  id: string;
  label: string;
  projectId: string;
  pageKey?: string;
}

interface JobTrayContextValue {
  trackJob: (job: ActiveJob) => void;
  activeJobs: ActiveJob[];
}

const JobTrayContext = createContext<JobTrayContextValue | null>(null);

interface ProgressLogEntry {
  id?: string;
  agent?: string;
  kind?: string;
  label?: string;
  status?: string;
}

/** Fallback copy ONLY when a job has no live progress yet (first poll). */
const BOOTSTRAP: Record<string, { thought: string; action: string }> = {
  'AI Mapping': {
    thought: 'Waiting for Mapping Orchestrator to start…',
    action: 'Job queued — connecting to live agent progress stream',
  },
  'PBI Generation': {
    thought: 'Waiting for Generate Orchestrator…',
    action: 'Job queued — live generation phases will stream here',
  },
  'BO Parse': {
    thought: 'Waiting for BO Parse Orchestrator…',
    action: 'Job queued — live parse agents will stream here',
  },
};

function bootstrapFor(label: string) {
  for (const [key, value] of Object.entries(BOOTSTRAP)) {
    if (label.includes(key)) return value;
  }
  return {
    thought: `Waiting for “${label}” to start…`,
    action: 'Job queued',
  };
}

function toActivityStatus(raw?: string): ActivityStatus {
  if (raw === 'error') return 'error';
  if (raw === 'running') return 'running';
  if (raw === 'pending') return 'pending';
  return 'complete';
}

export function JobTrayProvider({ children }: { children: React.ReactNode }) {
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);

  const trackJob = useCallback((job: ActiveJob) => {
    setActiveJobs((prev) => {
      if (prev.some((j) => j.id === job.id)) return prev;
      return [...prev, job];
    });
  }, []);

  const removeJob = useCallback((id: string) => {
    setActiveJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  return (
    <JobTrayContext.Provider value={{ trackJob, activeJobs }}>
      {children}
      {activeJobs.map((j) => (
        <JobActivityBridge key={j.id} job={j} onDone={() => removeJob(j.id)} />
      ))}
    </JobTrayContext.Provider>
  );
}

function JobActivityBridge({ job, onDone }: { job: ActiveJob; onDone: () => void }) {
  const { startAgent, addThought, addAction, updateEvent, completeAgent, failAgent } = useAiActivity();
  const runIdRef = useRef<string | null>(null);
  /** Stable keys already mirrored — status may still upgrade (running → complete). */
  const seenLogKeys = useRef<Set<string>>(new Set());
  const lastStatusByKey = useRef<Map<string, string>>(new Map());
  const bootstrapped = useRef(false);
  const boot = useRef(bootstrapFor(job.label));
  const finalizedRef = useRef(false);

  const { job: status } = useJob(job.id, { pollInterval: 800 });

  useEffect(() => {
    if (runIdRef.current) return;
    const runId = startAgent(job.label, 'Live agent execution', job.pageKey);
    runIdRef.current = runId;
    if (!bootstrapped.current) {
      bootstrapped.current = true;
      addThought(runId, boot.current.thought, 'running');
      addAction(runId, boot.current.action, 'running');
    }
  }, [job.label, job.pageKey, startAgent, addThought, addAction]);

  // Mirror job.progress.log, then finalize agent only AFTER the final log is applied.
  // (Calling completeAgent in useJob.onComplete raced ahead of this effect and left steps "running".)
  useEffect(() => {
    const runId = runIdRef.current;
    if (!runId || !status) return;

    const progress = status.progress as Record<string, unknown> | undefined;
    if (progress) {
      const log = (progress.log as ProgressLogEntry[] | undefined) ?? [];
      const current = Number(progress.current ?? 0);
      const total = Number(progress.total ?? 0);
      const agent = String(progress.agent ?? job.label);
      const stepLabel = String(progress.step_label ?? '');

      if (log.length > 0) {
        // Live progress arrived — clear bootstrap placeholders
        addThought(runId, boot.current.thought, 'complete');
        addAction(runId, boot.current.action, 'complete');
      }

      if (status.status === 'RUNNING') {
        updateEvent(runId, {
          action: total > 0
            ? `${agent} · ${current}/${total}`
            : `${agent} running`,
          detail: stepLabel || undefined,
          status: 'running',
        });
      }

      for (const entry of log) {
        const stableKey = entry.id || `${entry.agent ?? ''}:${entry.kind ?? 'action'}:${entry.label ?? ''}`;
        if (!stableKey) continue;

        const statusVal = toActivityStatus(entry.status);
        const prevStatus = lastStatusByKey.current.get(stableKey);
        if (seenLogKeys.current.has(stableKey) && prevStatus === entry.status) {
          continue;
        }
        seenLogKeys.current.add(stableKey);
        lastStatusByKey.current.set(stableKey, entry.status ?? 'complete');

        const kind: StepKind = entry.kind === 'thought' ? 'thought' : 'action';
        const label = entry.agent && entry.label
          ? `[${entry.agent}] ${entry.label}`
          : (entry.label || 'Step');

        if (kind === 'thought') addThought(runId, label, statusVal);
        else addAction(runId, label, statusVal);
      }
    }

    if (finalizedRef.current) return;

    if (status.status === 'COMPLETED') {
      finalizedRef.current = true;
      const detail = status.result
        ? Object.entries(status.result).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(' · ')
        : 'Job completed';
      completeAgent(runId, detail);
      setTimeout(onDone, 1500);
    } else if (status.status === 'FAILED') {
      finalizedRef.current = true;
      failAgent(runId, status.error_message ?? 'Job failed');
      setTimeout(onDone, 2500);
    }
  }, [
    status,
    job.label,
    updateEvent,
    addThought,
    addAction,
    completeAgent,
    failAgent,
    onDone,
  ]);

  return null;
}

export function useJobTray() {
  const ctx = useContext(JobTrayContext);
  if (!ctx) throw new Error('useJobTray must be used within JobTrayProvider');
  return ctx;
}
