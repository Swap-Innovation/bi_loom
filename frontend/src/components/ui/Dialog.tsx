import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './Button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Dialog({ open, onClose, title, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  if (!open) return null;

  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' };

  return (
    <dialog
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 m-auto w-full rounded-lg border-0 bg-white p-0 g-elev-2 backdrop:bg-black/32',
        sizes[size],
      )}
      onClose={onClose}
    >
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <h2 className="text-[22px] font-normal text-ink leading-7">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-2 -mr-2 rounded-full text-ink-faint hover:bg-surface hover:text-ink"
        >
          <X size={18} />
        </button>
      </div>
      <div className="px-6 py-3">{children}</div>
      {footer && <div className="px-6 py-4 flex justify-end gap-2">{footer}</div>}
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', variant = 'primary', loading,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button size="sm" type="button" variant={variant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={loading}>
            {loading ? 'Please wait...' : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-muted leading-5">{message}</p>
    </Dialog>
  );
}
