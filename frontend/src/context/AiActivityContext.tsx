import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

export type ActivityStatus = 'running' | 'complete' | 'error' | 'pending';
export type StepKind = 'thought' | 'action';

export interface AiActivityStep {
  id: string;
  label: string;
  status: ActivityStatus;
  kind: StepKind;
}

export interface AiActivityEvent {
  id: string;
  agent: string;
  action: string;
  detail?: string;
  status: ActivityStatus;
  timestamp: number;
  pageKey?: string;
  steps?: AiActivityStep[];
}

interface AiActivityContextValue {
  events: AiActivityEvent[];
  log: (agent: string, action: string, detail?: string, status?: ActivityStatus, pageKey?: string) => string;
  startAgent: (agent: string, action: string, pageKey?: string) => string;
  addStep: (eventId: string, label: string, status?: ActivityStatus, kind?: StepKind) => void;
  addThought: (eventId: string, label: string, status?: ActivityStatus) => void;
  addAction: (eventId: string, label: string, status?: ActivityStatus) => void;
  updateEvent: (eventId: string, patch: Partial<Pick<AiActivityEvent, 'action' | 'detail' | 'status'>>) => void;
  completeAgent: (eventId: string, detail?: string) => void;
  failAgent: (eventId: string, detail?: string) => void;
  clearPage: (pageKey: string) => void;
  clearAll: () => void;
}

const AiActivityContext = createContext<AiActivityContextValue | null>(null);

const MAX_EVENTS = 80;

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function upsertStep(
  steps: AiActivityStep[],
  label: string,
  status: ActivityStatus,
  kind: StepKind,
): AiActivityStep[] {
  const next = [...steps];
  const existing = next.findIndex((s) => s.label === label && s.kind === kind);
  if (existing >= 0) {
    next[existing] = { ...next[existing], status };
  } else {
    next.push({ id: makeId(), label, status, kind });
  }
  return next;
}

export function AiActivityProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<AiActivityEvent[]>([]);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  const push = useCallback((event: AiActivityEvent) => {
    setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
    return event.id;
  }, []);

  const log = useCallback((
    agent: string,
    action: string,
    detail?: string,
    status: ActivityStatus = 'complete',
    pageKey?: string,
  ) => {
    const id = makeId();
    push({
      id,
      agent,
      action,
      detail,
      status,
      timestamp: Date.now(),
      pageKey,
    });
    return id;
  }, [push]);

  const startAgent = useCallback((agent: string, action: string, pageKey?: string) => {
    const id = makeId();
    push({
      id,
      agent,
      action,
      status: 'running',
      timestamp: Date.now(),
      pageKey,
      steps: [],
    });
    return id;
  }, [push]);

  const updateEvent = useCallback((eventId: string, patch: Partial<Pick<AiActivityEvent, 'action' | 'detail' | 'status'>>) => {
    setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, ...patch } : e)));
  }, []);

  const addStep = useCallback((
    eventId: string,
    label: string,
    status: ActivityStatus = 'running',
    kind: StepKind = 'action',
  ) => {
    setEvents((prev) => prev.map((e) => {
      if (e.id !== eventId) return e;
      return { ...e, steps: upsertStep(e.steps ?? [], label, status, kind) };
    }));
  }, []);

  const addThought = useCallback((eventId: string, label: string, status: ActivityStatus = 'running') => {
    addStep(eventId, label, status, 'thought');
  }, [addStep]);

  const addAction = useCallback((eventId: string, label: string, status: ActivityStatus = 'running') => {
    addStep(eventId, label, status, 'action');
  }, [addStep]);

  const completeAgent = useCallback((eventId: string, detail?: string) => {
    setEvents((prev) => prev.map((e) => {
      if (e.id !== eventId) return e;
      const steps = (e.steps ?? []).map((s) => (
        s.status === 'running' ? { ...s, status: 'complete' as const } : s
      ));
      return { ...e, status: 'complete', detail: detail ?? e.detail, steps };
    }));
  }, []);

  const failAgent = useCallback((eventId: string, detail?: string) => {
    setEvents((prev) => prev.map((e) => {
      if (e.id !== eventId) return e;
      const steps = (e.steps ?? []).map((s) => (
        s.status === 'running' ? { ...s, status: 'error' as const } : s
      ));
      return { ...e, status: 'error', detail: detail ?? e.detail, steps };
    }));
  }, []);

  const clearPage = useCallback((pageKey: string) => {
    setEvents((prev) => prev.filter((e) => e.pageKey !== pageKey));
  }, []);

  const clearAll = useCallback(() => setEvents([]), []);

  const value = useMemo(() => ({
    events,
    log,
    startAgent,
    addStep,
    addThought,
    addAction,
    updateEvent,
    completeAgent,
    failAgent,
    clearPage,
    clearAll,
  }), [events, log, startAgent, addStep, addThought, addAction, updateEvent, completeAgent, failAgent, clearPage, clearAll]);

  return (
    <AiActivityContext.Provider value={value}>
      {children}
    </AiActivityContext.Provider>
  );
}

export function useAiActivity() {
  const ctx = useContext(AiActivityContext);
  if (!ctx) throw new Error('useAiActivity must be used within AiActivityProvider');
  return ctx;
}

/** Stream thought then action lines into an agent run (for live chatbot UX). */
export async function streamAgentProcess(
  eventId: string,
  opts: {
    thoughts: string[];
    actions: string[];
    addThought: (id: string, label: string, status?: ActivityStatus) => void;
    addAction: (id: string, label: string, status?: ActivityStatus) => void;
    stepMs?: number;
  },
) {
  const delay = opts.stepMs ?? 280;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const thought of opts.thoughts) {
    opts.addThought(eventId, thought, 'running');
    await sleep(delay);
    opts.addThought(eventId, thought, 'complete');
  }
  for (const action of opts.actions) {
    opts.addAction(eventId, action, 'running');
    await sleep(delay);
    opts.addAction(eventId, action, 'complete');
  }
}
