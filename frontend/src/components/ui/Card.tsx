import { cn } from '../../utils/cn';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}

export function Card({ children, className, title, action }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface-raised rounded-lg border border-border',
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          {title && <h3 className="text-sm font-medium text-ink">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  subtext,
  className,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 py-1', className)}>
      <p className="text-eyebrow mb-2">{label}</p>
      <p className="text-[1.75rem] font-normal tracking-normal text-ink tabular-nums leading-none">
        {value}
      </p>
      {subtext && <p className="text-caption mt-2">{subtext}</p>}
    </div>
  );
}
