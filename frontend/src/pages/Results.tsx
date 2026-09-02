import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, CloudOff, Package } from 'lucide-react';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { Card, StatCard } from '../components/ui/Card';
import { ArtifactPreviewTree } from '../components/deliver/ArtifactPreviewTree';
import { EmptyState } from '../components/ui/EmptyState';

export function ResultsPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: results, isLoading } = useQuery({
    queryKey: ['results', projectId],
    queryFn: () => api.getResults(projectId!),
    enabled: !!projectId,
  });

  const { data: genStatus } = useQuery({
    queryKey: ['generation-status', projectId],
    queryFn: () => api.getGenerationStatus(projectId!),
    enabled: !!projectId,
  });

  const { data: validation } = useQuery({
    queryKey: ['validation', projectId],
    queryFn: () => api.getValidation(projectId!),
    enabled: !!projectId,
  });

  if (isLoading) return <div className="text-gray-500">Loading results...</div>;

  const packageReady = genStatus?.status === 'COMPLETED';
  const validated = validation?.status === 'COMPLETED';

  if (!results && !packageReady) {
    return (
      <Card>
        <EmptyState
          icon={Package}
          title="No results yet"
          description="Generate a Power BI package and run validation to see scores and downloads."
          action={
            <Link to={`/projects/${projectId}/deliver/generate`}>
              <Button>Go to Generate</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const previewTree = genStatus?.artifact_tree;
  const score = results?.migration_score ?? validation?.migration_score ?? null;

  return (
    <div>
      <h2 className="text-xl font-bold mb-2">Migration Results</h2>
      <p className="text-gray-500 mb-6">
        {validated || results?.status === 'COMPLETED'
          ? 'Migration Complete'
          : `Status: ${results?.status ?? 'Generated — validate to finish'}`}
      </p>

      {score !== null && score !== undefined && (
        <div className="mb-6 p-6 bg-white rounded-xl border border-border text-center">
          <p className="text-sm text-gray-500">Migration Score</p>
          <p className="text-5xl font-bold text-primary">{score}%</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Reports Generated" value={results?.reports_generated ?? 0} />
        <StatCard label="Needs Review" value={results?.reports_requiring_review ?? 0} />
        <StatCard label="Unsupported Items" value={results?.unsupported_items ?? 0} />
        <StatCard label="Manual Actions" value={results?.manual_actions ?? 0} />
      </div>

      {results?.mapping_coverage != null && (
        <Card title="Confidence Breakdown" className="mb-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-success">{results.high_confidence_pct}%</p>
              <p className="text-sm text-gray-500">High Confidence</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-warning">{results.medium_confidence_pct}%</p>
              <p className="text-sm text-gray-500">Medium Confidence</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-error">{results.low_confidence_pct}%</p>
              <p className="text-sm text-gray-500">Low Confidence</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-4 text-center">
            Mapping Coverage: {results.mapping_coverage}%
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card title="Generated PBI structure">
          <ArtifactPreviewTree
            semanticModel={previewTree?.semantic_model as { name?: string; tables?: { name: string; columns?: { name: string }[] }[] } | undefined}
            reports={previewTree?.reports}
            files={genStatus?.files}
          />
        </Card>

        <Card title="Downloads">
          <div className="space-y-3">
            {packageReady ? (
              <a href={api.downloadPackage(projectId!)} download>
                <Button variant="outline" className="w-full justify-center">
                  <Download size={16} /> Download Power BI Package
                </Button>
              </a>
            ) : (
              <p className="text-sm text-gray-500">Generate a package to enable download.</p>
            )}
            {(results?.downloads ?? []).map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm">{d.filename}</span>
                <span className="text-xs text-gray-400 uppercase">{d.type}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Publish to Fabric">
        <div className="flex items-center gap-3 text-gray-400">
          <CloudOff size={20} />
          <div>
            <p className="text-sm font-medium">Connect to Microsoft Fabric</p>
            <p className="text-xs">Coming soon — publish generated reports directly to your workspace</p>
          </div>
          <Button size="sm" disabled className="ml-auto">Connect</Button>
        </div>
      </Card>
    </div>
  );
}
