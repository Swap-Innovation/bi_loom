import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../utils/cn';

interface PhaseContinueHintProps {
  to: string;
  label: string;
  /** Short status line before the link */
  readyMessage?: string;
  className?: string;
}

/**
 * Secondary next-step affordance on phase pages.
 * Primary journey CTA is in the project header (`useJourneyContinue`):
 * it always points at the *next* step and stays disabled until the current step is done.
 */
export function PhaseContinueHint({
  to,
  label,
  readyMessage = 'Ready for the next step.',
  className,
}: PhaseContinueHintProps) {
  return (
    <p className={cn('text-sm text-gray-600', className)}>
      {readyMessage}{' '}
      <Link
        to={to}
        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
      >
        {label}
        <ArrowRight size={14} aria-hidden />
      </Link>
    </p>
  );
}
