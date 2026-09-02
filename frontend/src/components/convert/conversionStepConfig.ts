import type { ConversionStep, ConversionWorkspace } from '../../types';

export interface WizardStepMeta {
  id: string;
  shortLabel: string;
  executable: boolean;
  itemStepFilter: string | null;
  phaseRoute?: string;
  phaseLabel?: string;
}

/** Convert-only executable steps — aligned with sidebar CONVERT_SUB_STEPS */
export const WIZARD_STEP_ORDER: WizardStepMeta[] = [
  { id: 'report_structure', shortLabel: 'Reports', executable: true, itemStepFilter: 'report_structure' },
  { id: 'visual_conversion', shortLabel: 'Visuals', executable: true, itemStepFilter: 'visual' },
  { id: 'measures_formulas', shortLabel: 'Measures', executable: true, itemStepFilter: 'measures_formulas' },
  { id: 'filters_variables', shortLabel: 'Filters', executable: true, itemStepFilter: 'filters_variables' },
];

export function getStepMeta(stepId: string): WizardStepMeta | undefined {
  return WIZARD_STEP_ORDER.find((s) => s.id === stepId);
}

export function findFirstIncompleteIndex(steps: ConversionStep[]): number {
  for (let i = 0; i < WIZARD_STEP_ORDER.length; i++) {
    const meta = WIZARD_STEP_ORDER[i];
    const step = steps.find((s) => s.id === meta.id);
    if (!step || step.status !== 'complete') return i;
  }
  return Math.max(0, WIZARD_STEP_ORDER.length - 1);
}

/** Compact status lines for the wizard (not a live thought stream — Assistant owns that). */
export function buildStepStatusLines(
  step: ConversionStep | undefined,
  workspace: ConversionWorkspace,
  meta: WizardStepMeta,
): { line: string; done: boolean }[] {
  if (!step) return [{ line: 'Waiting for workspace data…', done: false }];

  switch (meta.id) {
    case 'report_structure':
      return [
        { line: `${step.items.length} report structure item(s) in workspace`, done: step.items.length > 0 },
        { line: 'Run this step to materialize BO documents → PBI report shells', done: step.status === 'complete' },
      ];
    case 'visual_conversion':
      return [
        { line: `Visual candidates: ${workspace.target_tree?.summary?.visuals ?? step.items.length}`, done: step.items.length > 0 },
        { line: 'Run to map BO blocks to Power BI visual types', done: step.status === 'complete' },
      ];
    case 'measures_formulas':
      return [
        { line: `${step.items.length} measure(s) listed from MSpec`, done: step.items.length > 0 },
        { line: 'Run to create DAX conversion items', done: step.status === 'complete' },
      ];
    case 'filters_variables':
      return [
        { line: 'Filters and variables from MSpec', done: step.items.length > 0 },
        { line: 'Run to plan PBI slicers / parameters', done: step.status === 'complete' },
      ];
    default:
      return [{ line: step.description, done: step.status === 'complete' }];
  }
}

/** @deprecated Prefer buildStepStatusLines — kept for any remaining imports */
export function buildThoughtProcess(
  step: ConversionStep | undefined,
  workspace: ConversionWorkspace,
  meta: WizardStepMeta,
): { line: string; done: boolean }[] {
  return buildStepStatusLines(step, workspace, meta);
}
