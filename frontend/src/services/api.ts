import type { ApiResponse } from '../types';

const BASE = '/api/v1';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  const json: ApiResponse<T> = await res.json();
  if (!json.success) {
    throw new Error(json.error?.message || 'Request failed');
  }
  return json.data;
}

export const api = {
  getDashboard: () => request<import('../types').DashboardStats>('/dashboard'),

  listProjects: () => request<import('../types').Project[]>('/projects'),
  getProject: (id: string) => request<import('../types').Project>(`/projects/${id}`),
  createProject: (data: { name: string; description?: string }) =>
    request<import('../types').Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  createProjectFromTemplate: () =>
    request<import('../types').Project>('/projects/from-template', { method: 'POST', body: JSON.stringify({}) }),
  deleteProject: (id: string) => request<{ deleted: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
  getSampleManifest: () => request<Record<string, unknown>>('/sample-data/manifest'),

  sendProjectChat: (projectId: string, data: {
    message: string;
    page_path: string;
    history: { role: string; content: string }[];
    activity_context?: string;
  }) => request<{ reply: string; suggestions: string[]; page: { label: string } }>(
    `/projects/${projectId}/chat`, { method: 'POST', body: JSON.stringify(data) },
  ),
  sendGeneralChat: (data: {
    message: string;
    page_path: string;
    history: { role: string; content: string }[];
    activity_context?: string;
  }) => request<{ reply: string; suggestions: string[] }>(
    '/chat', { method: 'POST', body: JSON.stringify(data) },
  ),

  streamChat: async function* (
    opts: {
      projectId?: string;
      message: string;
      page_path: string;
      history: { role: string; content: string }[];
      activity_context?: string;
    },
  ): AsyncGenerator<{ type: string; text?: string; status?: string; suggestions?: string[]; page?: { label: string } }, void, unknown> {
    const url = opts.projectId
      ? `${BASE}/projects/${opts.projectId}/chat/stream`
      : `${BASE}/chat/stream`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        message: opts.message,
        page_path: opts.page_path,
        history: opts.history,
        activity_context: opts.activity_context,
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Chat stream failed (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        try {
          yield JSON.parse(line.slice(6));
        } catch {
          /* ignore malformed chunk */
        }
      }
    }
  },

  getAiStatus: () => request<{
    mode: 'mock' | 'live';
    provider: 'mock' | 'cursor' | 'openai';
    model: string;
    label: string;
  }>('/ai/status'),

  uploadArtifact: async (
    projectId: string,
    file: File,
    onProgress?: (percent: number) => void,
  ) => {
    return new Promise<import('../types').Artifact>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/projects/${projectId}/artifacts`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        try {
          const json: ApiResponse<import('../types').Artifact> = JSON.parse(xhr.responseText);
          if (!json.success) {
            reject(new Error(json.error?.message || 'Upload failed'));
            return;
          }
          resolve(json.data);
        } catch {
          reject(new Error('Upload failed'));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      const form = new FormData();
      form.append('file', file);
      xhr.send(form);
    });
  },
  listArtifacts: (projectId: string) => request<import('../types').Artifact[]>(`/projects/${projectId}/artifacts`),

  startParse: (projectId: string, documentIds?: string[]) =>
    request<{ parse_run_id: string; job_id: string; document_ids?: string[] | null }>(
      `/projects/${projectId}/parse`,
      { method: 'POST', body: JSON.stringify({ document_ids: documentIds ?? null }) },
    ),
  getParseStatus: (projectId: string) => request<import('../types').ParseStatus | null>(`/projects/${projectId}/parse-status`),

  getIngestFlow: (projectId: string) =>
    request<import('../types').IngestFlow>(`/projects/${projectId}/ingest/flow`),

  getMspec: (projectId: string) => request<{ id: string; version: string; mspec: Record<string, unknown> }>(`/projects/${projectId}/mspec`),
  generateMspec: (projectId: string) =>
    request<{
      mspec_id: string;
      version: string;
      document_count: number;
      folders: number;
      pages: number;
      blocks: number;
      steps: { label: string; status: string }[];
    }>(`/projects/${projectId}/mspec/generate`, { method: 'POST' }),
  getMspecDetail: (projectId: string, mspecId?: string) =>
    request<import('../types').MspecDetail>(
      `/projects/${projectId}/mspec/detail${mspecId ? `?mspec_id=${mspecId}` : ''}`,
    ),
  listMspecVersions: (projectId: string) =>
    request<{ id: string; version: string; created_at: string; document_count: number }[]>(
      `/projects/${projectId}/mspec/versions`,
    ),
  getPreparseChecklist: (projectId: string) =>
    request<{
      ready: boolean;
      items: { id: string; label: string; done: boolean }[];
      document_count: number;
      connection_count: number;
      artifact_count: number;
      documents?: { id: string; name: string; product_type: string; description?: string }[];
    }>(`/projects/${projectId}/artifacts/checklist`),

  listTargetModelCatalog: (projectId: string) =>
    request<import('../types').TargetModelCatalogItem[]>(`/projects/${projectId}/target-models/catalog`),
  listGlobalTargetCatalog: () =>
    request<import('../types').TargetModelCatalogItem[]>('/target-models/catalog'),
  getCatalogPreview: (catalogId: string) =>
    request<import('../types').CatalogPreview>(`/target-models/catalog/${catalogId}`),
  compareCatalogModels: (a: string, b: string) =>
    request<import('../types').CatalogCompareResult>(`/target-models/catalog/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),
  getPlutoGraph: (projectId: string) =>
    request<import('../types').SchemaGraphData>(`/projects/${projectId}/pluto-model/graph`),
  getModelCoverage: (projectId: string) =>
    request<import('../types').ModelCoverage>(`/projects/${projectId}/pluto-model/coverage`),
  getGlossary: (projectId: string) =>
    request<import('../types').GlossaryTerm[]>(`/projects/${projectId}/glossary`),
  listPlutoModels: (projectId: string) =>
    request<import('../types').PlutoModelSummary[]>(`/projects/${projectId}/pluto-models`),
  selectTargetModel: (projectId: string, catalogId: string, name?: string) =>
    request<{ id: string; name: string; catalog_id: string; tables: number }>(`/projects/${projectId}/pluto-model/select`, {
      method: 'POST', body: JSON.stringify({ catalog_id: catalogId, name }),
    }),
  activatePlutoModel: (projectId: string, modelId: string) =>
    request<{ id: string; active: boolean }>(`/projects/${projectId}/pluto-models/${modelId}/activate`, { method: 'POST' }),
  deletePlutoModel: (projectId: string, modelId: string) =>
    request<{ deleted: boolean; id: string; cleared_active?: boolean }>(
      `/projects/${projectId}/pluto-models/${modelId}`,
      { method: 'DELETE' },
    ),
  getPlutoModel: (projectId: string) => request<Record<string, unknown>>(`/projects/${projectId}/pluto-model`),
  getPlutoModelTree: (projectId: string) => request<import('../types').PbiSemanticModel>(`/projects/${projectId}/pluto-model/tree`),

  getConversionWorkspace: (projectId: string) =>
    request<import('../types').ConversionWorkspace>(`/projects/${projectId}/conversion/workspace`),

  getWorkflow: (projectId: string) =>
    request<import('../types').WorkflowState>(`/projects/${projectId}/workflow`),

  getMappingStats: (projectId: string) =>
    request<Record<string, number>>(`/projects/${projectId}/mapping/stats`),
  getActiveMappingJob: (projectId: string) =>
    request<{ job_id: string; status: string; progress?: Record<string, unknown>; error_message?: string } | null>(
      `/projects/${projectId}/mapping/active-job`,
    ),
  bulkApproveMappings: (projectId: string, minConfidence = 90) =>
    request<{ approved: number; skipped_unmapped?: number }>(
      `/projects/${projectId}/mapping/bulk-approve?min_confidence=${minConfidence}`,
      { method: 'POST' },
    ),
  bulkApproveAllMappings: (projectId: string) =>
    request<{ approved: number; skipped_unmapped?: number }>(
      `/projects/${projectId}/mapping/bulk-approve-all`,
      { method: 'POST' },
    ),
  listMappingsFiltered: (projectId: string, params?: {
    status?: string; confidence_level?: string; document?: string; unmapped_only?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.confidence_level) qs.set('confidence_level', params.confidence_level);
    if (params?.document) qs.set('document', params.document);
    if (params?.unmapped_only) qs.set('unmapped_only', 'true');
    const q = qs.toString();
    return request<import('../types').Mapping[]>(`/projects/${projectId}/mapping${q ? `?${q}` : ''}`);
  },
  bulkRejectMappings: (projectId: string, maxConfidence = 50) =>
    request<{ rejected: number }>(
      `/projects/${projectId}/mapping/bulk-reject?max_confidence=${maxConfidence}`, { method: 'POST' },
    ),
  bulkRejectAllMappings: (projectId: string) =>
    request<{ rejected: number }>(`/projects/${projectId}/mapping/bulk-reject-all`, { method: 'POST' }),

  runConversion: (projectId: string, step?: string) => {
    const qs = step ? `?step=${encodeURIComponent(step)}` : '';
    return request<{ conversion_run_id: string; items_created: number; items_updated: number; step?: string }>(
      `/projects/${projectId}/conversion/run${qs}`, { method: 'POST' },
    );
  },
  listConversionItems: (projectId: string, params?: { status?: string; step?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.step) qs.set('step', params.step);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return request<{ items: import('../types').ConversionItem[]; count: number }>(
      `/projects/${projectId}/conversion/items${q ? `?${q}` : ''}`,
    );
  },
  searchMspec: (projectId: string, q: string) =>
    request<{ query: string; results: { section: string; item: unknown }[]; count: number }>(
      `/projects/${projectId}/mspec/search?q=${encodeURIComponent(q)}`,
    ),
  deleteArtifact: (projectId: string, artifactId: string) =>
    request<{ deleted: boolean }>(`/projects/${projectId}/artifacts/${artifactId}`, { method: 'DELETE' }),
  validateArtifact: async (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/projects/${projectId}/artifacts/validate`, { method: 'POST', body: form });
    const json: ApiResponse<{
      valid: boolean; filename: string; file_count?: number; document_count?: number;
      connection_count?: number; warnings: string[]; files?: { name: string; size: number }[];
    }> = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Validation failed');
    return json.data;
  },
  updateConversionItem: (projectId: string, itemId: string, data: Record<string, unknown>) =>
    request<import('../types').ConversionItem>(`/projects/${projectId}/conversion/items/${itemId}`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),

  importPlutoModel: async (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/projects/${projectId}/pluto-model`, { method: 'POST', body: form });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Import failed');
    return json.data;
  },
  importGlossary: async (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/projects/${projectId}/glossary`, { method: 'POST', body: form });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Import failed');
    return json.data as { imported: number };
  },

  runMapping: (projectId: string) =>
    request<{ job_id: string }>(`/projects/${projectId}/mapping/run`, { method: 'POST' }),
  listMappings: (projectId: string) => request<import('../types').Mapping[]>(`/projects/${projectId}/mapping`),
  approveMapping: (projectId: string, mappingId: string) =>
    request<import('../types').Mapping>(`/projects/${projectId}/mapping/${mappingId}/approve`, {
      method: 'POST', body: JSON.stringify({}),
    }),
  rejectMapping: (projectId: string, mappingId: string) =>
    request<import('../types').Mapping>(`/projects/${projectId}/mapping/${mappingId}/reject`, {
      method: 'POST', body: JSON.stringify({}),
    }),
  updateMapping: (projectId: string, mappingId: string, data: Record<string, string>) =>
    request<import('../types').Mapping>(`/projects/${projectId}/mapping/${mappingId}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),

  startGeneration: (projectId: string) =>
    request<{ generation_run_id: string; job_id: string }>(`/projects/${projectId}/generate`, { method: 'POST' }),
  getActiveGenerationJob: (projectId: string) =>
    request<{ job_id: string; status: string; progress?: Record<string, unknown>; error_message?: string } | null>(
      `/projects/${projectId}/generation/active-job`,
    ),
  getGenerationStatus: (projectId: string) =>
    request<{
      id: string;
      status: string;
      output_path: string | null;
      error_message?: string | null;
      job_id?: string | null;
      artifact_tree?: {
        semantic_model?: Record<string, unknown>;
        reports?: { id: string; name: string; pages: { id: string; name: string; visuals: { id: string; name: string; type: string }[] }[] }[];
        files?: { name: string; type?: string }[];
      } | null;
      files?: { name: string; type?: string }[];
    } | null>(`/projects/${projectId}/generation-status`),

  startValidation: (projectId: string) =>
    request<{ validation_run_id: string; job_id: string }>(`/projects/${projectId}/validate`, { method: 'POST' }),
  getActiveValidationJob: (projectId: string) =>
    request<{ job_id: string; status: string; progress?: Record<string, unknown>; error_message?: string } | null>(
      `/projects/${projectId}/validation/active-job`,
    ),
  getValidation: (projectId: string) =>
    request<(import('../types').ValidationResult & { job_id?: string | null }) | null>(
      `/projects/${projectId}/validation`,
    ),

  getResults: (projectId: string) => request<import('../types').Results>(`/projects/${projectId}/results`),
  getJob: (jobId: string) => request<import('../types').Job>(`/jobs/${jobId}`),

  downloadPackage: (projectId: string) => `${BASE}/projects/${projectId}/download`,
};

export function useJobPoller(jobId: string | null, onComplete: () => void) {
  // Used via React Query in components
  return { jobId, onComplete };
}
