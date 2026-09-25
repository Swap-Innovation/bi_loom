import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { api } from '../../services/api';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useJourneyContinue } from '../../hooks/useJourneyContinue';

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
  const continueAction = useJourneyContinue(projectId);

  return (
    <header className="bg-white border-b border-border px-5 sm:px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-primary mb-1"
          >
            <ArrowLeft size={13} /> Projects
          </Link>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-normal truncate text-ink">
              {project?.name ?? 'Loading...'}
            </h1>
            {project && <StatusBadge status={project.status} />}
          </div>
          {project?.description && (
            <p className="text-sm text-ink-muted mt-0.5 truncate">{project.description}</p>
          )}
          {breadcrumb.length > 0 && (
            <nav className="flex items-center gap-1 text-xs text-ink-faint mt-2" aria-label="Breadcrumb">
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

        {continueAction && (
          continueAction.enabled ? (
            <Link to={continueAction.route} className="shrink-0">
              <Button size="sm">
                {continueAction.label}
                <ArrowRight size={14} />
              </Button>
            </Link>
          ) : (
            <Button
              size="sm"
              disabled
              className="shrink-0"
              title={continueAction.disabledReason ?? 'Complete this step first'}
            >
              {continueAction.label}
              <ArrowRight size={14} />
            </Button>
          )
        )}
      </div>
    </header>
  );
}
