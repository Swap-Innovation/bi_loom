import { useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GitCompare } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { SplitPane } from '../../components/ui/SplitPane';
import { DocumentHierarchy } from '../../components/parsing/DocumentHierarchy';
import { TargetAssetTree } from '../../components/conversion/TargetAssetTree';
import { ConversionWizard } from '../../components/convert/ConversionWizard';
import { BlockInspector } from '../../components/convert/BlockInspector';
import { LinkedSelectionBridge } from '../../components/convert/LinkedSelectionBridge';
import { useSelection } from '../../context/SelectionContext';
import { useWorkflow } from '../../hooks/useWorkflow';
import { CONVERT_SUB_STEPS } from '../../components/navigation/migrationFlow';
import { getStepMeta } from '../../components/convert/conversionStepConfig';
import { useAiActivity } from '../../context/AiActivityContext';
import { usePageContext } from '../../hooks/usePageContext';

import type { ConversionItem } from '../../types';

export function ConversionStudio() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const stepParam = searchParams.get('step') ?? CONVERT_SUB_STEPS[0].id;
  const queryClient = useQueryClient();
  const { data: workflow } = useWorkflow(projectId);
  const {
    sourceId, sourceType, selectSource, selectTarget, targetId,
    selectConversionItem, conversionItemId,
  } = useSelection();

  const [runningStepId, setRunningStepId] = useState<string | null>(null);
  const [showExplorer, setShowExplorer] = useState(false);
  const { pageKey } = usePageContext();
  const { startAgent, addAction, completeAgent, failAgent } = useAiActivity();
  const convertRunRef = useRef<string | null>(null);

  const mapPhase = workflow?.phases.find((p) => p.id === 'map');
  const targetPhase = workflow?.phases.find((p) => p.id === 'target');
  const mapComplete = mapPhase?.status === 'complete';
  const targetComplete = targetPhase?.status === 'complete';

  const { data: workspace, isLoading } = useQuery({
    queryKey: ['conversion', projectId],
    queryFn: () => api.getConversionWorkspace(projectId!),
    enabled: !!projectId,
    refetchInterval: 8000,
  });

  const { data: conversionItems, refetch: refetchItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['conversion-items', projectId],
    queryFn: () => api.listConversionItems(projectId!, { limit: 500 }),
    enabled: !!projectId && !!workspace?.has_mspec,
  });

  const runStep = useMutation({
    mutationFn: async (stepId: string) => {
      if (!workspace) throw new Error('Conversion workspace not loaded');
      const meta = getStepMeta(stepId) ?? {
        id: stepId,
        shortLabel: stepId,
        executable: true,
        itemStepFilter: null,
      };
      const runId = startAgent(
        'Convert Agent',
        `Running step: ${meta.shortLabel}`,
        pageKey,
      );
      convertRunRef.current = runId;
      addAction(runId, `Execute conversion API for “${meta.shortLabel}”…`, 'running');
      try {
        const data = await api.runConversion(projectId!, stepId);
        addAction(
          runId,
          `Wrote conversion items · created ${data.items_created} · updated ${data.items_updated}`,
          'complete',
        );
        completeAgent(
          runId,
          `${data.items_created} created · ${data.items_updated} updated`,
        );
        return data;
      } catch (err) {
        failAgent(runId, (err as Error).message);
        throw err;
      } finally {
        convertRunRef.current = null;
      }
    },
    onMutate: (stepId) => setRunningStepId(stepId),
    onSuccess: (data) => {
      const total = data.items_created + data.items_updated;
      toast.success(
        total > 0
          ? `Step complete: ${data.items_created} created, ${data.items_updated} updated`
          : 'Step finished — no new changes',
      );
      refetchItems();
      queryClient.invalidateQueries({ queryKey: ['conversion', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workflow', projectId] });
    },
    onError: (err: Error) => toast.error(err.message || 'Step execution failed'),
    onSettled: () => setRunningStepId(null),
  });

  const blockItems = useMemo(() => {
    if (!conversionItems?.items || sourceType !== 'block' || !sourceId) return [];
    return conversionItems.items.filter(
      (i) => i.source_id === sourceId || i.source_id?.startsWith(`${sourceId}:`),
    );
  }, [conversionItems, sourceId, sourceType]);

  const handleBlockSelect = (
    block: { id: string; type: string; title?: string; name?: string; status?: string; field_names?: string[] },
    ctx: { document: { id: string; name: string }; page: { name: string } },
  ) => {
    selectSource(block.id, 'block', {
      ...block,
      documentId: ctx.document.id,
      documentName: ctx.document.name,
      pageName: ctx.page.name,
    });
    const item = conversionItems?.items.find((i) => i.source_type === 'block' && i.source_id === block.id);
    if (item) selectConversionItem(item.id, item);
  };

  const handleItemSelect = (item: ConversionItem) => {
    selectConversionItem(item.id, item);
    if (item.source_type === 'block') {
      selectSource(item.source_id, 'block', item);
    } else if (item.source_id.includes(':')) {
      const blockId = item.source_id.split(':')[0];
      selectSource(blockId, 'block', item);
    }
  };

  if (isLoading) return <SkeletonCard />;

  if (!workspace?.has_mspec) {
    return (
      <Card>
        <EmptyState
          title="MSpec required"
          description="Parse BO artifacts before starting conversion."
          action={<Link to={`/projects/${projectId}/ingest/parsing`}><Button>Go to Parsing</Button></Link>}
        />
      </Card>
    );
  }

  if (!targetComplete || !workspace.has_target_model) {
    return (
      <Card>
        <EmptyState
          icon={GitCompare}
          title="Target model required"
          description="Select an active Pluto semantic model before Convert. Mapping and Convert stay locked until Target is complete."
          action={<Link to={`/projects/${projectId}/target`}><Button>Go to Target Model</Button></Link>}
        />
      </Card>
    );
  }

  if (!mapComplete) {
    return (
      <Card>
        <EmptyState
          icon={GitCompare}
          title="Complete mapping review first"
          description={
            mapPhase?.blockers?.[0]
              ?? 'Approve or reject all pending mappings before running conversion.'
          }
          action={<Link to={`/projects/${projectId}/map`}><Button>Go to Mapping</Button></Link>}
        />
      </Card>
    );
  }

  const sourceTree = workspace.source_tree;
  const targetTree = workspace.target_tree;
  const items = conversionItems?.items ?? [];

  return (
    <div className="space-y-4">
      <LinkedSelectionBridge
        items={items}
        documents={sourceTree?.documents ?? []}
        reports={targetTree?.reports ?? []}
      />

      <div>
        <h2 className="text-title">Conversion Studio</h2>
        <p className="text-caption mt-1">
          One pipeline step at a time — run, review, then move forward manually
        </p>
      </div>

      <div className="bg-white rounded-lg border border-border p-4 md:p-6">
        <ConversionWizard
          projectId={projectId!}
          workspace={workspace}
          items={items}
          itemsLoading={itemsLoading}
          onRunStep={(stepId) => runStep.mutate(stepId)}
          isRunning={runStep.isPending}
          runningStepId={runningStepId}
          selectedItemId={conversionItemId}
          onSelectItem={handleItemSelect}
          initialStepId={stepParam}
          onStepChange={(stepId) => setSearchParams({ step: stepId }, { replace: true })}
        />
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setShowExplorer((v) => !v)}>
          {showExplorer ? 'Hide' : 'Show'} source/target explorer
        </Button>
      </div>

      {showExplorer && (
        <div className="h-[480px]">
          <SplitPane
            defaultSizes={[28, 34, 38]}
            left={
              sourceTree ? (
                <DocumentHierarchy
                  folders={sourceTree.folders}
                  documents={sourceTree.documents}
                  compact
                  selectedBlockId={sourceType === 'block' ? sourceId : null}
                  onSelectBlock={handleBlockSelect}
                />
              ) : <p className="text-sm text-gray-400 p-4">No source tree</p>
            }
            center={
              <BlockInspector
                projectId={projectId!}
                blockItems={blockItems}
                onUpdated={() => refetchItems()}
              />
            }
            right={
              workspace.has_target_model && targetTree ? (
                <TargetAssetTree
                  semanticModel={targetTree.semantic_model}
                  reports={targetTree.reports}
                  summary={targetTree.summary}
                  selectedId={targetId}
                  onSelect={(id, type, data) => selectTarget(id, type, data)}
                />
              ) : (
                <p className="text-sm text-gray-400 p-4">Select a target model first.</p>
              )
            }
          />
        </div>
      )}
    </div>
  );
}
