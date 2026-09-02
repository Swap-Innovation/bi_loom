interface TraceabilitySource {
  file?: string;
  path?: string;
  line?: number | string;
  document?: string;
  [key: string]: unknown;
}

interface TraceabilityBadgeProps {
  source?: TraceabilitySource | null;
  className?: string;
}

export function TraceabilityBadge({ source, className }: TraceabilityBadgeProps) {
  if (!source || (!source.file && !source.path && !source.document)) {
    return null;
  }

  const parts: string[] = [];
  if (source.file) parts.push(source.file);
  if (source.path) parts.push(source.path);
  if (source.document) parts.push(source.document);
  if (source.line !== undefined && source.line !== null) parts.push(`L${source.line}`);

  return (
    <div className={`inline-flex flex-wrap items-center gap-1 text-[10px] text-gray-500 ${className ?? ''}`}>
      <span className="uppercase tracking-wide font-semibold text-gray-400">Source</span>
      <span className="font-mono bg-surface px-1.5 py-0.5 rounded border border-border">
        {parts.join(' › ')}
      </span>
    </div>
  );
}

export function extractSource(item: unknown): TraceabilitySource | null {
  if (!item || typeof item !== 'object') return null;
  const data = item as Record<string, unknown>;
  const source = data.source as TraceabilitySource | undefined;
  if (source && typeof source === 'object') return source;
  if (data.file || data.path || data.line) {
    return { file: String(data.file ?? ''), path: String(data.path ?? ''), line: data.line as number | string };
  }
  return null;
}
