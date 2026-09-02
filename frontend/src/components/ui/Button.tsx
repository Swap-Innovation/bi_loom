import { cn } from '../../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ variant = 'primary', size = 'md', className, children, disabled, ...props }: ButtonProps) {
  const variants = {
    primary:
      'bg-primary text-white hover:bg-[#A80D4D] shadow-[0_1px_0_rgba(15,23,42,0.06)] disabled:opacity-45',
    secondary:
      'bg-ink text-white hover:bg-slate-800 disabled:opacity-45',
    outline:
      'border border-border-strong bg-white text-ink hover:bg-surface disabled:opacity-45',
    ghost:
      'text-ink-muted hover:text-ink hover:bg-black/[0.04] disabled:opacity-45',
    danger:
      'bg-error text-white hover:bg-red-800 disabled:opacity-45',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-[12px]',
    md: 'px-4 py-2 text-[13px]',
    lg: 'px-5 py-2.5 text-sm',
  };
  return (
    <button
      className={cn(
        'rounded-md font-semibold tracking-tight transition-colors inline-flex items-center justify-center gap-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2',
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
