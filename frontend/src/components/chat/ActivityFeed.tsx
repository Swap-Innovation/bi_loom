import { useEffect, useRef } from 'react';
import { Bot, Brain, CheckCircle2, Loader2, XCircle, Zap } from 'lucide-react';
import type { AiActivityEvent, AiActivityStep } from '../../context/AiActivityContext';
import { cn } from '../../utils/cn';

interface ActivityFeedProps {
  events: AiActivityEvent[];
  pageKey?: string;
  className?: string;
  /** When true, show all project events (not page-filtered). */
  showAll?: boolean;
}

function StatusIcon({ status }: { status: AiActivityEvent['status'] }) {
  if (status === 'complete') return <CheckCircle2 size={14} className="text-success shrink-0" />;
  if (status === 'error') return <XCircle size={14} className="text-error shrink-0" />;
  if (status === 'running') return <Loader2 size={14} className="text-primary animate-spin shrink-0" />;
  return <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 shrink-0" />;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function StepRow({ step }: { step: AiActivityStep }) {
  const isThought = step.kind === 'thought';
  return (
    <div className="flex items-start gap-1.5 text-[11px]">
      {isThought ? (
        <Brain size={11} className={cn('mt-0.5 shrink-0', step.status === 'running' ? 'text-violet-500' : 'text-violet-400')} />
      ) : (
        <Zap size={11} className={cn('mt-0.5 shrink-0', step.status === 'running' ? 'text-amber-500' : 'text-amber-400')} />
      )}
      <StatusIcon status={step.status} />
      <div className="min-w-0 flex-1">
        <span className={cn(
          'uppercase tracking-wide text-[9px] font-semibold mr-1.5',
          isThought ? 'text-violet-500' : 'text-amber-600',
        )}
        >
          {isThought ? 'Thinking' : 'Action'}
        </span>
        <span className={cn(
          'leading-snug',
          step.status === 'running' && 'text-primary font-medium',
          step.status === 'complete' && 'text-gray-600',
          step.status === 'error' && 'text-error',
        )}
        >
          {step.label}
        </span>
      </div>
    </div>
  );
}

export function ActivityCard({ event }: { event: AiActivityEvent }) {
  const thoughts = (event.steps ?? []).filter((s) => s.kind === 'thought');
  const actions = (event.steps ?? []).filter((s) => (s.kind ?? 'action') === 'action');
  const hasSteps = thoughts.length > 0 || actions.length > 0;

  return (
    <div
      className={cn(
        'rounded-lg border text-xs overflow-hidden',
        event.status === 'running' && 'border-primary/30 bg-pink-50/50',
        event.status === 'complete' && 'border-border bg-white',
        event.status === 'error' && 'border-red-200 bg-red-50/50',
        event.status === 'pending' && 'border-border bg-white',
      )}
    >
      <div className="flex items-start gap-2 px-2.5 py-2">
        <div className="mt-0.5 p-1 rounded-md bg-primary/10 text-primary shrink-0">
          <Bot size={12} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <StatusIcon status={event.status} />
            <span className="font-semibold text-gray-800 truncate">{event.agent}</span>
            <span className="text-gray-400 ml-auto shrink-0">{formatTime(event.timestamp)}</span>
          </div>
          <p className="text-gray-700 mt-0.5 leading-snug">{event.action}</p>
          {event.detail && (
            <p className={cn(
              'mt-1 leading-snug',
              event.status === 'error' ? 'text-error' : 'text-gray-500',
            )}
            >
              {event.detail}
            </p>
          )}
        </div>
      </div>

      {hasSteps && (
        <div className="border-t border-border/60 bg-white/70 px-2.5 py-2 space-y-2">
          {thoughts.length > 0 && (
            <div className="space-y-1">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-violet-500 flex items-center gap-1">
                <Brain size={10} /> Thought process
              </p>
              {thoughts.map((step) => (
                <StepRow key={step.id} step={step} />
              ))}
            </div>
          )}
          {actions.length > 0 && (
            <div className="space-y-1">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-600 flex items-center gap-1">
                <Zap size={10} /> Actions taken
              </p>
              {actions.map((step) => (
                <StepRow key={step.id} step={step} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ActivityFeed({ events, pageKey, className, showAll }: ActivityFeedProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const filtered = showAll || !pageKey
    ? events
    : events.filter((e) => !e.pageKey || e.pageKey === pageKey);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filtered.length, filtered[0]?.id, filtered[0]?.steps?.length, filtered[0]?.status]);

  if (filtered.length === 0) {
    return (
      <div className={cn('text-xs text-gray-400 text-center py-6 px-3', className)}>
        LLM thought process and actions for each step will stream here.
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div ref={topRef} />
      {filtered.map((event) => (
        <ActivityCard key={event.id} event={event} />
      ))}
    </div>
  );
}
