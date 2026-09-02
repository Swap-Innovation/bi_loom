import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AiActivityEvent } from './AiActivityContext';
import { useAiActivity } from './AiActivityContext';

export type HistoryEntryKind = 'user' | 'assistant' | 'activity' | 'system';

export interface HistoryEntry {
  id: string;
  kind: HistoryEntryKind;
  timestamp: number;
  content?: string;
  activityId?: string;
  /** Frozen copy so history survives refresh / event eviction */
  activitySnapshot?: AiActivityEvent;
  pageKey?: string;
  pageLabel?: string;
}

interface AssistantHistoryContextValue {
  entries: HistoryEntry[];
  appendUser: (content: string, pageKey?: string, pageLabel?: string) => string;
  appendAssistant: (content: string, opts?: {
    activityId?: string;
    pageKey?: string;
    pageLabel?: string;
  }) => string;
  appendSystem: (content: string, pageKey?: string) => void;
  appendActivity: (event: AiActivityEvent) => void;
  syncActivity: (event: AiActivityEvent) => void;
  clearHistory: () => void;
  buildLlmHistory: (events: AiActivityEvent[], limit?: number) => { role: string; content: string }[];
  buildActivityDigest: (events: AiActivityEvent[], limit?: number) => string;
}

const AssistantHistoryContext = createContext<AssistantHistoryContextValue | null>(null);

const MAX_ENTRIES = 200;
const STORAGE_PREFIX = 'migration-ai-assistant-history:';

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function storageKey(scope: string) {
  return `${STORAGE_PREFIX}${scope}`;
}

function loadEntries(scope: string): HistoryEntry[] {
  try {
    const raw = sessionStorage.getItem(storageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function saveEntries(scope: string, entries: HistoryEntry[]) {
  try {
    sessionStorage.setItem(storageKey(scope), JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* ignore quota */
  }
}

export function formatActivityForLlm(event: AiActivityEvent): string {
  const thoughts = (event.steps ?? [])
    .filter((s) => s.kind === 'thought')
    .map((s) => `  · [thinking] ${s.label}`)
    .join('\n');
  const actions = (event.steps ?? [])
    .filter((s) => (s.kind ?? 'action') === 'action')
    .map((s) => `  · [action] ${s.label}`)
    .join('\n');
  return [
    `[ACTIVITY ${event.status.toUpperCase()}] ${event.agent}: ${event.action}`,
    event.detail ? `  result: ${event.detail}` : null,
    thoughts || null,
    actions || null,
  ].filter(Boolean).join('\n');
}

export function AssistantHistoryProvider({
  children,
  scope = 'global',
}: {
  children: React.ReactNode;
  scope?: string;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => loadEntries(scope));
  const scopeRef = useRef(scope);

  useEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    setEntries(loadEntries(scope));
  }, [scope]);

  useEffect(() => {
    saveEntries(scope, entries);
  }, [scope, entries]);

  const appendUser = useCallback((content: string, pageKey?: string, pageLabel?: string) => {
    const id = makeId();
    const entry: HistoryEntry = {
      id, kind: 'user', content, timestamp: Date.now(), pageKey, pageLabel,
    };
    setEntries((prev) => [...prev, entry].slice(-MAX_ENTRIES));
    return id;
  }, []);

  const appendAssistant = useCallback((
    content: string,
    opts?: { activityId?: string; pageKey?: string; pageLabel?: string },
  ) => {
    const id = makeId();
    const entry: HistoryEntry = {
      id,
      kind: 'assistant',
      content,
      timestamp: Date.now(),
      activityId: opts?.activityId,
      pageKey: opts?.pageKey,
      pageLabel: opts?.pageLabel,
    };
    setEntries((prev) => [...prev, entry].slice(-MAX_ENTRIES));
    return id;
  }, []);

  const appendSystem = useCallback((content: string, pageKey?: string) => {
    const entry: HistoryEntry = {
      id: makeId(), kind: 'system', content, timestamp: Date.now(), pageKey,
    };
    setEntries((prev) => [...prev, entry].slice(-MAX_ENTRIES));
  }, []);

  const appendActivity = useCallback((event: AiActivityEvent) => {
    if (event.agent === 'Navigation') return;
    setEntries((prev) => {
      if (prev.some((e) => e.kind === 'activity' && e.activityId === event.id)) {
        return prev.map((e) => (
          e.kind === 'activity' && e.activityId === event.id
            ? { ...e, activitySnapshot: event, timestamp: event.timestamp }
            : e
        ));
      }
      return [...prev, {
        id: makeId(),
        kind: 'activity' as const,
        activityId: event.id,
        activitySnapshot: event,
        timestamp: event.timestamp,
        pageKey: event.pageKey,
      }].slice(-MAX_ENTRIES);
    });
  }, []);

  const syncActivity = useCallback((event: AiActivityEvent) => {
    if (event.agent === 'Navigation') return;
    setEntries((prev) => {
      let changed = false;
      const next = prev.map((e) => {
        if (e.kind === 'activity' && e.activityId === event.id) {
          if (e.activitySnapshot === event) return e;
          changed = true;
          return { ...e, activitySnapshot: event };
        }
        return e;
      });
      return changed ? next : prev;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setEntries([]);
    saveEntries(scope, []);
  }, [scope]);

  const buildLlmHistory = useCallback((events: AiActivityEvent[], limit = 30) => {
    const byId = new Map(events.map((e) => [e.id, e]));
    const out: { role: string; content: string }[] = [];

    for (const entry of entries.slice(-limit)) {
      if (entry.kind === 'user' && entry.content) {
        out.push({ role: 'user', content: entry.content });
      } else if (entry.kind === 'assistant' && entry.content) {
        out.push({ role: 'assistant', content: entry.content });
      } else if (entry.kind === 'system' && entry.content) {
        out.push({ role: 'assistant', content: `[SYSTEM] ${entry.content}` });
      } else if (entry.kind === 'activity' && entry.activityId) {
        const event = byId.get(entry.activityId) ?? entry.activitySnapshot;
        if (event && event.agent !== 'Navigation') {
          out.push({ role: 'assistant', content: formatActivityForLlm(event) });
        }
      }
    }
    return out;
  }, [entries]);

  const buildActivityDigest = useCallback((events: AiActivityEvent[], limit = 15) => {
    const fromLive = events.filter((e) => e.agent !== 'Navigation').slice(0, limit);
    if (fromLive.length > 0) {
      return fromLive.map(formatActivityForLlm).join('\n\n');
    }
    // Fall back to snapshots in history
    return entries
      .filter((e) => e.kind === 'activity' && e.activitySnapshot)
      .slice(-limit)
      .map((e) => formatActivityForLlm(e.activitySnapshot!))
      .join('\n\n') || '(no recent agent activity)';
  }, [entries]);

  const value = useMemo(() => ({
    entries,
    appendUser,
    appendAssistant,
    appendSystem,
    appendActivity,
    syncActivity,
    clearHistory,
    buildLlmHistory,
    buildActivityDigest,
  }), [
    entries, appendUser, appendAssistant, appendSystem, appendActivity,
    syncActivity, clearHistory, buildLlmHistory, buildActivityDigest,
  ]);

  return (
    <AssistantHistoryContext.Provider value={value}>
      {children}
    </AssistantHistoryContext.Provider>
  );
}

/**
 * Mirror agent runs into chat timeline.
 * Dedupes by activityId; backfills live events missing from history
 * (so upload progress appears even if it started before the bridge mounted).
 */
export function ActivityHistoryBridge() {
  const { events } = useAiActivity();
  const { appendActivity, syncActivity, entries } = useAssistantHistory();
  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    for (const entry of entries) {
      if (entry.kind === 'activity' && entry.activityId) {
        seenRef.current.add(entry.activityId);
      }
    }
  }, [entries]);

  useEffect(() => {
    const chronological = [...events].sort((a, b) => a.timestamp - b.timestamp);
    for (const event of chronological) {
      if (event.agent === 'Navigation') continue;
      if (seenRef.current.has(event.id)) {
        syncActivity(event);
        continue;
      }
      seenRef.current.add(event.id);
      appendActivity(event);
    }
  }, [events, appendActivity, syncActivity]);

  return null;
}

export function useAssistantHistory() {
  const ctx = useContext(AssistantHistoryContext);
  if (!ctx) throw new Error('useAssistantHistory must be used within AssistantHistoryProvider');
  return ctx;
}
