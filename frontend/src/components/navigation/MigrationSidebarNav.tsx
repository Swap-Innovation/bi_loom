import { useMemo } from 'react';
import { useParams, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useIngestFlow } from '../../hooks/useIngestFlow';
import { useWorkflow } from '../../hooks/useWorkflow';
import { api } from '../../services/api';
import { FlowNavGroup, SimplePhaseLink, type FlowSubStep } from './FlowNavGroup';
import {
  CONVERT_SUB_STEPS, DELIVER_SUB_STEPS, INGEST_SUB_STEPS,
  PHASE_META, subStepLabel, type StepStatus,
} from './migrationFlow';

function mapWorkflowStatus(status?: string): StepStatus {
  if (status === 'complete') return 'complete';
  if (status === 'in_progress') return 'in_progress';
  if (status === 'blocked') return 'blocked';
  if (status === 'failed') return 'failed';
  return 'pending';
}

function mapConversionStatus(status?: string): StepStatus {
  if (status === 'complete') return 'complete';
  if (status === 'in_progress') return 'in_progress';
  if (status === 'blocked') return 'blocked';
  return 'pending';
}

interface MigrationSidebarNavProps {
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
}

export function MigrationSidebarNav({ expanded, onToggle }: MigrationSidebarNavProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const base = `/projects/${projectId}`;
  const { data: workflow } = useWorkflow(projectId);
  const { data: ingestFlow } = useIngestFlow(projectId);

  const { data: workspace } = useQuery({
    queryKey: ['conversion', projectId],
    queryFn: () => api.getConversionWorkspace(projectId!),
    enabled: !!projectId,
    staleTime: 5000,
  });

  const { data: genStatus } = useQuery({
    queryKey: ['generation-status', projectId],
    queryFn: () => api.getGenerationStatus(projectId!),
    enabled: !!projectId,
    staleTime: 5000,
  });

  const { data: validation } = useQuery({
    queryKey: ['validation', projectId],
    queryFn: () => api.getValidation(projectId!),
    enabled: !!projectId,
    staleTime: 5000,
  });

  const phaseStatus = (id: string) => mapWorkflowStatus(workflow?.phases.find((p) => p.id === id)?.status);
  const phaseBlocked = (id: string) => workflow?.phases.find((p) => p.id === id)?.status === 'blocked';
  const phaseBlockers = (id: string) => workflow?.phases.find((p) => p.id === id)?.blockers ?? [];

  const ingestSteps: FlowSubStep[] = useMemo(() => {
    const steps = ingestFlow?.steps?.length
      ? ingestFlow.steps
      : INGEST_SUB_STEPS.map((s, i) => ({
          id: s.id,
          step: i + 1,
          label: s.label,
          status: i === 0 ? 'pending' : 'blocked',
          can_run: i === 0,
          blocker: i === 0 ? null : 'Complete previous step',
        }));

    return steps.map((s, i) => {
      const route = s.id === 'upload' ? 'artifacts' : s.id;
      return {
        id: s.id,
        stepLabel: subStepLabel(PHASE_META.ingest.number, i + 1),
        label: s.label,
        to: `${base}/ingest/${route}`,
        status: mapWorkflowStatus(s.status === 'failed' ? 'failed' : s.status),
        locked: !s.can_run && s.id !== 'upload',
        blocker: s.blocker,
        icon: INGEST_SUB_STEPS.find((x) => x.id === s.id)?.icon,
        active: location.pathname.includes(`/ingest/${route}`),
      };
    });
  }, [ingestFlow, base, location.pathname]);

  const convertPhaseBlocked = phaseBlocked('convert');
  const activeConvertStep = searchParams.get('step') ?? CONVERT_SUB_STEPS[0].id;
  const inConvert = location.pathname.includes('/convert');

  const convertSteps: FlowSubStep[] = useMemo(() => {
    const steps = workspace?.conversion_steps ?? [];
    return CONVERT_SUB_STEPS.map((meta, i) => {
      const step = steps.find((s) => s.id === meta.id);
      const prevMeta = i > 0 ? CONVERT_SUB_STEPS[i - 1] : null;
      const prevStep = prevMeta ? steps.find((s) => s.id === prevMeta.id) : null;
      const prevIncomplete = !!prevMeta && prevStep?.status !== 'complete';
      const locked = convertPhaseBlocked || prevIncomplete;
      const status = locked && step?.status !== 'complete'
        ? 'blocked'
        : mapConversionStatus(step?.status);
      return {
        id: meta.id,
        stepLabel: subStepLabel(PHASE_META.convert.number, i + 1),
        label: meta.shortLabel,
        to: `${base}/convert?step=${meta.id}`,
        status,
        locked,
        blocker: convertPhaseBlocked
          ? phaseBlockers('convert')[0]
          : prevIncomplete
            ? `Complete ${prevMeta?.shortLabel ?? 'previous step'} first`
            : null,
        icon: meta.icon,
        active: inConvert && activeConvertStep === meta.id,
      };
    });
  }, [workspace, base, convertPhaseBlocked, workflow, inConvert, activeConvertStep]);

  const summary = workflow?.summary ?? { generated: false, validated: false };
  const deliverSteps: FlowSubStep[] = useMemo(() => {
    const deliverBlocked = phaseBlocked('deliver');
    return DELIVER_SUB_STEPS.map((meta, i) => {
      let status: StepStatus = 'pending';
      if (meta.id === 'generate') {
        if (genStatus?.status === 'RUNNING' || genStatus?.status === 'PENDING') status = 'in_progress';
        else if (genStatus?.status === 'FAILED') status = 'failed';
        else if (summary.generated) status = 'complete';
      } else if (meta.id === 'validate') {
        if (validation?.status === 'RUNNING' || validation?.status === 'PENDING') status = 'in_progress';
        else if (validation?.status === 'FAILED') status = 'failed';
        else if (summary.validated) status = 'complete';
        else if (!summary.generated) status = 'blocked';
      } else if (meta.id === 'results') {
        status = summary.validated ? 'complete' : summary.generated ? 'pending' : 'blocked';
      }

      const locked = deliverBlocked || status === 'blocked';
      return {
        id: meta.id,
        stepLabel: subStepLabel(PHASE_META.deliver.number, i + 1),
        label: meta.label,
        to: `${base}/deliver/${meta.path}`,
        status: deliverBlocked ? 'blocked' : status,
        locked,
        blocker: deliverBlocked ? phaseBlockers('deliver')[0] : (locked ? 'Complete previous deliver step' : null),
        icon: meta.icon,
        active: location.pathname.includes(`/deliver/${meta.path}`),
      };
    });
  }, [summary, genStatus, validation, base, workflow, location.pathname]);

  const ingestComplete = ingestSteps.filter((s) => s.status === 'complete').length;
  const convertComplete = convertSteps.filter((s) => s.status === 'complete').length;
  const deliverComplete = deliverSteps.filter((s) => s.status === 'complete').length;

  return (
    <>
      <FlowNavGroup
        phaseNumber={PHASE_META.ingest.number}
        label={PHASE_META.ingest.label}
        parentTo={`${base}/ingest`}
        parentActive={location.pathname.includes('/ingest')}
        parentStatus={phaseStatus('ingest')}
        parentBlocked={phaseBlocked('ingest')}
        parentBlockers={phaseBlockers('ingest')}
        parentIcon={PHASE_META.ingest.icon}
        substeps={ingestSteps}
        expanded={expanded.ingest ?? true}
        onToggle={() => onToggle('ingest')}
        progress={`${ingestComplete}/${ingestSteps.length}`}
      />

      <SimplePhaseLink
        phaseNumber={PHASE_META.target.number}
        label={PHASE_META.target.label}
        to={`${base}/target`}
        icon={PHASE_META.target.icon}
        status={phaseStatus('target')}
        blocked={phaseBlocked('target')}
        blockers={phaseBlockers('target')}
      />

      <SimplePhaseLink
        phaseNumber={PHASE_META.map.number}
        label={PHASE_META.map.label}
        to={`${base}/map`}
        icon={PHASE_META.map.icon}
        status={phaseStatus('map')}
        blocked={phaseBlocked('map')}
        blockers={phaseBlockers('map')}
      />

      <FlowNavGroup
        phaseNumber={PHASE_META.convert.number}
        label={PHASE_META.convert.label}
        parentTo={`${base}/convert?step=${CONVERT_SUB_STEPS[0].id}`}
        parentActive={inConvert}
        parentStatus={phaseStatus('convert')}
        parentBlocked={convertPhaseBlocked}
        parentBlockers={phaseBlockers('convert')}
        parentIcon={PHASE_META.convert.icon}
        substeps={convertSteps}
        expanded={expanded.convert ?? inConvert}
        onToggle={() => onToggle('convert')}
        progress={`${convertComplete}/${convertSteps.length}`}
      />

      <FlowNavGroup
        phaseNumber={PHASE_META.deliver.number}
        label={PHASE_META.deliver.label}
        parentTo={`${base}/deliver`}
        parentActive={location.pathname.includes('/deliver')}
        parentStatus={phaseStatus('deliver')}
        parentBlocked={phaseBlocked('deliver')}
        parentBlockers={phaseBlockers('deliver')}
        parentIcon={PHASE_META.deliver.icon}
        substeps={deliverSteps}
        expanded={expanded.deliver ?? location.pathname.includes('/deliver')}
        onToggle={() => onToggle('deliver')}
        progress={`${deliverComplete}/${deliverSteps.length}`}
      />
    </>
  );
}
