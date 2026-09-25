import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, ChevronLeft, ChevronRight, Circle, Loader2, Lock, Play,
} from 'lucide-react';
import type { ConversionItem, ConversionWorkspace } from '../../types';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { cn } from '../../utils/cn';
import { StepAssetsPanel } from './StepAssetsPanel';
import { ConversionItemsTable } from './ConversionItemsTable';
import {
  WIZARD_STEP_ORDER,
  buildStepStatusLines,
  findFirstIncompleteIndex,
} from './conversionStepConfig';

interface ConversionWizardProps {
  projectId: string;
  workspace: ConversionWorkspace;
  items: ConversionItem[];
  itemsLoading?: boolean;
  onRunStep: (stepId: string) => void;
  isRunning: boolean;
  runningStepId: string | null;
  selectedItemId?: string | null;
  onSelectItem?: (item: ConversionItem) => void;
  initialStepId?: string | null;
  onStepChange?: (stepId: string) => void;
}

const STATUS_ICON = {
  complete: CheckCircle2,
  in_progress: Loader2,
  pending: Circle,
  blocked: Lock,
};

function StepProgressRail({ currentIndex }: { currentIndex: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {WIZARD_STEP_ORDER.map((meta, idx) => (
        <div
          key={meta.id}
          title={meta.shortLabel}
          className={cn(
            'h-1.5 rounded-full transition-all',
            idx === currentIndex ? 'w-10 bg-primary' : idx < currentIndex ? 'w-2 bg-success' : 'w-2 bg-gray-200',
          )}
        />
      ))}
    </div>
  );
}

export function ConversionWizard({
  projectId,
  workspace,
  items,
  itemsLoading,
  onRunStep,
  isRunning,
  runningStepId,
  selectedItemId,
  onSelectItem,
  initialStepId,
  onStepChange,
}: ConversionWizardProps) {
  const steps = workspace.conversion_steps;
  const [started, setStarted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!initialStepId) return;
    const idx = WIZARD_STEP_ORDER.findIndex((s) => s.id === initialStepId);
    if (idx >= 0) {
      setStarted(true);
      setActiveIndex(idx);
    }
  }, [initialStepId]);

  const setStepIndex = (index: number) => {
    setActiveIndex(index);
    const meta = WIZARD_STEP_ORDER[index];
    if (meta && onStepChange) onStepChange(meta.id);
  };

  const activeMeta = WIZARD_STEP_ORDER[activeIndex];
  const activeStep = steps.find((s) => s.id === activeMeta?.id);

  const statusLines = useMemo(
    () => buildStepStatusLines(activeStep, workspace, activeMeta),
    [activeStep, workspace, activeMeta],
  );

  const canGoPrev = activeIndex > 0;
  const isLast = activeIndex === WIZARD_STEP_ORDER.length - 1;
  const stepBlocked = activeStep?.status === 'blocked';
  const stepComplete = activeStep?.status === 'complete';
  const canGoNext = !!stepComplete;
  const stepRunning = isRunning && runningStepId === activeMeta?.id;
  const StepIcon = activeStep ? STATUS_ICON[activeStep.status] : CheckCircle2;

  const mapReady = workspace.mapping_stats
    && ((workspace.mapping_stats.approved ?? 0) + (workspace.mapping_stats.modified ?? 0)) > 0;
  const prerequisitesOk = workspace.has_mspec && workspace.has_target_model && mapReady;

  const handleStart = () => {
    setStarted(true);
    const idx = findFirstIncompleteIndex(steps);
    setStepIndex(idx);
  };

  const handleRun = () => {
    if (!started) {
      handleStart();
    }
    if (activeMeta?.executable && !stepBlocked) {
      onRunStep(activeMeta.id);
    }
  };

  if (!started) {
    return (
      <div className="text-center py-10 px-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Conversion pipeline</p>
        <h3 className="text-lg font-semibold text-dark mb-2">Convert BO → Power BI</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
          Four convert steps — Reports, Visuals, Measures, Filters. Complete each before advancing.
        </p>
        {!prerequisitesOk && (
          <div className="max-w-md mx-auto mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">
            <p className="font-medium mb-1">Prerequisites</p>
            <ul className="list-disc pl-4 space-y-1 text-amber-800">
              {!workspace.has_mspec && (
                <li>
                  <Link className="underline" to={`/projects/${projectId}/ingest/parsing`}>Complete Parsing</Link>
                </li>
              )}
              {!workspace.has_target_model && (
                <li>
                  <Link className="underline" to={`/projects/${projectId}/target`}>Select Target Model</Link>
                </li>
              )}
              {!mapReady && (
                <li>
                  <Link className="underline" to={`/projects/${projectId}/map`}>Complete Mapping</Link>
                </li>
              )}
            </ul>
          </div>
        )}
        {workspace.selected_target_model && (
          <p className="text-sm text-gray-500 mb-6">
            Target model: <strong>{workspace.selected_target_model.name}</strong>
          </p>
        )}
        <div className="flex items-center justify-center gap-3">
          <Button onClick={handleStart} disabled={!prerequisitesOk}>
            <Play size={14} /> Start conversion
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-4">
          {WIZARD_STEP_ORDER.length} steps · {workspace.overall_progress}% overall progress
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            'w-10 h-10 rounded-lg border flex items-center justify-center shrink-0',
            stepComplete ? 'border-success/40 bg-green-50' : 'border-primary/30 bg-blue-50',
          )}>
            <StepIcon
              size={20}
              className={cn(
                stepComplete && 'text-success',
                activeStep?.status === 'in_progress' && 'text-primary animate-spin',
                activeStep?.status === 'blocked' && 'text-gray-400',
                activeStep?.status === 'pending' && 'text-gray-400',
              )}
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-400">
              Step {activeIndex + 1} of {WIZARD_STEP_ORDER.length}
            </p>
            <h3 className="text-base font-semibold truncate">
              {activeStep?.label ?? activeMeta.shortLabel}
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {activeStep && <StatusBadge status={activeStep.status} />}
          {activeStep && (
            <span className="text-sm font-bold text-primary">{activeStep.progress_pct}%</span>
          )}
        </div>
      </div>

      <StepProgressRail currentIndex={activeIndex} />

      {activeStep && (
        <p className="text-sm text-gray-500">{activeStep.description}</p>
      )}

      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${activeStep?.progress_pct ?? 0}%` }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-surface/50 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Step status</p>
          <p className="text-xs text-gray-500 mb-2">
            Live agent thoughts stream in BI Loom Assistant while a step runs.
          </p>
          <ul className="space-y-2">
            {statusLines.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                {t.done ? (
                  <CheckCircle2 size={14} className="text-success shrink-0 mt-0.5" />
                ) : (
                  <Circle size={14} className="text-gray-300 shrink-0 mt-0.5" />
                )}
                {t.line}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Step assets</p>
          <StepAssetsPanel
            stepId={activeMeta.id}
            step={activeStep}
            workspace={workspace}
            items={items}
            selectedItemId={selectedItemId}
            onSelectItem={onSelectItem}
          />
        </div>
      </div>

      {activeStep && activeStep.items.length > 0 && (
        <div className="rounded-lg border border-border p-3 max-h-40 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-400 mb-2">Conversion detail</p>
          <div className="flex flex-wrap gap-2">
            {activeStep.items.slice(0, 12).map((it, i) => (
              <span key={i} className="text-[10px] font-mono bg-surface border border-border rounded px-2 py-1">
                {it.source && it.target
                  ? `${it.source} → ${it.target}`
                  : it.label
                    ? `${it.label}: ${it.value}`
                    : it.name
                      ? String(it.name)
                      : JSON.stringify(it).slice(0, 60)}
              </span>
            ))}
          </div>
        </div>
      )}

      {isLast && stepComplete && (
        <ConversionItemsTable
          items={items}
          loading={itemsLoading}
          selectedId={selectedItemId}
          onSelect={onSelectItem}
        />
      )}

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-border flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStepIndex(activeIndex - 1)}
          disabled={!canGoPrev}
        >
          <ChevronLeft size={14} /> Previous
        </Button>

        <span className="text-xs text-gray-400">
          {activeMeta.shortLabel} · {workspace.overall_progress}% total
        </span>

        <div className="flex items-center gap-2 flex-wrap">
          {stepBlocked && (
            <Link to={`/projects/${projectId}/map`}>
              <Button size="sm" variant="outline">
                Go to Mapping
              </Button>
            </Link>
          )}

          {activeMeta.executable && !stepBlocked && (
            <Button
              size="sm"
              onClick={handleRun}
              disabled={stepRunning}
            >
              {stepRunning ? (
                <><Loader2 size={14} className="animate-spin" /> Running…</>
              ) : stepComplete ? (
                <><CheckCircle2 size={14} /> Re-run step</>
              ) : (
                <><Play size={14} /> Run step</>
              )}
            </Button>
          )}

          {!isLast ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStepIndex(activeIndex + 1)}
              disabled={!canGoNext}
              title={!canGoNext ? 'Complete this step before continuing' : undefined}
            >
              Next <ChevronRight size={14} />
            </Button>
          ) : stepComplete ? (
            <Link to={`/projects/${projectId}/deliver/generate`}>
              <Button size="sm">
                Continue to Deliver <ChevronRight size={14} />
              </Button>
            </Link>
          ) : (
            <span className="text-xs text-gray-400">Complete Filters to unlock Deliver</span>
          )}
        </div>
      </div>
    </div>
  );
}
