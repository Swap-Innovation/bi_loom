import { cn } from '../../utils/cn';

const variants = {
  default: 'bg-surface text-ink-muted border border-border',
  primary: 'bg-primary-soft text-primary border border-transparent',
  success: 'bg-[#E6F4EA] text-success border border-transparent',
  warning: 'bg-[#FEF7E0] text-warning border border-transparent',
  error: 'bg-[#FCE8E6] text-error border border-transparent',
  outline: 'border border-border text-ink-muted bg-white',
};

const sizes = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-[12px]',
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
        'inline-flex items-center rounded-full font-medium',
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
