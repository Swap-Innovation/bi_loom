import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

interface ThoughtLine {
  line: string;
  done: boolean;
}

interface StepThoughtLogProps {
  thoughts: ThoughtLine[];
  running?: boolean;
}

export function StepThoughtLog({ thoughts, running }: StepThoughtLogProps) {
  return (
    <div className="rounded-lg border border-border bg-surface/50 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-500">Thought process</p>
      <ol className="space-y-2">
        {thoughts.map((t, i) => {
          const Icon = running && i === thoughts.findIndex((x) => !x.done)
            ? Loader2
            : t.done
              ? CheckCircle2
              : Circle;
          return (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <Icon
                size={16}
                className={cn(
                  'shrink-0 mt-0.5',
                  t.done && 'text-success',
                  running && !t.done && i === thoughts.findIndex((x) => !x.done) && 'text-primary animate-spin',
                  !t.done && !running && 'text-gray-300',
                )}
              />
              <div className="min-w-0">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-violet-400 mr-1.5">Thinking</span>
                <span className={cn(t.done ? 'text-gray-700' : 'text-gray-500')}>{t.line}</span>
              </div>
            </li>
          );
        })}
      </ol>
      {running && (
        <p className="text-[11px] text-amber-600 flex items-center gap-1.5 border-t border-border pt-2">
          <Loader2 size={12} className="animate-spin" />
          Action: executing this conversion step — see Migration Assistant for live stream
        </p>
      )}
    </div>
  );
}
