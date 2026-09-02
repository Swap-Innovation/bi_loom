import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FolderKanban } from 'lucide-react';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/Badge';
import { cn } from '../utils/cn';

const PIPELINE = [
  { key: 'parsed', label: 'Parsed', field: 'parsed' as const },
  { key: 'mapped', label: 'Mapped', field: 'mapped' as const },
  { key: 'generated', label: 'Generated', field: 'generated' as const },
  { key: 'validated', label: 'Validated', field: 'validation_passed' as const },
] as const;

function formatStatusLabel(status: string) {
  return status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.getDashboard,
  });

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: api.listProjects,
  });

  if (statsLoading && !stats) {
    return (
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 text-caption">
        Loading workspace…
      </div>
    );
  }

  const s = stats!;
  const progress = Math.min(100, Math.round(s.migration_progress));
  const recent = (projects ?? []).slice(0, 5);
  const attention = s.needs_review + s.unsupported;

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 pb-16">
      {/* Hero — brand + one composition */}
      <section className="pt-10 sm:pt-14 pb-10 animate-rise">
        <p className="text-eyebrow mb-3">Migration AI</p>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
          <div className="max-w-2xl">
            <h1 className="text-display">
              Business Objects to Power BI, under control.
            </h1>
            <p className="text-body mt-4 text-[15px] max-w-xl">
              Ingest SAP BO exports, map to your semantic model, convert assets,
              and deliver validated Power BI packages — with a clear audit trail.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link to="/projects">
              <Button size="lg">
                Open projects
                <ArrowRight size={16} />
              </Button>
            </Link>
            <Link to="/integrations">
              <Button size="lg" variant="outline">
                Platform stack
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Progress — single narrative strip */}
      <section className="animate-rise-delay-1 mb-12">
        <div className="rounded-lg border border-border bg-white/70 backdrop-blur-sm px-5 sm:px-6 py-5">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <p className="text-eyebrow">Portfolio progress</p>
              <p className="text-title mt-1">Across all migration projects</p>
            </div>
            <p className="text-2xl font-bold tracking-tight tabular-nums text-ink">
              {progress}
              <span className="text-sm font-semibold text-ink-faint ml-1">%</span>
            </p>
          </div>
          <div className="h-1.5 bg-slate-200/80 rounded-sm overflow-hidden">
            <div
              className="h-full bg-primary rounded-sm progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
            {PIPELINE.map((step, i) => {
              const value = s[step.field];
              return (
                <div key={step.key} className="min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={cn(
                        'w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center',
                        value > 0
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 text-ink-faint border border-border',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="text-eyebrow !normal-case !tracking-normal !text-[11px] text-ink-muted">
                      {step.label}
                    </span>
                  </div>
                  <p className="text-xl font-bold tracking-tight tabular-nums text-ink pl-7">
                    {value}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Metrics — flat row, not a card grid wall */}
      <section className="animate-rise-delay-2 mb-14">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-8 border-y border-border py-8">
          <div>
            <p className="text-eyebrow mb-2">Reports in scope</p>
            <p className="text-[1.75rem] font-bold tracking-tight tabular-nums">{s.reports_in_scope}</p>
            <p className="text-caption mt-2">Catalog baseline</p>
          </div>
          <div>
            <p className="text-eyebrow mb-2">High confidence</p>
            <p className="text-[1.75rem] font-bold tracking-tight tabular-nums">{s.high_confidence}</p>
            <p className="text-caption mt-2">AI mappings ≥ threshold</p>
          </div>
          <div>
            <p className="text-eyebrow mb-2">Needs review</p>
            <p className="text-[1.75rem] font-bold tracking-tight tabular-nums">{s.needs_review}</p>
            <p className="text-caption mt-2">Pending SME approval</p>
          </div>
          <div>
            <p className="text-eyebrow mb-2">Attention</p>
            <p className="text-[1.75rem] font-bold tracking-tight tabular-nums">
              {attention}
            </p>
            <p className="text-caption mt-2">
              {s.unsupported} unsupported · {s.needs_review} in review
            </p>
          </div>
        </div>
      </section>

      {/* Active projects */}
      <section className="animate-rise-delay-3">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <p className="text-eyebrow">Workspace</p>
            <h2 className="text-title mt-1">Active projects</h2>
          </div>
          <Link
            to="/projects"
            className="text-[13px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
          >
            View all
            <ArrowRight size={14} />
          </Link>
        </div>

        {projectsLoading && !projects ? (
          <p className="text-caption py-8">Loading projects…</p>
        ) : recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-strong bg-white/50 px-6 py-12 text-center">
            <FolderKanban className="mx-auto text-ink-faint mb-3" size={28} strokeWidth={1.5} />
            <p className="text-title">No projects yet</p>
            <p className="text-body mt-2 max-w-md mx-auto">
              Create a migration project or start from the sample Business Objects template.
            </p>
            <Link to="/projects" className="inline-block mt-5">
              <Button>Go to projects</Button>
            </Link>
          </div>
        ) : (
          <ul className="rounded-lg border border-border bg-white overflow-hidden divide-y divide-border">
            {recent.map((project) => (
              <li key={project.id}>
                <Link
                  to={`/projects/${project.id}/overview`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/80 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <p className="font-semibold text-[14px] tracking-tight text-ink group-hover:text-primary transition-colors truncate">
                        {project.name}
                      </p>
                      <StatusBadge status={project.status} />
                    </div>
                    <p className="text-caption mt-1 truncate">
                      {project.source_technology} → {project.target_technology}
                      {project.description ? ` · ${project.description}` : ''}
                    </p>
                  </div>
                  <span className="text-[12px] font-medium text-ink-faint hidden sm:inline shrink-0">
                    {formatStatusLabel(project.status)}
                  </span>
                  <ArrowRight
                    size={16}
                    className="text-ink-faint group-hover:text-primary shrink-0 transition-colors"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
