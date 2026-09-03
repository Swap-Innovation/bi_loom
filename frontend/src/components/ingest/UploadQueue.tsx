import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { CheckCircle, Loader, XCircle } from 'lucide-react';
import { cn } from '../../utils/cn';
import { ProgressBar } from '../ui/ProgressBar';

export type UploadStage = 'pending' | 'validating' | 'uploading' | 'done' | 'error';

export interface UploadProgressUpdate {
  stage?: UploadStage;
  progress?: number;
  stageLabel?: string;
}

export interface QueuedFile {
  id: string;
  file: File;
  status: UploadStage;
  progress: number;
  stageLabel: string;
  error?: string;
}

export interface UploadQueueHandle {
  enqueue: (files: FileList | File[]) => void;
}

interface UploadQueueProps {
  onUpload: (file: File, report: (update: UploadProgressUpdate) => void) => Promise<void>;
  onFileComplete?: (file: File) => void;
  onComplete?: () => void;
  accept?: string;
  className?: string;
}

export const UploadQueue = forwardRef<UploadQueueHandle, UploadQueueProps>(function UploadQueue(
  { onUpload, onFileComplete, onComplete, accept = '.zip,.xml,.json,.sql', className },
  ref,
) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [pumpVersion, setPumpVersion] = useState(0);
  const processingRef = useRef(false);
  const onUploadRef = useRef(onUpload);
  const onFileCompleteRef = useRef(onFileComplete);
  const onCompleteRef = useRef(onComplete);

  onUploadRef.current = onUpload;
  onFileCompleteRef.current = onFileComplete;
  onCompleteRef.current = onComplete;

  const updateItem = useCallback((id: string, patch: Partial<QueuedFile>) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const enqueue = useCallback((files: FileList | File[]) => {
    const newItems: QueuedFile[] = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      status: 'pending',
      progress: 0,
      stageLabel: 'Queued',
    }));
    setQueue((prev) => [...prev, ...newItems]);
    setPumpVersion((v) => v + 1);
  }, []);

  useImperativeHandle(ref, () => ({ enqueue }), [enqueue]);

  useEffect(() => {
    if (processingRef.current) return;

    const pending = queue.find((q) => q.status === 'pending');
    if (!pending) return;

    processingRef.current = true;
    const item = pending;

    const report = (update: UploadProgressUpdate) => {
      updateItem(item.id, {
        ...(update.stage ? { status: update.stage } : {}),
        ...(update.progress !== undefined ? { progress: update.progress } : {}),
        ...(update.stageLabel ? { stageLabel: update.stageLabel } : {}),
      });
    };

    const run = async () => {
      updateItem(item.id, {
        status: 'uploading',
        progress: 5,
        stageLabel: 'Preparing upload…',
      });

      try {
        await onUploadRef.current(item.file, report);
        updateItem(item.id, {
          status: 'done',
          progress: 100,
          stageLabel: 'Uploaded',
        });
        onFileCompleteRef.current?.(item.file);
      } catch (err) {
        updateItem(item.id, {
          status: 'error',
          progress: 0,
          stageLabel: 'Failed',
          error: (err as Error).message,
        });
      } finally {
        processingRef.current = false;
        setPumpVersion((v) => v + 1);
      }
    };

    void run();
  }, [queue, pumpVersion, updateItem]);

  useEffect(() => {
    if (
      queue.length > 0
      && queue.every((q) => q.status === 'done' || q.status === 'error')
      && !processingRef.current
    ) {
      onCompleteRef.current?.();
    }
  }, [queue, pumpVersion]);

  const done = queue.filter((q) => q.status === 'done').length;
  const active = queue.find((q) => q.status === 'validating' || q.status === 'uploading');
  const hasPending = queue.some((q) => q.status === 'pending');
  const overallProgress = queue.length
    ? Math.round(
        queue.reduce((sum, q) => sum + (q.status === 'done' ? 100 : q.progress), 0) / queue.length,
      )
    : 0;

  return (
    <div className={className}>
      <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-surface transition-colors">
        <input
          type="file"
          className="hidden"
          accept={accept}
          multiple
          onChange={(e) => {
            if (e.target.files?.length) enqueue(e.target.files);
            e.target.value = '';
          }}
        />
        Browse files
      </label>

      {queue.length > 0 && (
        <div className="mt-4 space-y-2 text-left">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{done} of {queue.length} uploaded</span>
            {active ? (
              <span className="text-primary font-medium truncate max-w-[55%]">{active.stageLabel}</span>
            ) : hasPending ? (
              <span>Waiting to start…</span>
            ) : done === queue.length ? (
              <span className="text-success font-medium">All complete</span>
            ) : null}
          </div>
          <ProgressBar value={overallProgress} label={active?.file.name} />
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-white">
            {queue.map((item) => (
              <li key={item.id} className="px-3 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <StatusIcon status={item.status} />
                  <span className="flex-1 truncate font-mono text-xs">{item.file.name}</span>
                  <span className="text-gray-400 text-xs shrink-0">{formatSize(item.file.size)}</span>
                </div>
                <div className="mt-1.5 ml-7 flex items-center gap-2">
                  {item.status !== 'pending' && item.status !== 'done' && item.status !== 'error' && (
                    <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                  <span
                    className={cn(
                      'text-xs shrink-0',
                      item.status === 'error' ? 'text-error' : 'text-gray-500',
                    )}
                  >
                    {item.error ?? item.stageLabel}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

function StatusIcon({ status }: { status: UploadStage }) {
  if (status === 'done') return <CheckCircle size={16} className="text-success shrink-0" />;
  if (status === 'error') return <XCircle size={16} className="text-error shrink-0" />;
  if (status === 'validating' || status === 'uploading') {
    return <Loader size={16} className="text-primary animate-spin shrink-0" />;
  }
  return <span className={cn('w-4 h-4 rounded-full border-2 border-gray-200 shrink-0')} />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
