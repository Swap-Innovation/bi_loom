import {
  LayoutDashboard, Upload, GitBranch, FileText, Database, GitCompare,
  ArrowLeftRight, Package, CheckCircle2, Download, Layers, BarChart3,
  Calculator, Filter,
} from 'lucide-react';

export type StepStatus = 'complete' | 'in_progress' | 'pending' | 'blocked' | 'failed';

/** Convert-only sub-steps (Mapping lives in phase 4; Generate in Deliver) */
export const CONVERT_SUB_STEPS = [
  { id: 'report_structure', label: 'Report Structure', shortLabel: 'Reports', icon: Layers },
  { id: 'visual_conversion', label: 'Visual Conversion', shortLabel: 'Visuals', icon: BarChart3 },
  { id: 'measures_formulas', label: 'Measures & Formulas', shortLabel: 'Measures', icon: Calculator },
  { id: 'filters_variables', label: 'Filters & Variables', shortLabel: 'Filters', icon: Filter },
] as const;

export const DELIVER_SUB_STEPS = [
  { id: 'generate', label: 'Generate PBI', path: 'generate', icon: Package },
  { id: 'validate', label: 'Validate', path: 'validate', icon: CheckCircle2 },
  { id: 'results', label: 'Results & Download', path: 'results', icon: Download },
] as const;

export const INGEST_SUB_STEPS = [
  { id: 'upload', label: 'Upload Assets', route: 'artifacts', icon: Upload },
  { id: 'parsing', label: 'Parsing', route: 'parsing', icon: GitBranch },
  { id: 'mspec', label: 'MSpec', route: 'mspec', icon: FileText },
] as const;

export const PHASE_META = {
  overview: { number: 1, label: 'Overview', icon: LayoutDashboard, path: 'overview' },
  ingest: { number: 2, label: 'Ingest', icon: Upload, path: 'ingest' },
  target: { number: 3, label: 'Target Model', icon: Database, path: 'target' },
  map: { number: 4, label: 'Mapping', icon: GitCompare, path: 'map' },
  convert: { number: 5, label: 'Convert', icon: ArrowLeftRight, path: 'convert' },
  deliver: { number: 6, label: 'Deliver', icon: Package, path: 'deliver' },
} as const;

export function subStepLabel(phaseNumber: number, subIndex: number): string {
  return `${phaseNumber}.${subIndex}`;
}
