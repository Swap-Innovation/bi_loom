import { NavLink } from 'react-router-dom';
import {
  Check, ChevronDown, Circle, Loader2, Lock,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import type { StepStatus } from './migrationFlow';

export interface FlowSubStep {
  id: string;
  stepLabel: string;
  label: string;
  to: string;
  status: StepStatus;
  locked?: boolean;
  blocker?: string | null;
  icon?: React.ElementType;
  end?: boolean;
  active?: boolean;
}

interface FlowNavGroupProps {
  phaseNumber: number;
  label: string;
  parentTo: string;
  parentActive: boolean;
  parentStatus: StepStatus;
  parentBlocked: boolean;
  parentBlockers?: string[];
  parentIcon: React.ElementType;
  substeps: FlowSubStep[];
  expanded: boolean;
  onToggle: () => void;
  progress?: string;
}

function StatusPip({ status, locked }: { status: StepStatus; locked?: boolean }) {
  if (locked || status === 'blocked') {
    return <Lock size={12} className="text-gray-300 shrink-0" aria-hidden />;
  }
  if (status === 'complete') {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success/15 shrink-0" aria-hidden>
        <Check size={10} className="text-success" strokeWidth={3} />
      </span>
    );
  }
  if (status === 'in_progress') {
    return <Loader2 size={12} className="text-primary animate-spin shrink-0" aria-hidden />;
  }
  if (status === 'failed') {
    return <Circle size={10} className="text-error fill-error/20 shrink-0" aria-hidden />;
  }
  return <Circle size={10} className="text-gray-300 shrink-0" aria-hidden />;
}

export function FlowNavGroup({
  label,
  parentTo,
  parentActive,
  parentStatus,
  parentBlocked,
  parentBlockers,
  parentIcon: ParentIcon,
  substeps,
  expanded,
  onToggle,
  progress,
}: FlowNavGroupProps) {
  const rowBase = 'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors';

  return (
    <div className="space-y-0.5">
      <div className="flex items-stretch gap-0.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
        >
          <ChevronDown
            size={14}
            className={cn('transition-transform duration-150', !expanded && '-rotate-90')}
          />
        </button>

        {parentBlocked ? (
          <div
            className={cn(rowBase, 'flex-1 cursor-not-allowed text-gray-400')}
            title={parentBlockers?.join('; ')}
          >
            <ParentIcon size={16} className="shrink-0 opacity-40" strokeWidth={1.75} />
            <span className="flex-1 truncate font-medium">{label}</span>
            <StatusPip status="blocked" locked />
          </div>
        ) : (
          <NavLink
            to={parentTo}
            className={cn(
              rowBase,
              'flex-1 min-w-0',
              parentActive
                ? 'bg-primary-soft font-semibold text-ink'
                : 'font-medium text-ink-muted hover:bg-slate-50 hover:text-ink',
            )}
          >
            <ParentIcon
              size={16}
              className={cn('shrink-0', parentActive ? 'text-primary' : 'text-gray-500')}
              strokeWidth={1.75}
            />
            <span className="flex-1 truncate">{label}</span>
            {progress && (
              <span className="text-[11px] tabular-nums text-gray-400 font-normal">{progress}</span>
            )}
            <StatusPip status={parentStatus} />
          </NavLink>
        )}
      </div>

      {expanded && substeps.length > 0 && (
        <ul className="ml-[1.125rem] space-y-0.5 border-l border-border pl-3">
          {substeps.map((step) => {
            const Icon = step.icon;

            if (step.locked) {
              return (
                <li key={step.id}>
                  <div
                    className={cn(rowBase, 'cursor-not-allowed text-gray-400')}
                    title={step.blocker ?? 'Complete the previous step first'}
                  >
                    {Icon && <Icon size={14} className="shrink-0 opacity-40" strokeWidth={1.75} />}
                    <span className="flex-1 truncate">{step.label}</span>
                    <StatusPip status="blocked" locked />
                  </div>
                </li>
              );
            }

            return (
              <li key={step.id}>
                <NavLink
                  to={step.to}
                  end={step.end}
                  className={cn(
                    rowBase,
                    step.active
                      ? 'bg-primary-soft font-medium text-ink'
                      : 'text-ink-muted hover:bg-slate-50 hover:text-ink',
                  )}
                >
                  {Icon && (
                    <Icon
                      size={14}
                      className={cn('shrink-0', step.active ? 'text-primary' : 'text-gray-400')}
                      strokeWidth={1.75}
                    />
                  )}
                  <span className="flex-1 truncate">{step.label}</span>
                  <StatusPip status={step.status} />
                </NavLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface SimplePhaseLinkProps {
  phaseNumber: number;
  label: string;
  to: string;
  icon: React.ElementType;
  status: StepStatus;
  blocked: boolean;
  blockers?: string[];
  end?: boolean;
}

export function SimplePhaseLink({
  label, to, icon: Icon, status, blocked, blockers, end,
}: SimplePhaseLinkProps) {
  const rowBase = 'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors';

  if (blocked) {
    return (
      <div
        className={cn(rowBase, 'cursor-not-allowed text-gray-400')}
        title={blockers?.join('; ')}
      >
        <Icon size={16} className="shrink-0 opacity-40" strokeWidth={1.75} />
        <span className="flex-1 truncate font-medium">{label}</span>
        <StatusPip status="blocked" locked />
      </div>
    );
  }

  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn(
        rowBase,
        isActive
          ? 'bg-primary-soft font-semibold text-ink'
          : 'font-medium text-ink-muted hover:bg-slate-50 hover:text-ink',
      )}
    >
      {({ isActive }) => (
        <>
          <Icon
            size={16}
            className={cn('shrink-0', isActive ? 'text-primary' : 'text-gray-500')}
            strokeWidth={1.75}
          />
          <span className="flex-1 truncate">{label}</span>
          <StatusPip status={status} />
        </>
      )}
    </NavLink>
  );
}
