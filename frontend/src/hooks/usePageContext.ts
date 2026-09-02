import { useLocation } from 'react-router-dom';

const PAGE_MAP: { pattern: RegExp; key: string; label: string }[] = [
  { pattern: /\/ingest\/artifacts/, key: 'ingest/artifacts', label: 'Upload Assets' },
  { pattern: /\/ingest\/parsing/, key: 'ingest/parsing', label: 'Parsing' },
  { pattern: /\/ingest\/mspec/, key: 'ingest/mspec', label: 'MSpec' },
  { pattern: /\/ingest\/?$/, key: 'ingest', label: 'Ingest' },
  { pattern: /\/target/, key: 'target', label: 'Target Model' },
  { pattern: /\/map/, key: 'map', label: 'Mapping' },
  { pattern: /\/convert/, key: 'convert', label: 'Convert' },
  { pattern: /\/deliver\/generate/, key: 'deliver/generate', label: 'Generate PBI' },
  { pattern: /\/deliver\/validate/, key: 'deliver/validate', label: 'Validate' },
  { pattern: /\/deliver\/results/, key: 'deliver/results', label: 'Results' },
  { pattern: /\/deliver/, key: 'deliver', label: 'Deliver' },
  { pattern: /\/overview/, key: 'overview', label: 'Overview' },
  { pattern: /^\/projects$/, key: 'projects', label: 'Projects' },
  { pattern: /^\/integrations/, key: 'integrations', label: 'Integrations' },
  { pattern: /^\/$/, key: 'dashboard', label: 'Dashboard' },
];

export function usePageContext() {
  const location = useLocation();
  const path = location.pathname;

  const projectMatch = path.match(/\/projects\/([^/]+)/);
  const projectId = projectMatch?.[1];

  const relativePath = projectId
    ? path.replace(`/projects/${projectId}`, '').replace(/^\//, '') || 'overview'
    : path.replace(/^\//, '') || 'dashboard';

  const matched = PAGE_MAP.find((p) => p.pattern.test(path));
  const pageKey = matched?.key ?? relativePath;
  const pageLabel = matched?.label ?? pageKey.replace(/\//g, ' › ');

  return {
    projectId,
    pagePath: projectId ? `projects/${projectId}/${relativePath}` : relativePath,
    pageKey,
    pageLabel,
    pathname: path,
  };
}
