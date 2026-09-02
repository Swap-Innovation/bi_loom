import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';
import { useWorkflow } from '../../hooks/useWorkflow';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';

export interface BreadcrumbCrumb {
  label: string;
  to?: string;
}

interface ProjectHeaderProps {
  breadcrumb?: BreadcrumbCrumb[];
}

export function ProjectHeader({ breadcrumb = [] }: ProjectHeaderProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: !!projectId,
  });
  const { data: workflow } = useWorkflow(projectId);

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-border px-5 sm:px-6 py-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-faint hover:text-primary mb-1"
          >
            <ArrowLeft size={13} /> Projects
          </Link>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[17px] font-bold tracking-tight truncate text-ink">
              {project?.name ?? 'Loading...'}
            </h1>
            {project && <StatusBadge status={project.status} />}
          </div>
          {project?.description && (
            <p className="text-[13px] text-ink-muted mt-0.5 truncate">{project.description}</p>
          )}
          {breadcrumb.length > 0 && (
            <nav className="flex items-center gap-1 text-[11px] text-ink-faint mt-2" aria-label="Breadcrumb">
              <Link to={`/projects/${projectId}/overview`} className="hover:text-primary">
                Project
              </Link>
              {breadcrumb.map((crumb) => (
                <span key={crumb.label} className="flex items-center gap-1">
                  <ChevronRight size={11} />
                  {crumb.to ? (
                    <Link to={crumb.to} className="text-ink-muted hover:text-primary">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-ink-muted">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
        </div>

        {workflow?.next_action && (
          workflow.next_action.enabled === false ? (
            <Button
              size="sm"
              disabled
              title="Finish parsing before this step unlocks"
            >
              {workflow.next_action.label}
            </Button>
          ) : (
            <Link to={workflow.next_action.route}>
              <Button size="sm">{workflow.next_action.label}</Button>
            </Link>
          )
        )}
      </div>
    </header>
  );
}
