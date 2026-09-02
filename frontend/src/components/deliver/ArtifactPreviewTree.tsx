import { useState } from 'react';
import { ChevronDown, ChevronRight, File, Folder, BarChart3, Database } from 'lucide-react';

interface PreviewReport {
  id: string;
  name: string;
  pages: { id: string; name: string; visuals: { id: string; name: string; type: string }[] }[];
}

interface PreviewSemanticModel {
  name?: string;
  tables?: { name: string; columns?: { name: string }[] }[];
}

interface ArtifactPreviewTreeProps {
  semanticModel?: PreviewSemanticModel | null;
  reports?: PreviewReport[];
  files?: { name: string; type?: string; size?: number }[];
}

export function ArtifactPreviewTree({ semanticModel, reports, files }: ArtifactPreviewTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ root: true, model: true });

  const toggle = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  const hasTree = semanticModel || (reports && reports.length > 0);

  if (!hasTree && (!files || files.length === 0)) {
    return <p className="text-sm text-gray-400 text-center py-6">Generate a package to preview output structure</p>;
  }

  return (
    <div className="text-sm font-mono">
      <TreeNode
        label="migration-package/"
        icon={<Folder size={14} className="text-warning" />}
        open={expanded.root}
        onToggle={() => toggle('root')}
      >
        {semanticModel && (
          <TreeNode
            label={`${semanticModel.name || 'semantic_model'}.SemanticModel/`}
            icon={<Database size={14} className="text-primary" />}
            open={expanded.model}
            onToggle={() => toggle('model')}
            depth={1}
          >
            {(semanticModel.tables ?? []).map((t) => (
              <div key={t.name} className="pl-6 py-0.5 text-gray-600 flex items-center gap-1.5">
                <File size={12} /> {t.name}
                {t.columns && <span className="text-gray-400">({t.columns.length} cols)</span>}
              </div>
            ))}
          </TreeNode>
        )}

        {(reports ?? []).map((report) => (
          <TreeNode
            key={report.id}
            label={`${report.name}.Report/`}
            icon={<BarChart3 size={14} className="text-primary" />}
            open={expanded[report.id]}
            onToggle={() => toggle(report.id)}
            depth={1}
          >
            {report.pages.map((page) => (
              <div key={page.id} className="pl-6">
                <div className="py-0.5 text-gray-600">{page.name}</div>
                {page.visuals.map((v) => (
                  <div key={v.id} className="pl-4 py-0.5 text-gray-400 text-xs">
                    ⬦ {v.name} ({v.type})
                  </div>
                ))}
              </div>
            ))}
          </TreeNode>
        ))}

        {(files ?? []).map((f) => (
          <div key={f.name} className="pl-4 py-0.5 text-gray-600 flex items-center gap-1.5">
            <File size={12} /> {f.name}
            {f.size != null && <span className="text-gray-400 text-xs">({formatSize(f.size)})</span>}
          </div>
        ))}
      </TreeNode>
    </div>
  );
}

function TreeNode({
  label, icon, open, onToggle, children, depth = 0,
}: {
  label: string;
  icon: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
  depth?: number;
}) {
  const hasChildren = Boolean(children);
  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <button
        type="button"
        className="flex items-center gap-1 py-0.5 hover:text-primary w-full text-left"
        onClick={hasChildren ? onToggle : undefined}
      >
        {hasChildren ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="w-3" />}
        {icon}
        <span>{label}</span>
      </button>
      {open && children}
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
