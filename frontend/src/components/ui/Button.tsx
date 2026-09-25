import { cn } from '../../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ variant = 'primary', size = 'md', className, children, disabled, ...props }: ButtonProps) {
  const variants = {
    primary:
      'bg-primary text-white hover:bg-primary-hover active:bg-primary-pressed disabled:opacity-40',
    secondary:
      'bg-primary-soft text-primary hover:bg-[#D2E3FC] disabled:opacity-40',
    outline:
      'border border-border bg-white text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-40',
    ghost:
      'text-ink-muted hover:text-ink hover:bg-black/[0.04] disabled:opacity-40',
    danger:
      'bg-error text-white hover:bg-[#B3261E] disabled:opacity-40',
  };
  const sizes = {
    sm: 'h-8 px-4 text-[13px]',
    md: 'h-9 px-6 text-sm',
    lg: 'h-10 px-6 text-sm',
  };
  return (
    <button
      className={cn(
        'rounded-[4px] font-medium inline-flex items-center justify-center gap-2',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
