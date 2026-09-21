import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Upload, Trash2, CheckCircle, Circle, ArrowRight, FolderOpen, Plug, Clock,
} from 'lucide-react';
import { api } from '../services/api';
import type { Artifact } from '../types';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { ConfirmDialog } from '../components/ui/Dialog';
import {
  UploadQueue,
  type UploadProgressUpdate,
  type UploadQueueHandle,
} from '../components/ingest/UploadQueue';
import { useAiActivity } from '../context/AiActivityContext';
import { usePageContext } from '../hooks/usePageContext';
import { cn } from '../utils/cn';

type IngestSource = 'local' | 'sapbo';

/** SAP BO exportable / common companion formats for local ingest */
const BO_ACCEPT =
  '.zip,.xml,.biar,.lcmbiar,.wid,.rep,.unv,.unx,.qry,.json,.sql';

const BO_FORMAT_LABELS = [
  { ext: 'ZIP', desc: 'Promotion / LCM / export packages' },
  { ext: 'XML', desc: 'Report & dashboard definitions' },
  { ext: 'BIAR / LCMBIAR', desc: 'Business Intelligence Archive' },
  { ext: 'WID / REP', desc: 'WebI & Desktop Intelligence' },
  { ext: 'UNV / UNX', desc: 'Universe semantic layers' },
  { ext: 'JSON / SQL', desc: 'Manifests & query scripts' },
];

const SAP_BO_COMING_SOON = [
  'CMS folders & document inventory',
  'WebI, Crystal, Dashboard & Analysis reports',
  'Universes (UNV / UNX) and connections',
  'Promotion Management / LCM content live pull',
];

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
  const [source, setSource] = useState<IngestSource>('local');
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
      if (file.name.toLowerCase().endsWith('.zip') || file.name.toLowerCase().endsWith('.biar') || file.name.toLowerCase().endsWith('.lcmbiar')) {
        wrap({ stage: 'validating', progress: 15, stageLabel: 'Validating archive structure…' });
        if (file.name.toLowerCase().endsWith('.zip')) {
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
          wrap({ progress: 30, stageLabel: 'BIAR package accepted — structure validated on parse' });
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
        <span className="text-xs text-ink-faint whitespace-nowrap">
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
          className="text-ink-faint hover:text-error p-1"
          onClick={(e) => { e.stopPropagation(); setDeleteId(row.original.id); }}
        >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-title">Upload Assets</h2>
        <p className="text-body mt-1.5 max-w-2xl">
          Choose how to bring SAP Business Objects assets into this migration. File upload is available now;
          live CMS / BO connection is planned next.
        </p>
      </div>

      {/* Source chooser — two SAP BO options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8" role="tablist" aria-label="Ingest source">
        <button
          type="button"
          role="tab"
          aria-selected={source === 'local'}
          onClick={() => setSource('local')}
          className={cn(
            'text-left rounded-lg border px-5 py-4 transition-colors',
            source === 'local'
              ? 'border-primary/40 bg-primary-soft ring-1 ring-primary/20'
              : 'border-border bg-white hover:border-border-strong hover:bg-slate-50/80',
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                source === 'local' ? 'bg-primary text-white' : 'bg-slate-100 text-ink-muted',
              )}
            >
              <FolderOpen size={18} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-[14px] tracking-tight text-ink">
                Browse BO export
              </p>
              <p className="text-caption mt-1 leading-snug">
                Upload ZIP, XML, and SAP Business Objects exportable formats from your workstation.
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={source === 'sapbo'}
          onClick={() => setSource('sapbo')}
          className={cn(
            'text-left rounded-lg border px-5 py-4 transition-colors',
            source === 'sapbo'
              ? 'border-primary/40 bg-primary-soft ring-1 ring-primary/20'
              : 'border-border bg-white hover:border-border-strong hover:bg-slate-50/80',
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                source === 'sapbo' ? 'bg-primary text-white' : 'bg-slate-100 text-ink-muted',
              )}
            >
              <Plug size={18} strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-[14px] tracking-tight text-ink">
                  Connect with SAP BO
                </p>
                <Badge variant="outline" size="sm">Coming soon</Badge>
              </div>
              <p className="text-caption mt-1 leading-snug">
                Authenticate to the CMS and pull WebI, Crystal, universes, and related repository assets.
              </p>
            </div>
          </div>
        </button>
      </div>

      {source === 'local' && (
        <div role="tabpanel" className="space-y-6">
          <div
            className={cn(
              'rounded-lg border border-dashed p-8 sm:p-10 text-center transition-colors bg-white/70',
              dragging ? 'border-primary bg-primary-soft' : 'border-border-strong hover:border-primary/50',
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto mb-3 text-ink-faint" size={36} strokeWidth={1.5} />
            <p className="font-semibold text-ink tracking-tight mb-1">
              Drop SAP Business Objects export here
            </p>
            <p className="text-caption mb-5 max-w-md mx-auto">
              Progress and checklist details stream in BI Loom Assistant. When ready, continue to Parsing.
            </p>
            <UploadQueue
              ref={queueRef}
              accept={BO_ACCEPT}
              onUpload={uploadFile}
              onFileComplete={onFileComplete}
              onComplete={refreshAfterUpload}
            />
          </div>

          <div className="rounded-lg border border-border bg-white px-5 py-4">
            <p className="text-eyebrow mb-3">Supported formats</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5">
              {BO_FORMAT_LABELS.map((f) => (
                <li key={f.ext} className="flex items-baseline gap-2 text-[13px]">
                  <span className="font-mono text-[11px] font-semibold text-ink shrink-0">{f.ext}</span>
                  <span className="text-ink-faint truncate">{f.desc}</span>
                </li>
              ))}
            </ul>
          </div>

          {checklist && (
            <Card title="Pre-parse checklist">
              <ul className="space-y-2 text-sm">
                {checklist.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    {item.done ? (
                      <CheckCircle size={16} className="text-success shrink-0" />
                    ) : (
                      <Circle size={16} className="text-ink-faint shrink-0" />
                    )}
                    <span className={item.done ? 'text-ink' : 'text-ink-muted'}>{item.label}</span>
                  </li>
                ))}
              </ul>
              {checklist.document_count > 0 && (
                <p className="text-caption mt-3">
                  Manifest: {checklist.document_count} documents, {checklist.connection_count} connections
                </p>
              )}
              {checklist.ready && (
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm text-success font-medium">
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
            <Card title="ZIP preview">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                <div>
                  <p className="text-caption">Files</p>
                  <p className="font-semibold tabular-nums">{validation.file_count ?? validation.files?.length ?? 0}</p>
                </div>
                <div>
                  <p className="text-caption">Documents</p>
                  <p className="font-semibold tabular-nums">{validation.document_count ?? '—'}</p>
                </div>
                <div>
                  <p className="text-caption">Connections</p>
                  <p className="font-semibold tabular-nums">{validation.connection_count ?? '—'}</p>
                </div>
                <div>
                  <p className="text-caption">Status</p>
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

          <Card title="Uploaded artifacts">
            <DataTable
              data={artifacts ?? []}
              columns={columns}
              loading={isLoading}
              emptyMessage="No artifacts uploaded yet"
              getRowId={(a) => a.id}
            />
          </Card>
        </div>
      )}

      {source === 'sapbo' && (
        <div
          role="tabpanel"
          className="rounded-lg border border-border bg-white px-6 py-10 sm:px-10"
        >
          <div className="max-w-xl mx-auto text-center">
            <span className="inline-flex items-center justify-center h-12 w-12 rounded-md bg-slate-100 text-ink-muted mb-4">
              <Plug size={22} strokeWidth={1.5} />
            </span>
            <div className="flex items-center justify-center gap-2 mb-2">
              <h3 className="text-title">SAP Business Objects connection</h3>
              <Badge variant="outline" size="sm">Coming soon</Badge>
            </div>
            <p className="text-body mt-2">
              Connect to your SAP BO Central Management Server (CMS) to discover and pull source assets
              without a manual BIAR / ZIP export.
            </p>
            <ul className="mt-6 text-left space-y-2.5 border-t border-border pt-5">
              {SAP_BO_COMING_SOON.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-[13px] text-ink-muted">
                  <Clock size={14} className="text-ink-faint shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <Button
              className="mt-8"
              disabled
              title="SAP BO live connection is not available yet"
            >
              Connect with SAP BO
            </Button>
            <p className="text-caption mt-3">
              Use <button type="button" className="text-primary font-semibold hover:underline" onClick={() => setSource('local')}>Browse BO export</button> for now.
            </p>
          </div>

          {(artifacts?.length ?? 0) > 0 && (
            <div className="mt-10 border-t border-border pt-6">
              <Card title="Already uploaded artifacts">
                <DataTable
                  data={artifacts ?? []}
                  columns={columns}
                  loading={isLoading}
                  emptyMessage="No artifacts uploaded yet"
                  getRowId={(a) => a.id}
                />
              </Card>
            </div>
          )}
        </div>
      )}

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
