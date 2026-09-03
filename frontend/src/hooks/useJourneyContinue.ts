import { useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { useWorkflow } from './useWorkflow';
import { useIngestFlow } from './useIngestFlow';
import { CONVERT_SUB_STEPS } from '../components/navigation/migrationFlow';

export interface JourneyContinue {
  label: string;
  route: string;
  /** True only when the *current* page/step process is complete */
  enabled: boolean;
  disabledReason?: string;
}

type StepId =
  | 'overview'
  | 'upload'
  | 'parsing'
  | 'mspec'
  | 'target'
  | 'map'
  | 'convert'
  | 'generate'
  | 'validate'
  | 'results';

function resolveStepId(pathname: string): StepId {
  if (/\/ingest\/artifacts/.test(pathname)) return 'upload';
  if (/\/ingest\/parsing/.test(pathname)) return 'parsing';
  if (/\/ingest\/mspec/.test(pathname)) return 'mspec';
  if (/\/ingest\/?$/.test(pathname)) return 'upload';
  if (/\/target/.test(pathname)) return 'target';
  if (/\/map/.test(pathname)) return 'map';
  if (/\/convert/.test(pathname)) return 'convert';
  if (/\/deliver\/generate/.test(pathname)) return 'generate';
  if (/\/deliver\/validate/.test(pathname)) return 'validate';
  if (/\/deliver\/results/.test(pathname)) return 'results';
  if (/\/deliver\/?$/.test(pathname)) return 'generate';
  if (/\/overview/.test(pathname)) return 'overview';
  return 'overview';
}

/**
 * Header CTA: always the *next* step after the current page.
 * Disabled until the current page's process is complete.
 */
export function useJourneyContinue(projectId: string | undefined): JourneyContinue | null {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { data: workflow } = useWorkflow(projectId);
  const { data: ingestFlow } = useIngestFlow(projectId);

  const { data: workspace } = useQuery({
    queryKey: ['conversion', projectId],
    queryFn: () => api.getConversionWorkspace(projectId!),
    enabled: !!projectId && /\/convert/.test(location.pathname),
    staleTime: 5000,
  });

  return useMemo(() => {
    if (!projectId || !workflow) return null;

    const base = `/projects/${projectId}`;
    const convertStepParam = searchParams.get('step');
    const stepId = resolveStepId(location.pathname);
    const summary = workflow.summary;
    const phase = (id: string) => workflow.phases.find((p) => p.id === id);

    const ingestSteps = ingestFlow?.steps ?? [];
    const uploadStep = ingestSteps.find((s) => s.id === 'upload');
    const parsingStep = ingestSteps.find((s) => s.id === 'parsing');
    const mspecStep = ingestSteps.find((s) => s.id === 'mspec');
    const checklistReady = Boolean(ingestFlow?.checklist?.ready);
    const uploadDone = uploadStep?.status === 'complete' || summary.artifacts > 0;
    const parseComplete = parsingStep?.status === 'complete' || ingestFlow?.parse_status === 'COMPLETED';
    const mspecDone = mspecStep?.status === 'complete' && !ingestFlow?.mspec_pending;
    const targetDone = phase('target')?.status === 'complete';
    const mapDone = phase('map')?.status === 'complete';
    const convertDone = phase('convert')?.status === 'complete' || Boolean(summary.convert_complete);
    const generated = Boolean(summary.generated);
    const validated = Boolean(summary.validated);

    const convertDoneSet = new Set(summary.convert_steps_done ?? []);
    // Also infer from workspace steps when on convert
    if (workspace?.conversion_steps) {
      for (const s of workspace.conversion_steps) {
        if (CONVERT_SUB_STEPS.some((c) => c.id === s.id) && s.status === 'complete') {
          convertDoneSet.add(s.id);
        }
      }
    }

    switch (stepId) {
      case 'overview':
        return {
          label: 'Continue to Upload',
          route: `${base}/ingest/artifacts`,
          enabled: true,
        };

      case 'upload':
        return {
          label: 'Continue to Parsing',
          route: `${base}/ingest/parsing`,
          enabled: Boolean(uploadDone && checklistReady),
          disabledReason: checklistReady
            ? undefined
            : 'Upload a BO export and finish the pre-parse checklist first',
        };

      case 'parsing':
        return {
          label: mspecStep?.action === 'view' ? 'Continue to MSpec' : 'Continue to Generate MSpec',
          route: `${base}/ingest/mspec`,
          enabled: Boolean(parseComplete),
          disabledReason: parseComplete ? undefined : 'Finish parsing before continuing',
        };

      case 'mspec':
        return {
          label: 'Continue to Target Model',
          route: `${base}/target`,
          enabled: Boolean(mspecDone || (summary.has_mspec && !ingestFlow?.mspec_pending)),
          disabledReason:
            mspecDone || (summary.has_mspec && !ingestFlow?.mspec_pending)
              ? undefined
              : 'Generate MSpec from the parse draft first',
        };

      case 'target':
        return {
          label: 'Continue to Mapping',
          route: `${base}/map`,
          enabled: Boolean(targetDone),
          disabledReason: targetDone ? undefined : 'Select an active target model first',
        };

      case 'map':
        return {
          label: 'Continue to Convert',
          route: `${base}/convert`,
          enabled: Boolean(mapDone),
          disabledReason: mapDone
            ? undefined
            : 'Complete mapping review (approve/reject with targets) first',
        };

      case 'convert': {
        const ordered = CONVERT_SUB_STEPS.map((s) => s.id);
        const currentIdx = convertStepParam
          ? ordered.indexOf(convertStepParam as typeof ordered[number])
          : 0;
        const idx = currentIdx >= 0 ? currentIdx : 0;
        const currentStepId = ordered[idx];
        const currentComplete = convertDoneSet.has(currentStepId) || convertDone;

        // Find next incomplete convert step after current
        let nextIdx = -1;
        for (let i = idx + 1; i < ordered.length; i++) {
          if (!convertDoneSet.has(ordered[i])) {
            nextIdx = i;
            break;
          }
        }

        if (convertDone || nextIdx < 0) {
          // All convert steps done (or past last) → Deliver
          return {
            label: 'Continue to Deliver',
            route: `${base}/deliver/generate`,
            enabled: Boolean(convertDone),
            disabledReason: convertDone
              ? undefined
              : `Complete ${CONVERT_SUB_STEPS[idx]?.label ?? 'this convert step'} first`,
          };
        }

        const next = CONVERT_SUB_STEPS[nextIdx];
        return {
          label: `Continue to ${next.shortLabel}`,
          route: `${base}/convert?step=${next.id}`,
          enabled: Boolean(currentComplete),
          disabledReason: currentComplete
            ? undefined
            : `Complete ${CONVERT_SUB_STEPS[idx]?.label ?? 'this step'} first`,
        };
      }

      case 'generate':
        return {
          label: 'Continue to Validate',
          route: `${base}/deliver/validate`,
          enabled: Boolean(generated),
          disabledReason: generated ? undefined : 'Generate the Power BI package first',
        };

      case 'validate':
        return {
          label: 'Continue to Results',
          route: `${base}/deliver/results`,
          enabled: Boolean(validated),
          disabledReason: validated ? undefined : 'Run validation first',
        };

      case 'results':
        return null;

      default:
        return null;
    }
  }, [
    projectId,
    workflow,
    ingestFlow,
    workspace,
    location.pathname,
    searchParams,
  ]);
}
