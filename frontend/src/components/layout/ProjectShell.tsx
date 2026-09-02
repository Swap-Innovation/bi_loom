import { Outlet, useLocation, useParams } from 'react-router-dom';
import { ProjectHeader, type BreadcrumbCrumb } from './ProjectHeader';
import { PhaseSidebar } from './PhaseSidebar';
import { PHASE_META } from '../navigation/migrationFlow';

function resolveBreadcrumb(pathname: string, projectId: string | undefined): BreadcrumbCrumb[] {
  if (!projectId) return [];
  const base = `/projects/${projectId}`;
  const segments = pathname.split('/').filter(Boolean);
  // projects / :id / phase / ...
  const rest = segments.slice(2);
  const head = rest[0] ?? 'overview';
  const sub = rest[1];

  if (head === 'overview') {
    return [{ label: PHASE_META.overview.label, to: `${base}/overview` }];
  }
  if (head === 'ingest') {
    const crumbs: BreadcrumbCrumb[] = [{ label: PHASE_META.ingest.label, to: `${base}/ingest` }];
    if (sub === 'artifacts') crumbs.push({ label: 'Upload' });
    else if (sub === 'parsing') crumbs.push({ label: 'Parsing' });
    else if (sub === 'mspec') crumbs.push({ label: 'MSpec' });
    return crumbs;
  }
  if (head === 'target') {
    return [{ label: PHASE_META.target.label }];
  }
  if (head === 'map') {
    return [{ label: PHASE_META.map.label }];
  }
  if (head === 'convert') {
    return [{ label: PHASE_META.convert.label }];
  }
  if (head === 'deliver') {
    const crumbs: BreadcrumbCrumb[] = [{ label: PHASE_META.deliver.label, to: `${base}/deliver` }];
    if (sub === 'generate') crumbs.push({ label: 'Generate PBI' });
    else if (sub === 'validate') crumbs.push({ label: 'Validate' });
    else if (sub === 'results') crumbs.push({ label: 'Results & Download' });
    return crumbs;
  }
  return [{ label: head.charAt(0).toUpperCase() + head.slice(1) }];
}

export function ProjectShell() {
  const location = useLocation();
  const { projectId } = useParams<{ projectId: string }>();
  const breadcrumb = resolveBreadcrumb(location.pathname, projectId);

  return (
    <div className="flex flex-col min-h-full">
      <ProjectHeader breadcrumb={breadcrumb} />
      <div className="flex flex-1 w-full min-h-0">
        <PhaseSidebar />
        <main className="flex-1 min-w-0 p-5 sm:p-6 bg-transparent overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
