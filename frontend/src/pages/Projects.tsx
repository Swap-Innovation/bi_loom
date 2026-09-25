import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Trash2, Sparkles, ArrowRight } from 'lucide-react';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonTable } from '../components/ui/Skeleton';

export function Projects() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data: projects, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: api.listProjects,
  });

  const createMutation = useMutation({
    mutationFn: () => api.createProject({ name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreate(false);
      setName('');
      setDescription('');
      toast.success('Project created');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create project'),
  });

  const createTemplateMutation = useMutation({
    mutationFn: () => api.createProjectFromTemplate(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Demo project created from sample-data template');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create demo project'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDeleteId(null);
      toast.success('Project deleted');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to delete project');
    },
  });

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 pb-16">
      <section className="pt-10 sm:pt-14 pb-8 animate-rise">
        <p className="text-eyebrow mb-3">Workspace</p>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="max-w-xl">
            <h1 className="text-display">Projects</h1>
            <p className="text-body mt-3 text-[15px]">
              Each project is an end-to-end BO → Power BI migration with ingest, mapping, convert, and deliver.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => createTemplateMutation.mutate()}
              disabled={createTemplateMutation.isPending}
            >
              <Sparkles size={15} /> Sample template
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={15} /> New project
            </Button>
          </div>
        </div>
      </section>

      {showCreate && (
        <Card title="New migration project" className="mb-8 animate-rise-delay-1 !shadow-none">
          <div className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-ink-muted mb-1.5">Project name</label>
              <input
                className="field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Fixed Telco Orders Migration"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-ink-muted mb-1.5">Description</label>
              <textarea
                className="field-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-ink-muted mb-1.5">Source</label>
                <input className="field-input" value="SAP Business Objects" readOnly />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-ink-muted mb-1.5">Target</label>
                <input className="field-input" value="Power BI" readOnly />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending}>
                Create project
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <SkeletonTable rows={4} />
      ) : isError ? (
        <Card>
          <EmptyState
            title="Could not load projects"
            description={error instanceof Error ? error.message : 'The backend API is unavailable. Ensure Docker services are running.'}
            action={<Button onClick={() => refetch()}>Retry</Button>}
          />
        </Card>
      ) : projects?.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-white px-6 py-14">
          <EmptyState
            title="No projects yet"
            description="Create a project or use the sample-data template to get started."
            action={
              <Button onClick={() => createTemplateMutation.mutate()} disabled={createTemplateMutation.isPending}>
                <Sparkles size={16} /> Create from sample template
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="rounded-lg border border-border bg-white overflow-hidden divide-y divide-border animate-rise-delay-1">
          {projects?.map((project) => (
            <li key={project.id} className="flex items-stretch group">
              <Link
                to={`/projects/${project.id}/overview`}
                className="flex-1 min-w-0 flex items-center gap-4 px-5 py-4 hover:bg-surface transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="font-medium text-sm text-ink group-hover:text-primary transition-colors">
                      {project.name}
                    </h3>
                    <StatusBadge status={project.status} />
                  </div>
                  <p className="text-caption mt-1 truncate">
                    {project.description || 'No description'}
                  </p>
                  <p className="text-[11px] text-ink-faint mt-1.5 font-medium">
                    {project.source_technology} → {project.target_technology}
                  </p>
                </div>
                <ArrowRight size={16} className="text-ink-faint group-hover:text-primary shrink-0 hidden sm:block" />
              </Link>
              <div className="flex items-center pr-3 border-l border-transparent group-hover:border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  aria-label={`Delete ${project.name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleteId(project.id);
                  }}
                >
                  <Trash2 size={15} className="text-ink-faint hover:text-error" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => !deleteMutation.isPending && setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
        }}
        title="Delete project?"
        message="This will permanently delete the project, all artifacts, mappings, and generated files from storage."
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
