import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, BarChart3 } from 'lucide-react';
import type { HierarchyDocument } from '../parsing/DocumentHierarchy';

export interface SourceField {
  id: string;
  name: string;
  type: 'field' | 'measure';
  document: string;
  page?: string;
  block?: string;
}

interface SourceFieldTreeProps {
  documents: HierarchyDocument[];
  folders?: { id: string; name: string }[];
  selectedFieldName?: string | null;
  onSelectField: (field: SourceField) => void;
}

export function SourceFieldTree({ documents, folders, selectedFieldName, onSelectField }: SourceFieldTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(documents.map((d) => [`doc-${d.id}`, true])),
  );

  const fieldsByDoc = useMemo(() => {
    const map = new Map<string, SourceField[]>();
    for (const doc of documents) {
      const fields: SourceField[] = [];
      for (const page of doc.pages ?? []) {
        for (const block of page.blocks ?? []) {
          for (const fname of block.field_names ?? []) {
            fields.push({
              id: `${doc.id}:${page.id}:${block.id}:${fname}`,
              name: fname,
              type: 'field',
              document: doc.name,
              page: page.name,
              block: block.name || block.type,
            });
          }
        }
      }
      for (const m of (doc as HierarchyDocument & { measures?: string[] }).measures ?? []) {
        const name = typeof m === 'string' ? m : String(m);
        fields.push({
          id: `${doc.id}:measure:${name}`,
          name,
          type: 'measure',
          document: doc.name,
        });
      }
      map.set(doc.id, fields);
    }
    return map;
  }, [documents]);

  const toggle = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  return (
    <div className="border border-border rounded-lg bg-white overflow-hidden h-full flex flex-col">
      <div className="px-3 py-2 bg-surface border-b border-border shrink-0">
        <p className="text-xs font-semibold">Source BO Fields</p>
        <p className="text-[10px] text-gray-400">Click a field to highlight its mapping</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2 text-sm">
        {folders && folders.length > 0 && (
          <div className="mb-2">
            {folders.map((f) => (
              <div key={f.id} className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500">
                <Folder size={12} /> {f.name}
              </div>
            ))}
          </div>
        )}
        {documents.map((doc) => {
          const key = `doc-${doc.id}`;
          const fields = fieldsByDoc.get(doc.id) ?? [];
          const isOpen = expanded[key] ?? true;
          return (
            <div key={doc.id} className="mb-1">
              <button
                type="button"
                className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-surface rounded text-left"
                onClick={() => toggle(key)}
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <FileText size={14} className="text-primary shrink-0" />
                <span className="font-medium truncate text-xs">{doc.name}</span>
                <span className="text-gray-400 text-[10px] ml-auto">{fields.length}</span>
              </button>
              {isOpen && (
                <ul className="pl-6 space-y-0.5">
                  {fields.map((field) => {
                    const selected = selectedFieldName?.toUpperCase() === field.name.toUpperCase();
                    return (
                      <li key={field.id}>
                        <button
                          type="button"
                          className={`w-full text-left px-2 py-1 rounded text-xs font-mono flex items-center gap-1.5 ${
                            selected ? 'bg-blue-50 text-primary font-semibold' : 'hover:bg-surface text-gray-700'
                          }`}
                          onClick={() => onSelectField(field)}
                        >
                          {field.type === 'measure' ? <BarChart3 size={11} /> : <span className="text-gray-300">⬦</span>}
                          <span className="truncate">{field.name}</span>
                        </button>
                      </li>
                    );
                  })}
                  {!fields.length && <li className="text-[10px] text-gray-400 px-2">No fields extracted</li>}
                </ul>
              )}
            </div>
          );
        })}
        {!documents.length && (
          <p className="text-xs text-gray-400 text-center py-6">Parse BO export to see source fields</p>
        )}
      </div>
    </div>
  );
}

export function extractDocumentsFromWorkspace(workspace: {
  source_tree?: { documents?: HierarchyDocument[]; folders?: { id: string; name: string }[] } | null;
} | null | undefined) {
  return {
    documents: workspace?.source_tree?.documents ?? [],
    folders: workspace?.source_tree?.folders ?? [],
  };
}
