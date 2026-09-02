export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error: { code: string; message: string; details?: Record<string, unknown> } | null;
  request_id: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  source_technology: string;
  target_technology: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Artifact {
  id: string;
  project_id: string;
  filename: string;
  file_type: string | null;
  file_size: number;
  status: string;
  created_at: string;
}

export interface Mapping {
  id: string;
  project_id: string;
  source_type: string;
  source_id: string | null;
  source_name: string;
  source_context: Record<string, unknown> | null;
  target_type: string | null;
  target_table: string | null;
  target_column: string | null;
  target_measure: string | null;
  target_expression: string | null;
  confidence: number;
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW';
  reasoning: string[] | null;
  evidence: string[] | null;
  recommendation: string | null;
  status: string;
  reviewer: string | null;
  review_comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  project_id: string;
  job_type: string;
  status: string;
  progress: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
}

export interface DashboardStats {
  reports_in_scope: number;
  parsed: number;
  mapped: number;
  generated: number;
  validation_passed: number;
  migration_progress: number;
  high_confidence: number;
  needs_review: number;
  unsupported: number;
}

export interface ParseStatus {
  parse_run_id: string;
  status: string;
  progress: {
    step: string;
    step_label?: string;
    completed: string[];
    sections?: {
      id: string;
      label: string;
      description?: string;
      completed_steps?: string[];
      status?: string;
      count?: number;
      items?: { name: string; type: string; [key: string]: unknown }[];
    }[];
    asset_totals?: Record<string, number>;
    grand_total?: number;
    hierarchy?: {
      folders?: { id: string; name: string; path?: string }[];
      documents?: { id: string; name: string; product_type: string; product_label: string; folder?: string; pages: unknown[]; page_count: number; block_count: number; visual_count: number }[];
    };
    hierarchy_summary?: {
      folders?: number; documents?: number; pages?: number; blocks?: number;
      product_types?: Record<string, number>;
    };
    current_category?: string;
  } | null;
  capability_report: Record<string, unknown> | null;
  error_message: string | null;
}

export interface ValidationResult {
  validation_run_id: string;
  status: string;
  results: Record<string, unknown> | null;
  migration_score: number | null;
}

export interface Results {
  project_id: string;
  status: string;
  migration_score: number | null;
  reports_generated: number;
  reports_requiring_review: number;
  unsupported_items: number;
  manual_actions: number;
  mapping_coverage: number | null;
  high_confidence_pct: number | null;
  medium_confidence_pct: number | null;
  low_confidence_pct: number | null;
  downloads: { type: string; filename: string; id: string }[];
}

export interface TargetModelCatalogItem {
  catalog_id: string;
  name: string;
  description: string;
  table_count: number;
  column_count: number;
  measure_count: number;
  relationship_count: number;
  filename: string;
}

export interface PlutoModelSummary {
  id: string;
  name: string;
  catalog_id?: string;
  is_active: boolean;
  table_count: number;
  column_count: number;
  measure_count: number;
  created_at?: string;
}

export interface ConversionStep {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'in_progress' | 'complete' | 'blocked';
  progress_pct: number;
  items: Record<string, unknown>[];
}

export interface ConversionWorkspace {
  project_status: string;
  has_mspec: boolean;
  has_target_model: boolean;
  selected_target_model: PlutoModelSummary | null;
  source_tree: {
    folders: { id: string; name: string; path?: string }[];
    documents: HierarchyDocument[];
    summary?: Record<string, number>;
    queries?: unknown[];
    global_measures?: unknown[];
    global_variables?: unknown[];
    global_filters?: unknown[];
  } | null;
  target_tree: {
    semantic_model: PbiSemanticModel;
    reports: PbiReport[];
    summary: Record<string, number>;
  } | null;
  conversion_steps: ConversionStep[];
  mspec_sections: MspecSection[] | null;
  mapping_stats: Record<string, number>;
  overall_progress: number;
}

export interface ConversionItem {
  id: string;
  source_type: string;
  source_id: string;
  source_name: string;
  source_path: Record<string, unknown> | null;
  conversion_step: string;
  status: string;
  target_path: Record<string, unknown> | null;
  mapping_id: string | null;
}

export interface HierarchyDocument {
  id: string;
  name: string;
  product_type: string;
  product_label: string;
  folder?: string;
  pages: { id: string; name: string; type: string; blocks: { id: string; name: string; type: string; status?: string; field_names?: string[] }[] }[];
  page_count: number;
  block_count: number;
  visual_count: number;
}

export interface PbiSemanticModel {
  id: string;
  name: string;
  asset_type: string;
  tables: PbiTable[];
  relationships: unknown[];
  hierarchies: unknown[];
}

export interface PbiTable {
  id: string;
  name: string;
  description?: string;
  asset_type: string;
  columns: { id: string; name: string; type: string; description?: string; asset_type: string }[];
  measures: { id: string; name: string; expression?: string; description?: string; asset_type: string }[];
}

export interface SchemaGraphNode {
  id: string;
  label: string;
  type: string;
  description?: string;
  column_count: number;
}

export interface SchemaGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  cardinality?: string;
}

export interface SchemaGraphData {
  nodes: SchemaGraphNode[];
  edges: SchemaGraphEdge[];
}

export interface ModelCoverage {
  ready: boolean;
  match_pct: number;
  total_source_fields?: number;
  matched_count?: number;
  unmatched_count?: number;
  unmatched_sample?: string[];
  model_name?: string;
  message?: string;
}

export interface CatalogPreview {
  catalog_id: string;
  tables: { name: string; description?: string; columns: { column: string; type: string; synonyms: string[] }[] }[];
  relationships: unknown[];
  measures: unknown[];
}

export interface CatalogCompareResult {
  only_in_a: string[];
  only_in_b: string[];
  in_both: string[];
  column_diffs: { table: string; only_in_a: string[]; only_in_b: string[] }[];
}

export interface GlossaryTerm {
  term: string;
  synonyms: string[];
  definition?: string;
}

export interface PbiReport {
  id: string;
  name: string;
  asset_type: string;
  product_type?: string;
  pages: PbiPage[];
  page_count: number;
  visual_count: number;
}

export interface PbiPage {
  id: string;
  name: string;
  asset_type: string;
  page_type?: string;
  visuals: PbiVisual[];
  visual_count: number;
}

export interface PbiVisual {
  id: string;
  name: string;
  type: string;
  asset_type: string;
  status: string;
  fields: { source: string; table?: string; column?: string; measure?: string; status: string; confidence?: number }[];
  source_block_type?: string;
}

export interface MspecSection {
  id: string;
  label: string;
  count: number;
  items: unknown[];
}

export interface MspecDetail {
  id: string;
  version: string;
  mspec: Record<string, unknown>;
  sections: MspecSection[];
  created_at?: string;
}

export interface IngestFlowStep {
  id: string;
  step: number;
  label: string;
  description: string;
  status: 'pending' | 'in_progress' | 'complete' | 'blocked' | 'failed';
  route: string;
  can_run: boolean;
  action: string;
  blocker?: string | null;
  pending_draft?: boolean;
}

export interface IngestFlow {
  steps: IngestFlowStep[];
  documents: {
    id: string;
    name: string;
    product_type: string;
    description?: string;
    parsed?: boolean;
    can_parse?: boolean;
  }[];
  checklist: {
    ready: boolean;
    artifact_count: number;
    document_count: number;
    connection_count?: number;
    items?: { id: string; label: string; done: boolean }[];
    documents?: { id: string; name: string; product_type: string; description?: string }[];
  };
  artifact_count: number;
  has_mspec: boolean;
  mspec_pending?: boolean;
  parse_status: string | null;
}

export interface WorkflowPhase {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'in_progress' | 'complete' | 'blocked';
  blockers: string[];
  route: string;
}

export interface WorkflowState {
  project_id: string;
  project_status: string;
  current_phase: string;
  phases: WorkflowPhase[];
  next_action: { label: string; route: string; enabled?: boolean } | null;
  summary: {
    artifacts: number;
    has_mspec: boolean;
    has_target_model: boolean;
    mappings_total: number;
    mappings_reviewed: number;
    mappings_pending: number;
    convert_steps_done?: string[];
    convert_complete?: boolean;
    generated: boolean;
    validated: boolean;
  };
}
