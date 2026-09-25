import { useState } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

interface InspectorPanelProps {
  title?: string;
  children?: React.ReactNode;
}

export function InspectorPanel({ title = 'Inspector', children }: InspectorPanelProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 p-3.5 bg-primary text-white rounded-full g-elev-2 hover:bg-primary-hover z-10"
        title="Open inspector"
      >
        <PanelRightOpen size={20} />
      </button>
    );
  }

  return (
    <aside className="w-72 shrink-0 border-l border-border bg-white min-h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <p className="text-sm font-semibold">{title}</p>
        <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-full text-ink-faint hover:bg-surface hover:text-ink">
          <PanelRightClose size={18} />
        </button>
      </div>
      <div className="flex-1 p-4 overflow-y-auto text-sm text-gray-500">
        {children ?? (
          <p className="text-center py-8 text-gray-400">
            Select an object in the workspace to view details and actions.
          </p>
        )}
      </div>
    </aside>
  );
}
