import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Database, Trash2, Upload, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Tabs';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { ModelCatalog } from '../../components/target/ModelCatalog';
import { SchemaGraph } from '../../components/target/SchemaGraph';
import { GlossaryManager } from '../../components/target/GlossaryManager';
import { PhaseContinueHint } from '../../components/navigation/PhaseContinueHint';

export function TargetModelPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('models');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: catalog } = useQuery({
    queryKey: ['target-catalog', projectId],
    queryFn: () => api.listTargetModelCatalog(projectId!),
    enabled: !!projectId,
  });

  const { data: imported } = useQuery({
    queryKey: ['pluto-models', projectId],
    queryFn: () => api.listPlutoModels(projectId!),
    enabled: !!projectId,
  });

  const activeModel = imported?.find((m) => m.is_active);
  const projectModels = imported ?? [];

  const { data: coverage } = useQuery({
    queryKey: ['model-coverage', projectId],
    queryFn: () => api.getModelCoverage(projectId!),
    enabled: !!projectId && !!activeModel,
  });

  const { data: graph, isLoading: graphLoading } = useQuery({
    queryKey: ['pluto-graph', projectId],
    queryFn: () => api.getPlutoGraph(projectId!),
    enabled: !!projectId && !!activeModel,
  });

  const invalidateTarget = () => {
    queryClient.invalidateQueries({ queryKey: ['pluto-models', projectId] });
    queryClient.invalidateQueries({ queryKey: ['conversion', projectId] });
    queryClient.invalidateQueries({ queryKey: ['workflow', projectId] });
    queryClient.invalidateQueries({ queryKey: ['model-coverage', projectId] });
    queryClient.invalidateQueries({ queryKey: ['pluto-graph', projectId] });
    queryClient.invalidateQueries({ queryKey: ['pluto-tree', projectId] });
    queryClient.invalidateQueries({ queryKey: ['mappings', projectId] });
    queryClient.invalidateQueries({ queryKey: ['mapping-stats', projectId] });
  };

  const selectMutation = useMutation({
    mutationFn: ({ catalogId, name }: { catalogId: string; name: string }) =>
      api.selectTargetModel(projectId!, catalogId, name),
    onSuccess: () => {
      toast.success('Target model selected — Mapping is now available');
      invalidateTarget();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to select model'),
  });

  const activateMutation = useMutation({
    mutationFn: (modelId: string) => api.activatePlutoModel(projectId!, modelId),
    onSuccess: () => {
      toast.success('Model activated — re-check mappings if you switched models');
      invalidateTarget();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to activate model'),
  });

  const deleteMutation = useMutation({
    mutationFn: (modelId: string) => api.deletePlutoModel(projectId!, modelId),
    onSuccess: (data) => {
      toast.success(
        data.cleared_active
          ? 'Active model removed — select another before Mapping / Convert'
          : 'Model removed',
      );
      setDeleteId(null);
      invalidateTarget();
    },
    onError: (err: Error) => toast.error(err.message || 'Remove failed'),
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => api.importPlutoModel(projectId!, file),
    onSuccess: () => {
      toast.success('Custom model imported and activated');
      invalidateTarget();
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Import failed');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-title">Target Semantic Model</h2>
          <p className="text-caption mt-1">
            Select one Pluto model for mapping. Mapping and Convert stay locked until a model is active.
          </p>
        </div>
        {activeModel ? (
          <PhaseContinueHint
            to={`/projects/${projectId}/map`}
            label="Continue to Mapping"
            readyMessage="Target model selected."
          />
        ) : (
          <div className="inline-flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertCircle size={16} />
            Select a model to unlock Mapping
          </div>
        )}
      </div>

      <Tabs
        tabs={[
          { id: 'models', label: 'Models' },
          { id: 'glossary', label: 'Glossary' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'glossary' ? (
        <GlossaryManager projectId={projectId!} />
      ) : (
        <>
          {!activeModel && (
            <Card className="!p-4 border-amber-200 bg-amber-50/50">
              <p className="text-sm text-amber-900">
                <strong>No active target.</strong> Choose a preset below or upload a custom model JSON.
                Convert cannot run until Target and Mapping review are complete.
              </p>
            </Card>
          )}

          {activeModel && coverage?.ready && (
            <Card className="!p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold">Model health — field coverage</p>
                  <p className="text-xs text-gray-500">
                    {coverage.matched_count} of {coverage.total_source_fields} source fields have a candidate target match
                  </p>
                </div>
                <span className="text-2xl font-bold text-primary">{coverage.match_pct}%</span>
              </div>
              <ProgressBar value={coverage.match_pct} />
              {coverage.unmatched_sample && coverage.unmatched_sample.length > 0 && (
                <p className="text-xs text-gray-500 mt-2 truncate">
                  Unmatched sample: {coverage.unmatched_sample.join(', ')}
                </p>
              )}
            </Card>
          )}

          {activeModel && coverage && !coverage.ready && (
            <Card className="!p-4">
              <p className="text-sm text-gray-500">
                Coverage preview needs a completed MSpec. Finish ingest Generate MSpec first.
              </p>
            </Card>
          )}

          {activeModel && (
            <Card className="border-primary/30 bg-pink-50 !p-4">
              <div className="flex items-center gap-3">
                <Database className="text-primary" size={24} />
                <div className="flex-1">
                  <p className="text-xs text-gray-500 uppercase">Active target model</p>
                  <p className="font-semibold text-lg">{activeModel.name}</p>
                  <p className="text-sm text-gray-500">
                    {activeModel.table_count} tables · {activeModel.column_count} columns · {activeModel.measure_count} measures
                  </p>
                </div>
                <Badge variant="outline">Selected for mapping</Badge>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold mb-3 uppercase tracking-wide text-gray-500">Preset Catalog</h3>
              <ModelCatalog
                catalog={catalog ?? []}
                activeCatalogId={activeModel?.catalog_id}
                onSelect={(catalogId, name) => selectMutation.mutate({ catalogId, name })}
                selecting={selectMutation.isPending}
              />
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-3 uppercase tracking-wide text-gray-500">Relationship Graph</h3>
                <SchemaGraph graph={activeModel ? graph : null} loading={!!activeModel && graphLoading} />
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3 uppercase tracking-wide text-gray-500">Project Models</h3>
                {!projectModels.length ? (
                  <Card>
                    <p className="text-gray-400 text-sm text-center py-6">No models in this project yet.</p>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {projectModels.map((model) => (
                      <Card key={model.id} className={`!p-3 ${model.is_active ? 'border-primary' : ''}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{model.name}</p>
                            <p className="text-xs text-gray-400">
                              {model.table_count} tables
                              {model.created_at ? ` · ${new Date(model.created_at).toLocaleDateString()}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {model.is_active ? (
                              <Badge>Active</Badge>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => activateMutation.mutate(model.id)}>
                                Activate
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Remove from project"
                              onClick={() => setDeleteId(model.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 size={14} className="text-gray-400" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                <div className="mt-4">
                  <label className="cursor-pointer">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".json"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) importMutation.mutate(f);
                      }}
                    />
                    <span className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface">
                      <Upload size={14} />
                      {importMutation.isPending ? 'Importing…' : 'Upload Custom Model JSON'}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {activeModel && (
            <p className="text-xs text-gray-400">
              Next: <Link to={`/projects/${projectId}/map`} className="text-primary hover:underline">Mapping</Link>
              {' '}— Convert unlocks only after mapping review is finished.
            </p>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Remove model?"
        message={
          projectModels.find((m) => m.id === deleteId)?.is_active
            ? 'This is the active model. Removing it locks Mapping and Convert until you select another.'
            : 'This removes the model from the project. Catalog presets remain available to select again.'
        }
        confirmLabel="Remove"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
