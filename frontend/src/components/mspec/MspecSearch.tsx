import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Card } from '../ui/Card';
import { SearchInput } from '../ui/SearchInput';
import { TraceabilityBadge, extractSource } from './TraceabilityBadge';

interface MspecSearchProps {
  projectId: string;
  search: string;
  onSearchChange: (value: string) => void;
  onSelectResult?: (section: string, item: unknown) => void;
}

export function MspecSearch({ projectId, search, onSearchChange, onSelectResult }: MspecSearchProps) {
  const { data: searchResults, isFetching } = useQuery({
    queryKey: ['mspec-search', projectId, search],
    queryFn: () => api.searchMspec(projectId, search),
    enabled: search.length >= 2,
  });

  return (
    <div className="space-y-3">
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder="Search MSpec fields, measures, queries… (min 2 chars)"
        className="max-w-lg"
      />

      {search.length >= 2 && (
        <Card title={isFetching ? 'Searching…' : `Search results (${searchResults?.count ?? 0})`}>
          {!searchResults?.count ? (
            <p className="text-sm text-gray-500 text-center py-4">No matches for &quot;{search}&quot;</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {searchResults.results.map((r, i) => {
                const item = r.item as Record<string, unknown>;
                const name = String(item.name ?? item.id ?? item.term ?? 'Item');
                return (
                  <button
                    key={i}
                    type="button"
                    className="w-full text-left text-xs p-2 bg-surface rounded border border-border hover:border-primary transition-colors"
                    onClick={() => onSelectResult?.(r.section, r.item)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-primary capitalize">{r.section}</span>
                      <span className="font-mono font-medium truncate">{name}</span>
                    </div>
                    <TraceabilityBadge source={extractSource(r.item)} />
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
