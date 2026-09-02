import {
  Folder, FileText, Layout, BarChart3, ChevronRight, ChevronDown,
  Database, Grid3x3, LineChart,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../../utils/cn';

const PRODUCT_COLORS: Record<string, string> = {
  webi: 'bg-blue-50 text-blue-700 border-blue-200',
  crystal: 'bg-violet-50 text-violet-700 border-violet-200',
  dashboard: 'bg-amber-50 text-amber-800 border-amber-200',
  analysis: 'bg-teal-50 text-teal-700 border-teal-200',
};

const PRODUCT_ICONS: Record<string, React.ElementType> = {
  webi: FileText,
  crystal: Database,
  dashboard: Grid3x3,
  analysis: LineChart,
};

const PAGE_TYPE_LABELS: Record<string, string> = {
  tab: 'Tab',
  section: 'Section',
  canvas: 'Canvas',
  view: 'View',
};

interface HierarchyBlock {
  id: string;
  type: string;
  title?: string;
  name?: string;
  status?: string;
  field_names?: string[];
}

interface HierarchyPage {
  id: string;
  name: string;
  type: string;
  blocks: HierarchyBlock[];
}

export interface HierarchyDocument {
  id: string;
  name: string;
  product_type: string;
  product_label: string;
  folder?: string;
  pages: HierarchyPage[];
  measures?: string[];
  page_count: number;
  block_count: number;
  visual_count: number;
}

interface HierarchyFolder {
  id: string;
  name: string;
  path?: string;
}

interface DocumentHierarchyProps {
  folders: HierarchyFolder[];
  documents: HierarchyDocument[];
  summary?: {
    folders?: number;
    documents?: number;
    pages?: number;
    blocks?: number;
    product_types?: Record<string, number>;
  };
  compact?: boolean;
  selectedBlockId?: string | null;
  onSelectBlock?: (block: HierarchyBlock, context: { document: HierarchyDocument; page: HierarchyPage }) => void;
  /** Optional action shown in the panel header (e.g. View MSpec) */
  headerAction?: React.ReactNode;
}

export function DocumentHierarchy({
  folders, documents, summary, compact, selectedBlockId, onSelectBlock, headerAction,
}: DocumentHierarchyProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    folders.forEach((f) => { init[`folder-${f.id}`] = true; });
    documents.forEach((d) => { init[`doc-${d.id}`] = true; });
    return init;
  });

  const toggle = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  const docsByFolder = (folderId: string | undefined) =>
    documents.filter((d) => {
      const folder = folders.find((f) => f.name === d.folder);
      return folder?.id === folderId || (!folderId && !d.folder);
    });

  const ungrouped = documents.filter((d) => !d.folder);

  const metrics = useMemo(() => ([
    { label: 'Folders', value: summary?.folders ?? folders.length },
    { label: 'Documents', value: summary?.documents ?? documents.length },
    { label: 'Pages', value: summary?.pages ?? documents.reduce((a, d) => a + d.page_count, 0) },
    { label: 'Blocks', value: summary?.blocks ?? documents.reduce((a, d) => a + d.block_count, 0) },
  ]), [summary, folders.length, documents]);

  if (compact) {
    return (
      <div className="h-full overflow-y-auto p-1">
        {folders.map((folder) => (
          <div key={folder.id}>
            <TreeRow
              depth={0}
              expanded={expanded[`folder-${folder.id}`]}
              onToggle={() => toggle(`folder-${folder.id}`)}
              icon={<Folder size={14} className="text-amber-600" />}
              label={folder.name}
              meta={`${docsByFolder(folder.id).length}`}
            />
            {expanded[`folder-${folder.id}`] && docsByFolder(folder.id).map((doc) => (
              <DocumentNode
                key={doc.id} doc={doc} expanded={expanded} toggle={toggle} depth={1}
                selectedBlockId={selectedBlockId} onSelectBlock={onSelectBlock}
              />
            ))}
          </div>
        ))}
        {ungrouped.map((doc) => (
          <DocumentNode
            key={doc.id} doc={doc} expanded={expanded} toggle={toggle} depth={0}
            selectedBlockId={selectedBlockId} onSelectBlock={onSelectBlock}
          />
        ))}
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-dark">Content inventory</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Parsed Business Objects structure — folder, document, page, and block
          </p>
        </div>
        {headerAction}
      </div>

      {/* Metrics strip */}
      {summary && (
        <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-4 sm:divide-y-0">
          {metrics.map((m) => (
            <div key={m.label} className="px-5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{m.label}</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-dark">{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Product mix */}
      {summary?.product_types && Object.keys(summary.product_types).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Product types
          </span>
          {Object.entries(summary.product_types).map(([type, count]) => (
            <span
              key={type}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
                PRODUCT_COLORS[type] || 'border-border bg-surface text-gray-600',
              )}
            >
              {type.toUpperCase()}
              <span className="tabular-nums opacity-70">{count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Tree */}
      <div className="max-h-[28rem] overflow-y-auto px-2 py-2">
        {folders.length === 0 && ungrouped.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-gray-400">No hierarchy nodes yet</p>
        )}

        {folders.map((folder) => (
          <div key={folder.id}>
            <TreeRow
              depth={0}
              expanded={expanded[`folder-${folder.id}`]}
              onToggle={() => toggle(`folder-${folder.id}`)}
              icon={<Folder size={15} className="text-amber-600" strokeWidth={1.75} />}
              label={folder.name}
              subtitle={folder.path && folder.path !== folder.name ? folder.path : undefined}
              meta={`${docsByFolder(folder.id).length} docs`}
            />
            {expanded[`folder-${folder.id}`] && docsByFolder(folder.id).map((doc) => (
              <DocumentNode
                key={doc.id} doc={doc} expanded={expanded} toggle={toggle} depth={1}
                selectedBlockId={selectedBlockId} onSelectBlock={onSelectBlock}
              />
            ))}
          </div>
        ))}

        {ungrouped.map((doc) => (
          <DocumentNode
            key={doc.id} doc={doc} expanded={expanded} toggle={toggle} depth={0}
            selectedBlockId={selectedBlockId} onSelectBlock={onSelectBlock}
          />
        ))}
      </div>
    </section>
  );
}

function TreeRow({
  depth,
  expanded,
  onToggle,
  icon,
  label,
  subtitle,
  badge,
  meta,
  active,
  leaf,
}: {
  depth: number;
  expanded?: boolean;
  onToggle?: () => void;
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  badge?: React.ReactNode;
  meta?: string;
  active?: boolean;
  leaf?: boolean;
}) {
  const Comp = onToggle ? 'button' : 'div';
  return (
    <Comp
      type={onToggle ? 'button' : undefined}
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors',
        onToggle && 'hover:bg-gray-50',
        active && 'bg-gray-100 font-medium text-dark',
        !active && 'text-gray-700',
      )}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-gray-400">
        {leaf ? <span className="w-3.5" /> : expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </span>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 truncate font-medium">{label}</span>
      {badge}
      {subtitle && (
        <span className="hidden max-w-[30%] truncate text-[11px] text-gray-400 sm:inline">{subtitle}</span>
      )}
      {meta && (
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-gray-400">{meta}</span>
      )}
    </Comp>
  );
}

function DocumentNode({
  doc, expanded, toggle, depth, selectedBlockId, onSelectBlock,
}: {
  doc: HierarchyDocument;
  expanded: Record<string, boolean>;
  toggle: (k: string) => void;
  depth: number;
  selectedBlockId?: string | null;
  onSelectBlock?: (block: HierarchyBlock, context: { document: HierarchyDocument; page: HierarchyPage }) => void;
}) {
  const Icon = PRODUCT_ICONS[doc.product_type] || FileText;

  return (
    <div>
      <TreeRow
        depth={depth}
        expanded={expanded[`doc-${doc.id}`]}
        onToggle={() => toggle(`doc-${doc.id}`)}
        icon={<Icon size={14} className="text-gray-500" strokeWidth={1.75} />}
        label={doc.name}
        badge={(
          <span
            className={cn(
              'shrink-0 rounded border px-1.5 py-px text-[10px] font-medium',
              PRODUCT_COLORS[doc.product_type] || 'border-border text-gray-500',
            )}
          >
            {doc.product_label}
          </span>
        )}
        meta={`${doc.page_count}p · ${doc.block_count}b`}
      />

      {expanded[`doc-${doc.id}`] && doc.pages.map((page) => (
        <div key={page.id}>
          <TreeRow
            depth={depth + 1}
            expanded={expanded[`page-${page.id}`]}
            onToggle={() => toggle(`page-${page.id}`)}
            icon={<Layout size={13} className="text-gray-400" strokeWidth={1.75} />}
            label={page.name}
            subtitle={PAGE_TYPE_LABELS[page.type] || page.type}
            meta={`${page.blocks.length}`}
          />

          {expanded[`page-${page.id}`] && page.blocks.map((block) => (
            <button
              key={block.id}
              type="button"
              onClick={() => onSelectBlock?.(block, { document: doc, page })}
              className={cn(
                'flex w-full items-center gap-2 rounded-md py-1 pr-2 text-left text-xs transition-colors hover:bg-gray-50',
                selectedBlockId === block.id ? 'bg-gray-100 font-medium text-dark' : 'text-gray-600',
              )}
              style={{ paddingLeft: `${8 + (depth + 2) * 16 + 20}px` }}
            >
              <BarChart3 size={12} className="shrink-0 text-gray-400" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate">{block.title || block.name || block.type}</span>
              <span className="shrink-0 rounded border border-border px-1.5 py-px text-[10px] text-gray-500">
                {block.type}
              </span>
              {block.status === 'UNSUPPORTED' && (
                <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] text-amber-800">
                  unsupported
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
