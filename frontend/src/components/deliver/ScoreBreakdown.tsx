import { Link } from 'react-router-dom';

interface Breakdown {
  mapping_coverage?: number;
  avg_confidence?: number;
  report_coverage?: number;
  visual_coverage?: number;
  structural_score?: number;
  visual_score?: number;
  data_score?: number;
  weights?: Record<string, number>;
}

interface ScoreBreakdownProps {
  score: number;
  breakdown: Breakdown | null | undefined;
  projectId: string;
  issues?: {
    unmapped?: number;
    unsupported?: number;
    manual_actions?: number;
  };
}

const DEFAULT_WEIGHTS: Record<string, number> = {
  mapping_coverage: 40,
  structural_score: 20,
  visual_score: 10,
  data_score: 20,
};

export function ScoreBreakdown({ score, breakdown, projectId, issues }: ScoreBreakdownProps) {
  const weights = breakdown?.weights ?? DEFAULT_WEIGHTS;
  const structural = breakdown?.structural_score ?? breakdown?.report_coverage ?? 0;
  const visual = breakdown?.visual_score ?? breakdown?.visual_coverage ?? 0;
  const data = breakdown?.data_score ?? breakdown?.avg_confidence ?? 0;
  const segments = [
    {
      key: 'mapping_coverage',
      label: 'Mapping coverage',
      value: breakdown?.mapping_coverage ?? 0,
      weight: weights.mapping_coverage ?? 40,
    },
    {
      key: 'structural_score',
      label: 'Structural / reports',
      value: structural,
      weight: weights.structural_score ?? 20,
    },
    {
      key: 'visual_score',
      label: 'Visual coverage',
      value: visual,
      weight: weights.visual_score ?? 10,
    },
    {
      key: 'data_score',
      label: 'Mapping confidence',
      value: data,
      weight: weights.data_score ?? 20,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-gray-500 mb-1">Overall Migration Score</p>
        <p className="text-5xl font-bold text-primary">{score}%</p>
      </div>

      <div className="space-y-3">
        <p className="text-caption uppercase">Score breakdown</p>
        {segments.map((s) => (
          <div key={s.key}>
            <div className="flex justify-between text-xs mb-1">
              <span>{s.label} <span className="text-gray-400">({s.weight}% weight)</span></span>
              <span className="font-mono">{s.value}%</span>
            </div>
            <div className="h-2 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(s.value, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {(issues?.unmapped || issues?.unsupported || issues?.manual_actions) ? (
        <div className="border-t border-border pt-4 space-y-2 text-sm">
          <p className="text-caption uppercase">Drill-down</p>
          {issues.unmapped ? (
            <Link to={`/projects/${projectId}/map?unmapped_only=true`} className="text-primary hover:underline block">
              {issues.unmapped} unmapped fields → Review in Mapping
            </Link>
          ) : null}
          {issues.unsupported ? (
            <Link to={`/projects/${projectId}/convert`} className="text-primary hover:underline block">
              {issues.unsupported} unsupported visuals → Review in Conversion
            </Link>
          ) : null}
          {issues.manual_actions ? (
            <p className="text-gray-600">{issues.manual_actions} manual actions required</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
