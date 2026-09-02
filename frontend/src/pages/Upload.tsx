import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, Trash2, CheckCircle, Circle, ArrowRight } from 'lucide-react';
import { api } from '../services/api';
import type { Artifact } from '../types';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { ConfirmDialog } from '../components/ui/Dialog';
import {
  UploadQueue,
  type UploadProgressUpdate,
  type UploadQueueHandle,
} from '../components/ingest/UploadQueue';
import { useAiActivity } from '../context/AiActivityContext';
import { usePageContext } from '../hooks/usePageContext';

interface ValidationPreview {
  valid: boolean;
  filename: string;
  file_count?: number;
  document_count?: number;
  connection_count?: number;
  warnings: string[];
  files?: { name: string; size: number }[];
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const queueRef = useRef<UploadQueueHandle>(null);
  const [dragging, setDragging] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationPreview | null>(null);
  const { pageKey } = usePageContext();
  const { startAgent, addThought, addAction, completeAgent, failAgent } = useAiActivity();
  const uploadRunRef = useRef<string | null>(null);
  const checklistLoggedRef = useRef(false);

  const { data: artifacts, isLoading } = useQuery({
    queryKey: ['artifacts', projectId],
    queryFn: () => api.listArtifacts(projectId!),
    enabled: !!projectId,
  });

  const { data: checklist } = useQuery({
    queryKey: ['preparse-checklist', projectId],
    queryFn: () => api.getPreparseChecklist(projectId!),
    enabled: !!projectId,
    refetchInterval: artifacts?.length ? 10000 : false,
  });

  const refreshAfterUpload = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['artifacts', projectId] });
    queryClient.invalidateQueries({ queryKey: ['workflow', projectId] });
    queryClient.invalidateQueries({ queryKey: ['preparse-checklist', projectId] });
    queryClient.invalidateQueries({ queryKey: ['ingest-flow', projectId] });
  }, [queryClient, projectId]);

  // Mirror checklist into Migration Assistant (process details live there)
  useEffect(() => {
    if (!checklist || checklistLoggedRef.current) return;
    if (!checklist.ready && !checklist.items.some((i) => i.done)) return;

    const runId = startAgent(
      'Upload Agent',
      checklist.ready ? 'Pre-parse checklist ready' : 'Updating pre-parse checklist',
      pageKey,
    );
    for (const item of checklist.items) {
      addThought(runId, item.label, item.done ? 'complete' : 'pending');
    }
    if (checklist.document_count > 0) {
      addAction(
        runId,
        `Manifest: ${checklist.document_count} documents, ${checklist.connection_count} connections`,
        'complete',
      );
    }
    if (checklist.ready) {
      addAction(runId, 'Ready for Parsing — open Parsing and start there', 'complete');
      completeAgent(runId, 'Upload phase checklist complete');
      checklistLoggedRef.current = true;
    } else {
      completeAgent(runId, 'Checklist in progress');
    }
  }, [checklist, pageKey, startAgent, addThought, addAction, completeAgent]);

  const uploadFile = useCallback(async (
    file: File,
    report: (update: UploadProgressUpdate) => void,
  ) => {
    if (!projectId) throw new Error('No project selected');
    checklistLoggedRef.current = false;

    const runId = startAgent('Upload Agent', `Ingesting ${file.name}`, pageKey);
    uploadRunRef.current = runId;
    addThought(runId, `Identify artifact type for “${file.name}”`, 'complete');
    addThought(runId, 'Decide validate-then-store path for BO ZIP vs raw file', 'complete');

    const wrap = (update: UploadProgressUpdate) => {
      report(update);
      if (update.stageLabel) {
        addAction(
          runId,
          update.stageLabel,
          update.stage === 'error' ? 'error' : (update.progress ?? 0) >= 98 ? 'complete' : 'running',
        );
      }
    };

    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        wrap({ stage: 'validating', progress: 15, stageLabel: 'Validating ZIP structure…' });
        const preview = await api.validateArtifact(projectId, file);
        setValidation(preview);
        wrap({
          progress: 35,
          stageLabel: `ZIP validated · ${preview.document_count ?? 0} docs, ${preview.connection_count ?? 0} connections`,
        });
        if (!preview.valid) {
          throw new Error(preview.warnings[0] || 'Invalid archive');
        }
        if (preview.file_count || preview.files?.length) {
          addAction(
            runId,
            `Archive contains ${preview.file_count ?? preview.files?.length ?? 0} files`,
            'complete',
          );
        }
      } else {
        setValidation(null);
        wrap({ progress: 20, stageLabel: 'Preparing file…' });
      }

      wrap({ stage: 'uploading', progress: 40, stageLabel: 'Uploading to server…' });
      await api.uploadArtifact(projectId, file, (pct) => {
        wrap({
          stage: 'uploading',
          progress: 40 + Math.round(pct * 0.55),
          stageLabel: pct < 100 ? `Uploading… ${pct}%` : 'Saving artifact…',
        });
      });
      wrap({ progress: 98, stageLabel: 'Finalizing project upload path…' });
      addAction(runId, 'Register artifact row + refresh ingest checklist', 'complete');
      completeAgent(runId, `${file.name} stored · ${formatSize(file.size)}`);
    } catch (err) {
      failAgent(runId, (err as Error).message);
      throw err;
    } finally {
      uploadRunRef.current = null;
    }
  }, [projectId, pageKey, startAgent, addThought, addAction, completeAgent, failAgent]);

  const onFileComplete = useCallback((file: File) => {
    toast.success(`Uploaded ${file.name}`);
    refreshAfterUpload();
  }, [refreshAfterUpload]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteArtifact(projectId!, id),
    onSuccess: () => {
      setValidation(null);
      checklistLoggedRef.current = false;
      queryClient.invalidateQueries({ queryKey: ['artifacts', projectId] });
      queryClient.invalidateQueries({ queryKey: ['preparse-checklist', projectId] });
      queryClient.invalidateQueries({ queryKey: ['ingest-flow', projectId] });
      queryClient.invalidateQueries({ queryKey: ['parseStatus', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workflow', projectId] });
      setDeleteId(null);
      toast.success('Artifact removed');
    },
    onError: () => toast.error('Failed to delete artifact'),
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) {
      queueRef.current?.enqueue(e.dataTransfer.files);
    }
  }, []);

  const columns: ColumnDef<Artifact, unknown>[] = [
    { accessorKey: 'filename', header: 'Filename' },
    {
      id: 'size',
      header: 'Size',
      cell: ({ row }) => formatSize(row.original.file_size),
    },
    {
      id: 'type',
      header: 'Type',
      cell: ({ row }) => <span className="uppercase">{row.original.file_type}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'created',
      header: 'Uploaded',
      cell: ({ row }) => (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {row.original.created_at
            ? new Date(row.original.created_at).toLocaleString()
            : '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          type="button"
          className="text-gray-400 hover:text-error p-1"
          onClick={(e) => { e.stopPropagation(); setDeleteId(row.original.id); }}
        >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  return (
    <div>
      <h2 className="text-title mb-6">Upload Business Objects Export</h2>
      <p className="text-caption -mt-4 mb-6">
        Drop or browse files below. Upload progress and checklist details stream in Migration Assistant.
        When ready, open <strong>Parsing</strong> and run Start Parsing there.
      </p>

      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center mb-6 transition-colors ${
          dragging ? 'border-primary bg-pink-50' : 'border-border hover:border-primary'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <Upload className="mx-auto mb-4 text-gray-400" size={40} />
        <p className="font-medium mb-1">Drop Business Objects export here</p>
        <p className="text-sm text-gray-500 mb-4">ZIP / XML / supported files — multiple files supported</p>
        <UploadQueue
          ref={queueRef}
          onUpload={uploadFile}
          onFileComplete={onFileComplete}
          onComplete={refreshAfterUpload}
        />
      </div>

      {checklist && (
        <Card title="Pre-parse Checklist" className="mb-6">
          <ul className="space-y-2 text-sm">
            {checklist.items.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                {item.done ? (
                  <CheckCircle size={16} className="text-success shrink-0" />
                ) : (
                  <Circle size={16} className="text-gray-300 shrink-0" />
                )}
                <span className={item.done ? 'text-dark' : 'text-gray-500'}>{item.label}</span>
              </li>
            ))}
          </ul>
          {checklist.document_count > 0 && (
            <p className="text-xs text-gray-500 mt-3">
              Manifest: {checklist.document_count} documents, {checklist.connection_count} connections
            </p>
          )}
          {checklist.ready && (
            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-success">
                Checklist complete — ready to parse.
              </p>
              <Link to={`/projects/${projectId}/ingest/parsing`}>
                <Button size="sm">
                  Continue to Parsing <ArrowRight size={14} />
                </Button>
              </Link>
            </div>
          )}
        </Card>
      )}

      {validation && (
        <Card title="ZIP Preview" className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
            <div>
              <p className="text-gray-500">Files</p>
              <p className="font-semibold">{validation.file_count ?? validation.files?.length ?? 0}</p>
            </div>
            <div>
              <p className="text-gray-500">Documents</p>
              <p className="font-semibold">{validation.document_count ?? '—'}</p>
            </div>
            <div>
              <p className="text-gray-500">Connections</p>
              <p className="font-semibold">{validation.connection_count ?? '—'}</p>
            </div>
            <div>
              <p className="text-gray-500">Status</p>
              <p className={validation.valid ? 'text-success font-semibold' : 'text-error font-semibold'}>
                {validation.valid ? 'Valid' : 'Invalid'}
              </p>
            </div>
          </div>
          {validation.warnings.length > 0 && (
            <ul className="text-xs text-warning list-disc pl-4">
              {validation.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </Card>
      )}

      <Card title="Uploaded Artifacts">
        <DataTable
          data={artifacts ?? []}
          columns={columns}
          loading={isLoading}
          emptyMessage="No artifacts uploaded yet"
          getRowId={(a) => a.id}
        />
      </Card>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Delete artifact?"
        message="This will remove the file from storage. You will need to re-upload before parsing."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
