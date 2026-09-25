import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useWorkflow } from '../../hooks/useWorkflow';
import { MigrationSidebarNav } from '../navigation/MigrationSidebarNav';
import { SimplePhaseLink } from '../navigation/FlowNavGroup';
import { PHASE_META } from '../navigation/migrationFlow';

export function PhaseSidebar() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: workflow } = useWorkflow(projectId);
  const base = `/projects/${projectId}`;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    ingest: true,
    convert: false,
    deliver: false,
  });

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const overviewStatus = workflow?.phases.every((p) => p.status === 'complete')
    ? 'complete'
    : workflow?.phases.some((p) => p.status === 'in_progress')
      ? 'in_progress'
      : 'pending';

  const progress = useMemo(() => {
    const phases = workflow?.phases ?? [];
    if (!phases.length) return { done: 0, total: 5, pct: 0 };
    const done = phases.filter((p) => p.status === 'complete').length;
    return { done, total: phases.length, pct: Math.round((done / phases.length) * 100) };
  }, [workflow]);

  const currentLabel = useMemo(() => {
    const phase = workflow?.phases.find((p) => p.id === workflow.current_phase);
    return phase?.label ?? 'Overview';
  }, [workflow]);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface min-h-0">
      <div className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-eyebrow">Workflow</h2>
          <span className="text-[11px] tabular-nums text-ink-faint font-medium">
            {progress.done}/{progress.total}
          </span>
        </div>
        <div
          className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-[#E8EAED]"
          role="progressbar"
          aria-valuenow={progress.pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Migration progress"
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
        <p className="mt-2 truncate text-[11px] text-ink-faint">
          Current: <span className="font-semibold text-ink-muted">{currentLabel}</span>
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 pb-8" aria-label="Migration workflow">
        <SimplePhaseLink
          phaseNumber={PHASE_META.overview.number}
          label={PHASE_META.overview.label}
          to={`${base}/overview`}
          icon={PHASE_META.overview.icon}
          status={overviewStatus}
          blocked={false}
          end
        />

        <div className="my-2 mx-2 border-t border-border" role="separator" />

        <MigrationSidebarNav expanded={expanded} onToggle={toggle} />
      </nav>
    </aside>
  );
}
