import { cn } from '../../utils/cn';

const variants = {
  default: 'bg-surface text-ink border border-border',
  primary: 'bg-primary-soft text-primary border border-primary/20',
  success: 'bg-emerald-50 text-success border border-emerald-200/80',
  warning: 'bg-amber-50 text-warning border border-amber-200/80',
  error: 'bg-red-50 text-error border border-red-200/80',
  outline: 'border border-border text-ink-muted bg-white',
};

const sizes = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-[11px]',
};

interface BadgeProps {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', size = 'md', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md font-semibold tracking-wide uppercase',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ConfidenceBadge({ level }: { level: string }) {
  const map: Record<string, keyof typeof variants> = {
    HIGH: 'success',
    MEDIUM: 'warning',
    LOW: 'error',
  };
  return <Badge variant={map[level] || 'default'} size="sm">{level}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, keyof typeof variants> = {
    COMPLETED: 'success',
    APPROVED: 'success',
    FAILED: 'error',
    REJECTED: 'error',
    PENDING_REVIEW: 'warning',
    RUNNING: 'warning',
    PARSING: 'warning',
    MAPPING: 'warning',
    MAPPING_APPROVED: 'success',
    GENERATED: 'success',
    VALIDATING: 'warning',
    GENERATING: 'warning',
    REVIEW_REQUIRED: 'warning',
    PARSED: 'primary',
    CREATED: 'outline',
  };
  return (
    <Badge variant={colorMap[status] || 'outline'} size="sm">
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
