/** Simple view: 5 grouped stages mapping to the 12 expert categories. */
export const SIMPLE_PARSE_GROUPS = [
  {
    id: 'discovery',
    label: 'Discovery & Documents',
    description: 'Folders, documents, and product types',
    categoryIds: ['platform_organization', 'report_document'] as string[],
  },
  {
    id: 'data',
    label: 'Data & Semantics',
    description: 'Connections, universes, queries, and SQL',
    categoryIds: ['data_connectivity', 'semantic_layer', 'queries'] as string[],
  },
  {
    id: 'logic',
    label: 'Business Logic',
    description: 'Variables, calculations, and filters',
    categoryIds: ['variables', 'calculations', 'filters'] as string[],
  },
  {
    id: 'presentation',
    label: 'Layout & Visuals',
    description: 'Pages, blocks, charts, and formatting',
    categoryIds: ['layout', 'visuals', 'formatting'] as string[],
  },
  {
    id: 'output',
    label: 'Interactivity & MSpec',
    description: 'Drill paths, links, and migration spec',
    categoryIds: ['interactivity', 'mspec'] as string[],
  },
] ;

export interface ParseSection {
  id: string;
  label: string;
  description?: string;
  completed_steps?: string[];
  status?: string;
  count?: number;
  items?: { name: string; type: string; [key: string]: unknown }[];
}

export interface SimpleParseGroup {
  id: string;
  label: string;
  description: string;
  categoryIds: string[];
  sections: ParseSection[];
  status: 'completed' | 'running' | 'pending';
  count: number;
  completed_steps: string[];
}

export function groupSectionsForSimpleView(sections: ParseSection[]): SimpleParseGroup[] {
  return SIMPLE_PARSE_GROUPS.map((group) => {
    const matched = sections.filter((s) => group.categoryIds.includes(s.id));
    const allDone = matched.length > 0 && matched.every((s) => s.status === 'completed');
    const anyRunning = matched.some((s) => s.status === 'running');
    return {
      ...group,
      sections: matched,
      status: allDone ? 'completed' : anyRunning ? 'running' : 'pending',
      count: matched.reduce((sum, s) => sum + (s.count ?? 0), 0),
      completed_steps: matched.flatMap((s) => s.completed_steps ?? []),
    };
  });
}
