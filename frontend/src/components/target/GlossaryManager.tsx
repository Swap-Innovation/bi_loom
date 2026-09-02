import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';

interface GlossaryManagerProps {
  projectId: string;
}

export function GlossaryManager({ projectId }: GlossaryManagerProps) {
  const queryClient = useQueryClient();

  const { data: terms, isLoading } = useQuery({
    queryKey: ['glossary', projectId],
    queryFn: () => api.getGlossary(projectId),
    enabled: !!projectId,
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => api.importGlossary(projectId, file),
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} glossary terms`);
      queryClient.invalidateQueries({ queryKey: ['glossary', projectId] });
    },
    onError: () => toast.error('Glossary import failed'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <BookOpen size={18} className="text-primary" />
            Business Glossary
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Terms and synonyms improve AI mapping accuracy between BO fields and target model
          </p>
        </div>
        <label className="cursor-pointer">
          <input
            type="file"
            className="hidden"
            accept=".json"
            onChange={(e) => e.target.files?.[0] && importMutation.mutate(e.target.files[0])}
          />
          <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface cursor-pointer">
            <Upload size={14} /> Import JSON
          </span>
        </label>
      </div>

      {isLoading ? (
        <Card><p className="text-sm text-gray-400 text-center py-8">Loading glossary…</p></Card>
      ) : !terms?.length ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">
            No glossary terms yet. Import <code className="bg-surface px-1 rounded">sample-data/projects/fixed-telco-orders/target/glossary.json</code>
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {terms.map((term) => (
            <Card key={term.term} className="!p-4">
              <p className="font-semibold">{term.term}</p>
              {term.definition && <p className="text-sm text-gray-600 mt-1">{term.definition}</p>}
              {term.synonyms?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {term.synonyms.map((s) => (
                    <Badge key={s} variant="outline" size="sm">{s}</Badge>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
