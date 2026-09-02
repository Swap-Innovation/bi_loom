import { cn } from '../../utils/cn';

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercent?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function ProgressBar({ value, max = 100, label, showPercent = true, className, size = 'md' }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={className}>
      {(label || showPercent) && (
        <div className="flex justify-between text-xs mb-1">
          {label && <span className="text-gray-500">{label}</span>}
          {showPercent && <span className="text-primary font-medium">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className={cn('bg-gray-100 rounded-full overflow-hidden', size === 'sm' ? 'h-1.5' : 'h-2.5')}>
        <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
