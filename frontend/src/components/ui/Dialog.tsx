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
      className={cn('fixed inset-0 z-50 m-auto w-full rounded-xl border border-border bg-white p-0 shadow-xl backdrop:bg-black/40', sizes[size])}
      onClose={onClose}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer && <div className="px-5 py-4 border-t border-border flex justify-end gap-2">{footer}</div>}
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
          <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button size="sm" type="button" variant={variant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={loading}>
            {loading ? 'Please wait...' : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600">{message}</p>
    </Dialog>
  );
}
