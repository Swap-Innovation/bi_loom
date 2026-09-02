import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';

export interface AiStatus {
  mode: 'mock' | 'live';
  provider: 'mock' | 'cursor' | 'openai';
  model: string;
  label: string;
}

interface AiModeBadgeProps {
  status?: AiStatus | null;
  className?: string;
  compact?: boolean;
}

function providerLabel(status: AiStatus): string {
  if (status.provider === 'cursor') {
    return status.model ? `Cursor · ${status.model}` : 'Cursor';
  }
  if (status.provider === 'openai') {
    return status.model ? `OpenAI · ${status.model}` : 'OpenAI';
  }
  if (status.label === 'Mock fallback') {
    return 'No API key';
  }
  return 'Offline rules';
}

export function AiModeBadge({ status, className, compact = false }: AiModeBadgeProps) {
  if (!status) return null;

  const isLive = status.mode === 'live' && status.provider !== 'mock';
  const variant = isLive ? 'success' : status.label === 'Mock fallback' ? 'warning' : 'outline';

  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-[10px] font-medium',
          isLive ? 'text-green-100' : 'text-pink-100',
          className,
        )}
        title={providerLabel(status)}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            isLive ? 'bg-green-300 animate-pulse' : 'bg-white/50',
          )}
        />
        {status.label}
      </span>
    );
  }

  return (
    <span title={providerLabel(status)} className={className}>
      <Badge variant={variant} size="sm">
        {isLive && (
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
        )}
        {status.label}
        <span className="ml-1 opacity-75 font-normal">· {providerLabel(status)}</span>
      </Badge>
    </span>
  );
}
