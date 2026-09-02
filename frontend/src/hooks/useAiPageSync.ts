import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAiActivity } from '../context/AiActivityContext';
import { useAssistantHistory } from '../context/AssistantHistoryContext';
import { useJobTray } from '../context/JobTrayContext';
import { usePageContext } from '../hooks/usePageContext';

function isParseAgent(agent: string) {
  const a = agent.toLowerCase();
  return a.includes('parse') || a.includes('bo parse');
}

function isMappingAgent(agent: string, pageKey?: string) {
  if (pageKey === 'map') return true;
  return agent.toLowerCase().includes('mapping');
}

/** Sync page navigation + heal stuck agent cards in the AI activity feed. */
export function useAiPageSync(projectId?: string) {
  const { pageKey, pageLabel } = usePageContext();
  const { events, log, completeAgent } = useAiActivity();
  const { entries, syncActivity } = useAssistantHistory();
  const { activeJobs } = useJobTray();
  const lastPage = useRef<string | null>(null);
  const healedParseRef = useRef(false);
  const healedMappingRef = useRef(false);

  useEffect(() => {
    if (lastPage.current === pageKey) return;
    lastPage.current = pageKey;
    log('Navigation', `Opened ${pageLabel}`, undefined, 'complete', pageKey);
  }, [pageKey, pageLabel, log]);

  const { data: parseStatus } = useQuery({
    queryKey: ['parseStatus', projectId],
    queryFn: () => api.getParseStatus(projectId!),
    enabled: !!projectId && (pageKey === 'ingest/parsing' || pageKey.startsWith('ingest/')),
    refetchInterval: (query) => (
      query.state.data?.status === 'RUNNING' ? 1500 : false
    ),
  });

  useEffect(() => {
    if (!parseStatus || parseStatus.status !== 'COMPLETED') {
      healedParseRef.current = false;
      return;
    }
    if (healedParseRef.current) return;

    const total = parseStatus.progress?.grand_total;
    const detail = total != null
      ? `Parsed ${total} assets · draft ready`
      : 'Parse complete · draft ready';

    let didHeal = false;

    for (const e of events) {
      if (!(e.pageKey === 'ingest/parsing' || isParseAgent(e.agent))) continue;
      if (e.status === 'running' || (e.steps ?? []).some((s) => s.status === 'running')) {
        completeAgent(e.id, detail);
        didHeal = true;
      }
    }

    for (const entry of entries) {
      if (entry.kind !== 'activity' || !entry.activitySnapshot) continue;
      const snap = entry.activitySnapshot;
      if (!(snap.pageKey === 'ingest/parsing' || isParseAgent(snap.agent))) continue;
      const stepsStuck = (snap.steps ?? []).some((s) => s.status === 'running');
      if (snap.status !== 'running' && !stepsStuck) continue;
      syncActivity({
        ...snap,
        status: 'complete',
        detail: detail || snap.detail,
        steps: (snap.steps ?? []).map((s) => (
          s.status === 'running' ? { ...s, status: 'complete' as const } : s
        )),
      });
      didHeal = true;
    }

    const stillStuckInHistory = entries.some((e) => {
      if (e.kind !== 'activity' || !e.activitySnapshot) return false;
      const snap = e.activitySnapshot;
      if (!(snap.pageKey === 'ingest/parsing' || isParseAgent(snap.agent))) return false;
      return snap.status === 'running' || (snap.steps ?? []).some((s) => s.status === 'running');
    });

    if (didHeal || !stillStuckInHistory) {
      healedParseRef.current = true;
    }
  }, [parseStatus, events, entries, completeAgent, syncActivity]);

  const { data: mappingStats } = useQuery({
    queryKey: ['mapping-stats', projectId],
    queryFn: () => api.getMappingStats(projectId!),
    enabled: !!projectId && pageKey === 'map',
    refetchInterval: 5000,
  });

  // Only heal stuck mapping cards when no live mapping job is tracked
  // (avoids closing the live stream while fields are still mapping).
  const mappingJobLive = activeJobs.some(
    (j) => j.pageKey === 'map' || j.label.toLowerCase().includes('mapping'),
  );

  useEffect(() => {
    if (pageKey !== 'map' || !mappingStats || mappingJobLive) {
      if (mappingJobLive) healedMappingRef.current = false;
      return;
    }
    const hasMappings = (mappingStats.total ?? 0) > 0;
    if (!hasMappings) {
      healedMappingRef.current = false;
      return;
    }
    if (healedMappingRef.current) return;

    const detail = `${mappingStats.total} mappings ready for review`;
    let didHeal = false;

    for (const e of events) {
      if (!isMappingAgent(e.agent, e.pageKey)) continue;
      if (e.status === 'running' || (e.steps ?? []).some((s) => s.status === 'running')) {
        completeAgent(e.id, detail);
        didHeal = true;
      }
    }

    for (const entry of entries) {
      if (entry.kind !== 'activity' || !entry.activitySnapshot) continue;
      const snap = entry.activitySnapshot;
      if (!isMappingAgent(snap.agent, snap.pageKey)) continue;
      const stepsStuck = (snap.steps ?? []).some((s) => s.status === 'running');
      if (snap.status !== 'running' && !stepsStuck) continue;
      syncActivity({
        ...snap,
        status: 'complete',
        detail: detail || snap.detail,
        steps: (snap.steps ?? []).map((s) => (
          s.status === 'running' ? { ...s, status: 'complete' as const } : s
        )),
      });
      didHeal = true;
    }

    if (didHeal) healedMappingRef.current = true;
  }, [pageKey, mappingStats, mappingJobLive, events, entries, completeAgent, syncActivity]);

  const lastMappingLog = useRef<number>(0);

  useEffect(() => {
    if (pageKey !== 'map' || !mappingStats) return;
    if (mappingStats.total > 0 && mappingStats.total !== lastMappingLog.current) {
      lastMappingLog.current = mappingStats.total;
      log(
        'Mapping Workbench',
        `${mappingStats.total} mappings · ${mappingStats.approved} approved`,
        `${mappingStats.pending} pending review`,
        'complete',
        pageKey,
      );
    }
  }, [mappingStats, pageKey, log]);
}
