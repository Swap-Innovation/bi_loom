# Production Upgrade Plan — BI Loom

**Goal:** Transform the MVP wizard into a production-grade BO → Power BI migration studio (Power BI / Tableau class UX).

**Current state:** Backend pipeline is ahead of frontend. 9 flat tabs, preview-only conversion, stub PBIP generation, no auth, no workflow gating.

**Target state:** 5-phase guided workspace, dual-pane mapping workbench, conversion studio with persisted item status, real PBI artifacts, enterprise shell.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Phase 0 — Foundation & Hotfixes](#2-phase-0--foundation--hotfixes)
3. [Phase 1 — Workflow Shell & Navigation](#3-phase-1--workflow-shell--navigation)
4. [Phase 2 — Design System & Shared Infrastructure](#4-phase-2--design-system--shared-infrastructure)
5. [Phase 3 — Backend Data Model & Service Split](#5-phase-3--backend-data-model--service-split)
6. [Phase 4 — Ingest Workspace (Artifacts + Parsing + MSpec)](#6-phase-4--ingest-workspace)
7. [Phase 5 — Target Semantic Workspace](#7-phase-5--target-semantic-workspace)
8. [Phase 6 — Mapping Workbench v2](#8-phase-6--mapping-workbench-v2)
9. [Phase 7 — Conversion Studio v2](#9-phase-7--conversion-studio-v2)
10. [Phase 8 — Deliver Workspace (Generate + Validate + Results)](#10-phase-8--deliver-workspace)
11. [Phase 9 — Generation & PBI Output (Real Artifacts)](#11-phase-9--generation--pbi-output)
12. [Phase 10 — Enterprise (Auth, Audit, Multi-tenant)](#12-phase-10--enterprise)
13. [Phase 11 — Polish, Performance, Testing](#13-phase-11--polish-performance-testing)
14. [Dependency Graph](#14-dependency-graph)
15. [Milestone Timeline](#15-milestone-timeline)
16. [Acceptance Criteria (Global)](#16-acceptance-criteria-global)

---

## 1. Architecture Overview

### 1.1 Target Information Architecture

Replace 9 peer tabs with **5 workflow phases** + **Overview** + **Expert mode**:

| Phase | Route prefix | Combines current tabs | Primary user goal |
|-------|--------------|----------------------|-------------------|
| **Overview** | `/projects/:id` | Overview | See status, blockers, next action |
| **1. Ingest** | `/projects/:id/ingest` | Artifacts, Parsing, MSpec (sub-routes) | Load & parse BO export |
| **2. Target** | `/projects/:id/target` | Target Model, Glossary | Select semantic model |
| **3. Map** | `/projects/:id/map` | Semantic Mapping | Review AI mappings |
| **4. Convert** | `/projects/:id/convert` | Conversion, MSpec inspector | Progressive BO → PBI |
| **5. Deliver** | `/projects/:id/deliver` | Generate, Validation, Results | Package & download |

**Expert mode:** Toggle to show all legacy sub-routes in sidebar (power users).

### 1.2 Target Layout Shell

```
┌─────────────────────────────────────────────────────────────────┐
│ AppBar: Logo | Project Name | Status Badge | Jobs Tray | User  │
├──────────┬──────────────────────────────────────┬───────────────┤
│ Phase    │ Main Canvas                          │ Inspector     │
│ Sidebar  │ (workspace-specific)                 │ (contextual)  │
│          │                                      │               │
│ ○ Ingest │                                      │ Selected node │
│ ○ Target │                                      │ properties    │
│ ● Map    │                                      │ actions       │
│ ○ Convert│                                      │               │
│ ○ Deliver│                                      │               │
├──────────┴──────────────────────────────────────┴───────────────┤
│ Optional: bottom job progress bar                                │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Backend Service Boundaries (target)

Split `project_service.py` into:

| Service | Responsibility |
|---------|----------------|
| `ProjectService` | CRUD, settings, workflow state |
| `ArtifactService` | Upload, validate, versions |
| `ParseService` | BO parse jobs |
| `PlutoService` | Target models, glossary, catalog |
| `MappingService` | AI mapping, review, bulk ops |
| `ConversionService` | Item-level conversion state, preview |
| `GenerationService` | PBIP/TMDL generation |
| `ValidationService` | Migration scoring |
| `WorkflowService` | Phase gates, next-step logic |

---

## 2. Phase 0 — Foundation & Hotfixes

**Duration:** 1–2 days  
**Goal:** Fix known bugs, deploy latest UI, establish CI gate.

### 2.1 Tasks

| ID | Task | Files | Acceptance |
|----|------|-------|------------|
| 0.1 | Rebuild & verify Docker images include Target Model, Conversion, MSpec routes | `docker-compose.yml`, `frontend/Dockerfile` | All 9 tabs visible; routes resolve |
| 0.2 | Fix mapping re-run duplicates — upsert by `(project_id, source_name)` | `backend/app/ai/orchestrator.py`, `MappingService` | Second run replaces rows, not appends |
| 0.3 | Set `MAPPING_APPROVED` when all mappings approved/modified | `MappingService.approve()`, new helper `_check_mapping_complete()` | Project status transitions correctly |
| 0.4 | Move Generate PBI button from Validation to Deliver/Results (interim) | `Validation.tsx`, new or updated Deliver page | Validation tab is validate-only |
| 0.5 | Update Integrations page copy (Target Model tab, not Artifacts) | `Integrations.tsx` | Docs match actual workflow |
| 0.6 | Add `GET /projects/{id}/workflow` — returns phase status + next action | New `api/workflow.py`, `WorkflowService` | Frontend can gate steps |

### 2.2 Workflow API (minimal)

```json
GET /api/v1/projects/{id}/workflow
{
  "current_phase": "map",
  "phases": [
    { "id": "ingest", "status": "complete", "blockers": [] },
    { "id": "target", "status": "complete", "blockers": [] },
    { "id": "map", "status": "in_progress", "blockers": ["12 mappings pending review"] },
    { "id": "convert", "status": "blocked", "blockers": ["Complete mapping review"] },
    { "id": "deliver", "status": "blocked", "blockers": ["Run conversion"] }
  ],
  "next_action": { "label": "Review mappings", "route": "/projects/{id}/map" }
}
```

---

## 3. Phase 1 — Workflow Shell & Navigation

**Duration:** 3–5 days  
**Depends on:** Phase 0.6

### 3.1 Frontend tasks

| ID | Task | Files to create/modify |
|----|------|------------------------|
| 1.1 | `ProjectShell` layout with left phase sidebar + top bar | `components/layout/ProjectShell.tsx` |
| 1.2 | `PhaseSidebar` — 5 phases with icons, status (complete/active/blocked) | `components/layout/PhaseSidebar.tsx` |
| 1.3 | `ProjectHeader` — project name, description, status, breadcrumb | `components/layout/ProjectHeader.tsx` |
| 1.4 | `InspectorPanel` — right drawer for selected object (empty initially) | `components/layout/InspectorPanel.tsx` |
| 1.5 | Refactor routes in `App.tsx` to phase-based structure | `App.tsx` |
| 1.6 | Redirect legacy routes (`/parsing` → `/ingest/parsing`, etc.) | `App.tsx` |
| 1.7 | `useWorkflow()` hook consuming workflow API | `hooks/useWorkflow.ts` |
| 1.8 | Block navigation to locked phases with tooltip explaining blocker | `PhaseSidebar.tsx` |

### 3.2 Route map (target)

```
/projects/:id                          → Overview (dashboard for project)
/projects/:id/ingest                   → Ingest landing
/projects/:id/ingest/artifacts        → Upload
/projects/:id/ingest/parsing          → Parse progress
/projects/:id/ingest/mspec            → MSpec viewer (ingest context)
/projects/:id/target                   → Target model + glossary
/projects/:id/target/explore           → Schema graph explorer
/projects/:id/map                      → Mapping workbench
/projects/:id/convert                  → Conversion studio
/projects/:id/deliver                  → Deliver landing
/projects/:id/deliver/generate         → Generation status
/projects/:id/deliver/validate         → Validation
/projects/:id/deliver/results         → Results & download
```

### 3.3 Acceptance

- User sees 5 phases in sidebar, not 9 tabs
- Blocked phases are visually disabled with reason
- Overview shows "Continue" CTA from `next_action`
- Legacy URLs redirect without 404

---

## 4. Phase 2 — Design System & Shared Infrastructure

**Duration:** 4–6 days  
**Can parallel with Phase 1**

### 4.1 New npm dependencies

| Package | Purpose |
|---------|---------|
| `@tanstack/react-table` | Mapping grid, artifact table, projects list |
| `react-resizable-panels` | Conversion studio split panes |
| `sonner` or custom | Toast notifications |
| `@radix-ui/react-*` (optional) | Dialog, Tooltip, Tabs, Dropdown — or build minimal |
| `react-flow` or `@xyflow/react` | Pluto ER / relationship graph |

### 4.2 UI component library

Create under `frontend/src/components/ui/`:

| Component | Used in |
|-----------|---------|
| `DataTable` | Projects, mappings, artifacts, conversion items |
| `Dialog` / `ConfirmDialog` | Delete, re-parse, bulk approve |
| `Tabs` | Ingest sub-workspace, MSpec sections |
| `Tooltip` | Blocked phases, confidence hints |
| `Skeleton` | All loading states |
| `EmptyState` | No artifacts, no mappings, etc. |
| `ProgressBar` | Parse, mapping, generation jobs |
| `SplitPane` | Conversion studio, mapping workbench |
| `SearchInput` | MSpec search, mapping filter, model catalog |
| `TreeView` | Generic accessible tree (replace ad-hoc buttons) |

### 4.3 Shared hooks & services

| File | Purpose |
|------|---------|
| `hooks/useJob.ts` | Unified job polling (parse, map, generate, validate) |
| `hooks/useProject.ts` | Project + workflow + invalidate pattern |
| `context/JobTrayContext.tsx` | Global background jobs indicator |
| `context/SelectionContext.tsx` | Linked source/target selection in Convert |
| `services/api.ts` | Extend with workflow, conversion items, bulk mapping |

### 4.4 Design tokens (`index.css`)

- Typography scale: `text-display`, `text-title`, `text-body`, `text-caption`
- Spacing: consistent `4/8/12/16/24` rhythm
- Surface elevation: `surface-0`, `surface-1`, `surface-2`
- Semantic colors for phases: ingest=blue, target=purple, map=pink, convert=amber, deliver=green
- Dark mode CSS variables (prep for Phase 11)

---

## 5. Phase 3 — Backend Data Model & Service Split

**Duration:** 5–7 days  
**Depends on:** Phase 0

### 5.1 Alembic migration `002_production_upgrade.py`

**New columns on `projects`:**
```sql
selected_pluto_model_id VARCHAR(36) FK pluto_models.id NULL
active_mspec_id VARCHAR(36) FK mspec_documents.id NULL
settings JSONB DEFAULT '{}'
owner_id VARCHAR(255) NULL  -- prep for auth
```

**New columns on `pluto_models`:**
```sql
name VARCHAR(255) NOT NULL DEFAULT 'Imported Model'
catalog_id VARCHAR(100) NULL
is_active BOOLEAN DEFAULT FALSE
```

Migrate `_meta` from JSONB into proper columns; strip `_meta` from `model_data`.

**New table `conversion_items`:**
```sql
id, project_id, source_type, source_id, source_name,
source_path JSONB,           -- document/page/block path
target_type, target_id, target_path JSONB,
conversion_step,             -- semantic_mapping | report_structure | visual | measure | filter
status,                      -- pending | in_progress | complete | failed | skipped
mapping_id FK NULL,
error_message TEXT,
metadata JSONB,
created_at, updated_at
UNIQUE(project_id, source_type, source_id)
```

**New table `conversion_runs`:**
```sql
id, project_id, status, progress JSONB, started_at, completed_at, error_message
```

**New table `mspec_versions`:**
```sql
id, project_id, version INT, mspec JSONB, parse_run_id FK, created_at
-- or version mspec_documents with version_number + is_current
```

**New table `artifact_versions`:**
```sql
id, artifact_id, version, storage_path, checksum, created_at
```

### 5.2 Service refactor

| From | To |
|------|-----|
| `project_service.py` (monolith) | Split into `services/*.py` per domain |
| Inline workflow logic | `services/workflow_service.py` |
| Conversion preview only | `services/conversion_service.py` + persist `conversion_items` |

### 5.3 New / updated API endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/projects/{id}/workflow` | Phase status + blockers |
| POST | `/projects/{id}/mapping/run` | Add `?clear=true` to replace all |
| POST | `/projects/{id}/mapping/bulk-approve` | Approve all HIGH confidence |
| GET | `/projects/{id}/mapping/stats` | Coverage, confidence breakdown |
| GET | `/projects/{id}/conversion/items` | Paginated conversion items |
| POST | `/projects/{id}/conversion/run` | Start conversion job (populate items) |
| PATCH | `/projects/{id}/conversion/items/{id}` | Manual override per item |
| GET | `/projects/{id}/conversion/runs/latest` | Conversion job progress |
| GET | `/target-models/catalog` | Global (not per-project) |
| GET | `/projects/{id}/pluto-model/graph` | Nodes + edges for ER diagram |
| GET | `/projects/{id}/mspec/search?q=` | Full-text search in MSpec |
| DELETE | `/projects/{id}/artifacts/{id}` | Remove artifact |
| POST | `/projects/{id}/artifacts/validate` | Pre-parse ZIP validation |

### 5.4 Acceptance

- Migration runs cleanly on existing data
- `is_active` on pluto_models works without `_meta`
- Mapping upsert prevents duplicates
- Conversion items created from MSpec + mappings

---

## 6. Phase 4 — Ingest Workspace

**Duration:** 4–5 days  
**Depends on:** Phase 1, 2, 3 (partial)

### 6.1 Artifacts sub-page

| Feature | Implementation |
|---------|----------------|
| Multi-file upload queue | `UploadQueue` component, sequential upload with progress |
| ZIP manifest preview | Backend: `POST /artifacts/validate` returns file list + manifest check |
| Delete artifact | API + confirm dialog |
| Re-upload replaces version | `artifact_versions` table |
| Pre-parse checklist | Connections, documents count from manifest.json |

**Files:** `pages/ingest/Artifacts.tsx`, `components/ingest/UploadQueue.tsx`, `backend/app/services/artifact_service.py`

### 6.2 Parsing sub-page

| Feature | Implementation |
|---------|----------------|
| Collapsible "simple" vs "expert" view | Expert = 12 categories; Simple = 5 grouped stages |
| Persist expanded state in localStorage | `usePersistedState` |
| Link to MSpec on complete | CTA button → `/ingest/mspec` |
| Re-parse warning dialog | ConfirmDialog explaining MSpec version bump |
| Job in global tray | `useJob` hook |

**Files:** `pages/ingest/Parsing.tsx` (refactor from `Parsing.tsx`)

### 6.3 MSpec sub-page (ingest context)

| Feature | Implementation |
|---------|----------------|
| Full-text search | Backend `GET /mspec/search?q=` + frontend SearchInput |
| Section tabs | Overview, Documents, Queries, Measures, Variables, Filters, Visuals |
| Traceability panel | Show `source.file`, `source.path`, `source.line` |
| Export MSpec JSON | Download button |
| Version selector | If multiple `mspec_versions` |

**Files:** `pages/ingest/Mspec.tsx`, `components/mspec/MspecSearch.tsx`, `components/mspec/TraceabilityBadge.tsx`

### 6.4 Acceptance

- Upload → parse → view MSpec without leaving Ingest phase
- Search finds "CUSTOMER_NAME" across MSpec
- Re-parse creates new version, shows diff count (stretch)

---

## 7. Phase 5 — Target Semantic Workspace

**Duration:** 4–5 days  
**Depends on:** Phase 3

### 7.1 Target model page

| Feature | Implementation |
|---------|----------------|
| Catalog cards with schema preview | Expand card → table/column list |
| Side-by-side model compare | Select 2 catalog models, diff table/column names |
| ER / relationship graph | `react-flow` from `GET /pluto-model/graph` |
| Glossary integrated | Tabs: Models | Glossary on same page |
| Model health score | % of source fields matchable (requires parse complete) |

**Files:** `pages/target/TargetModel.tsx`, `components/target/ModelCatalog.tsx`, `components/target/SchemaGraph.tsx`, `components/target/GlossaryManager.tsx`

### 7.2 Backend

| Task | Detail |
|------|--------|
| `PlutoService.get_graph()` | Return `{ nodes: tables, edges: relationships }` |
| `PlutoService.compute_coverage(project_id)` | Cross-reference MSpec field names vs Pluto columns/synonyms |
| Catalog endpoint global | `GET /api/v1/target-models/catalog` |
| Fix vector index on model switch | Clear + re-index on `set_active` |

### 7.3 Acceptance

- User must select active model before Map phase unlocks
- Graph shows FactOrder → DimCustomer relationship
- Coverage widget: "78% of source fields have candidate target match"

---

## 8. Phase 6 — Mapping Workbench v2

**Duration:** 6–8 days  
**Depends on:** Phase 3, 5

### 8.1 Layout (dual-pane workbench)

```
┌─────────────────────┬─────────────────────┬──────────────────┐
│ Source BO Tree      │ Mapping Grid        │ Target Pluto Tree│
│ (folders/docs/      │ (TanStack Table)    │ (tables/cols/    │
│  fields)            │                     │  measures)       │
│                     │ [Filter] [Bulk]     │                  │
│ click field →       │ sort by confidence  │ click to set     │
│ highlights row        │ approve/reject      │ target for row   │
└─────────────────────┴─────────────────────┴──────────────────┘
```

### 8.2 Features

| Feature | Implementation |
|---------|----------------|
| Source tree from MSpec | Reuse `DocumentHierarchy` + field-level leaves |
| Target tree from Pluto | Reuse `TargetAssetTree` semantic section only |
| Click source field → scroll to mapping row | Shared selection state |
| Click target column → assign to selected mapping | `PATCH /mapping/{id}` |
| Data grid columns | Source, Type, Confidence, Target, Status, Actions |
| Filters | Status, confidence level, source document, unmapped only |
| Bulk approve HIGH | `POST /mapping/bulk-approve?min_confidence=90` |
| Bulk reject LOW | Same pattern |
| Inspector panel | AI reasoning, evidence, MSpec traceability link |
| Keyboard shortcuts | ↑↓ rows, A approve, R reject |

**Files:** `pages/map/MappingWorkbench.tsx`, `components/map/SourceFieldTree.tsx`, `components/map/MappingGrid.tsx`, `components/map/TargetSchemaTree.tsx`, `components/map/MappingInspector.tsx`

### 8.3 Backend

| Task | Detail |
|------|--------|
| `GET /mapping?status=&confidence=&document=` | Query params for filter |
| `POST /mapping/bulk-approve` | Body: `{ min_confidence, source_types }` |
| Evidence links | Include `mspec_path` in mapping `source_context` during orchestrator |
| `MappingService.approve_all_if_complete()` | Set project `MAPPING_APPROVED` |

### 8.4 Acceptance

- Map phase unlocks only when target model selected
- User can map without typing table/column names manually
- Bulk approve 20+ HIGH mappings in one click
- No duplicate rows on re-run

---

## 9. Phase 7 — Conversion Studio v2

**Duration:** 6–8 days  
**Depends on:** Phase 3, 6

### 9.1 Layout (resizable 3-pane + pipeline)

```
┌────────────────────────────────────────────────────────────────┐
│ Conversion Pipeline (horizontal stepper, not JSON dumps)        │
├──────────────┬─────────────────────┬───────────────────────────┤
│ Source Tree  │ MSpec Inspector     │ Target PBI Tree           │
│ (resizable)  │ (resizable)         │ (resizable)               │
│              │                     │                           │
│ select block │ shows block spec    │ shows converted visual    │
│              │ + mapping status    │ + field bindings          │
└──────────────┴─────────────────────┴───────────────────────────┘
│ Conversion Items Table (filterable, per block/field status)    │
└────────────────────────────────────────────────────────────────┘
```

### 9.2 Features

| Feature | Implementation |
|---------|----------------|
| Linked selection | `SelectionContext`: source node ↔ conversion item ↔ target node |
| `POST /conversion/run` job | Populates `conversion_items` from MSpec + approved mappings |
| Per-item status badges | pending / mapped / unsupported / manual |
| Manual override | Inspector: change target visual type or field binding |
| Pipeline stepper UI | Human labels + counts, not `JSON.stringify` |
| Conversion items table | DataTable with filters by step, status, document |
| Re-run conversion | Idempotent upsert on `conversion_items` |

**Files:** `pages/convert/ConversionStudio.tsx`, `components/convert/ConversionStepper.tsx`, `components/convert/ConversionItemsTable.tsx`, `components/convert/LinkedSelectionBridge.tsx`

### 9.3 Backend `ConversionService` extensions

```python
async def run_conversion(project_id) -> ConversionRun:
    # For each document → page → block:
    #   create conversion_item for structure + each field
    #   apply approved mapping to set target_path
    #   set status complete | pending | unsupported

async def list_items(project_id, filters) -> Paginated[ConversionItem]
async def update_item(item_id, target_override) -> ConversionItem
```

### 9.4 Acceptance

- Click BO block → MSpec shows block detail → PBI tree highlights target visual
- Conversion items table shows 100+ items with status
- Pipeline shows "47/52 visuals converted" not raw JSON
- Convert phase unlocks when mapping ≥ 80% approved (configurable)

---

## 10. Phase 8 — Deliver Workspace

**Duration:** 3–4 days  
**Depends on:** Phase 1, 9 (partial)

### 10.1 Deliver landing

Single page with 3 cards: **Generate** | **Validate** | **Results**

Each card shows status (not started / running / complete / failed) and CTA.

### 10.2 Generate sub-page

| Feature | Implementation |
|---------|----------------|
| Pre-flight checklist | Target model ✓, mappings ✓, conversion ✓ |
| Generation progress | Job tray + progress steps |
| Output preview | Tree of generated artifacts before download |
| Moved from Validation | Generate PBI only here |

**Files:** `pages/deliver/Generate.tsx`, `components/deliver/PreflightChecklist.tsx`, `components/deliver/ArtifactPreviewTree.tsx`

### 10.3 Validate sub-page

| Feature | Implementation |
|---------|----------------|
| Structured results (not raw JSON) | Cards: Structural, Mapping, Visual, Manual actions |
| Score breakdown chart | Weighted bar chart from `migration_score_breakdown` |
| Drill-down links | "12 unmapped" → links to Map phase filtered |

**Files:** `pages/deliver/Validate.tsx`, `components/deliver/ScoreBreakdown.tsx`

### 10.4 Results sub-page

| Feature | Implementation |
|---------|----------------|
| Per-artifact download | Not just full ZIP |
| Migration report | Markdown/PDF summary |
| Generated PBI structure tree | From generation job result metadata |
| Publish placeholder | "Connect to Fabric" disabled + coming soon |

### 10.5 Acceptance

- Clear separation: Generate ≠ Validate
- User cannot generate without pre-flight pass (or explicit override)
- Results show artifact tree matching Conversion preview

---

## 11. Phase 9 — Generation & PBI Output (Real Artifacts)

**Duration:** 8–12 days  
**Depends on:** Phase 3, 7

### 11.1 PBIP generator upgrades

| Task | File | Detail |
|------|------|--------|
| Use `documents[]` hierarchy | `pbip_generator.py` | Not flat `reports[]` only |
| Generate semantic model stub | `generators/powerbi/semantic_model_generator.py` | TMDL or JSON model definition |
| Page per `MSpecPage` | `pbip_generator.py` | Tab → report page |
| Visual per `MSpecBlock` | Map BO type → PBI visual JSON |
| Field bindings from `conversion_items` | Read persisted targets |
| `unsupported-items.json` enriched | Include remediation hints |
| `migration-report.md` | Human-readable summary |

### 11.2 Generation metadata API

`GET /projects/{id}/generation-status` returns:
```json
{
  "status": "COMPLETED",
  "artifact_tree": { "semantic_model": {}, "reports": [] },
  "files": [{ "name": "...", "type": "pbip", "size": 1234 }]
}
```

### 11.3 Acceptance

- Generated package includes report pages matching BO document tabs
- Semantic model references correct table.column from mappings
- Download ZIP opens in Power BI Desktop (manual QA checklist)

---

## 12. Phase 10 — Enterprise (Auth, Audit, Multi-tenant)

**Duration:** 10–15 days (can defer post-MVP prod)

### 12.1 Auth

| Task | Detail |
|------|--------|
| OIDC integration (Azure AD) | `fastapi-users` or custom middleware |
| JWT on all `/api/v1/*` | Except `/health` |
| Frontend login page + token refresh | |
| `projects.owner_id` enforcement | |

### 12.2 RBAC

| Role | Permissions |
|------|-------------|
| Viewer | Read all phases |
| Mapper | Approve/reject mappings |
| Engineer | Parse, convert, generate |
| Admin | Delete project, manage models |

### 12.3 Audit

| Task | Detail |
|------|--------|
| `AuditLog` already exists | Wire all approve/reject/parse/generate actions |
| `GET /projects/{id}/audit` | Timeline UI on Overview |
| Export audit CSV | |

### 12.4 Multi-tenant (optional)

- `organization_id` on projects
- Row-level security in queries

---

## 13. Phase 11 — Polish, Performance, Testing

**Duration:** Ongoing, 5–7 days concentrated sprint

### 13.1 Performance

| Area | Action |
|------|--------|
| MSpec search | PostgreSQL JSONB GIN index or dedicated search table |
| Large trees | Virtualized lists (`@tanstack/react-virtual`) |
| API | Pagination on mappings, conversion_items |
| Frontend | Code-split per phase route (`React.lazy`) |

### 13.2 Accessibility

- TreeView: `role="tree"`, `aria-expanded`, keyboard nav
- Focus management in dialogs
- Color contrast audit (WCAG AA)

### 13.3 Testing targets

| Layer | Target |
|-------|--------|
| Backend unit | 80% on services (parse, map, convert, generate) |
| Backend integration | Full pipeline E2E test in Docker |
| Frontend component | Storybook or Vitest for DataTable, TreeView |
| E2E | Playwright: upload → parse → select model → map → convert → download |

### 13.4 DevOps

- GitHub Actions: lint, test, build on PR
- Staging environment with sample data seed
- API docs auto-generated (OpenAPI already from FastAPI)

---

## 14. Dependency Graph

```
Phase 0 (hotfixes)
    ↓
Phase 3 (data model) ←── Phase 2 (design system)
    ↓                        ↓
Phase 1 (shell) ─────────────┘
    ↓
Phase 4 (ingest) ── Phase 5 (target)
              ↘         ↓
               Phase 6 (map)
                    ↓
               Phase 7 (convert)
                    ↓
         Phase 9 (real PBI gen)
                    ↓
               Phase 8 (deliver)
                    ↓
         Phase 10 (enterprise) + Phase 11 (polish)
```

---

## 15. Milestone Timeline

| Milestone | Phases | Duration | Cumulative |
|-----------|--------|----------|------------|
| **M1: Stable MVP** | 0 | 2 days | 2 days |
| **M2: New shell** | 1 + 2 | 8 days | 10 days |
| **M3: Solid backend** | 3 | 7 days | 17 days |
| **M4: Ingest + Target** | 4 + 5 | 9 days | 26 days |
| **M5: Workbench** | 6 | 8 days | 34 days |
| **M6: Conversion studio** | 7 | 8 days | 42 days |
| **M7: Real output** | 9 + 8 | 12 days | 54 days |
| **M8: Enterprise** | 10 + 11 | 15 days | 69 days |

**Team of 2 (1 FE + 1 BE):** ~14 weeks to M7 (production-ready core)  
**Team of 4:** ~8 weeks to M7

---

## 16. Acceptance Criteria (Global)

### User journey (happy path)

1. Create project → land on Overview with "Upload source" CTA
2. Ingest: upload ZIP → parse → search MSpec for a field
3. Target: select catalog model → see ER graph → 75%+ coverage
4. Map: dual-pane workbench → bulk approve HIGH → all approved
5. Convert: 3-pane studio → linked selection → 90%+ items complete
6. Deliver: pre-flight pass → generate → validate → download PBIP
7. Open PBIP in Power BI Desktop → report pages exist with mapped fields

### Non-functional

- [ ] All phases load in < 2s with sample data
- [ ] No duplicate mappings on re-run
- [ ] Workflow API correctly blocks phases
- [ ] 50+ backend tests passing
- [ ] Mobile: sidebar collapses, workspaces stack vertically
- [ ] Error states: toast + retry on all async jobs

---

## Appendix A — File Structure (target)

```
frontend/src/
  components/
    layout/       ProjectShell, PhaseSidebar, ProjectHeader, InspectorPanel, JobTray
    ui/           DataTable, Dialog, Tabs, TreeView, SplitPane, Skeleton, EmptyState
    ingest/       UploadQueue, ParseProgress, SimpleParseView
    target/       ModelCatalog, SchemaGraph, GlossaryManager, CoverageWidget
    map/          SourceFieldTree, MappingGrid, TargetSchemaTree, MappingInspector
    convert/      ConversionStepper, ConversionItemsTable, LinkedSelectionBridge
    mspec/        MspecSearch, MspecSectionView, TraceabilityBadge
    deliver/      PreflightChecklist, ScoreBreakdown, ArtifactPreviewTree
  pages/
    ingest/       Index, Artifacts, Parsing, Mspec
    target/       Index, Explore
    map/          MappingWorkbench
    convert/      ConversionStudio
    deliver/      Index, Generate, Validate, Results
  hooks/          useWorkflow, useJob, useProject, useSelection
  context/        JobTrayContext, SelectionContext

backend/app/
  services/
    project_service.py      (slim CRUD only)
    workflow_service.py
    artifact_service.py
    parse_service.py
    pluto_service.py
    mapping_service.py
    conversion_service.py
    generation_service.py
    validation_service.py
  api/
    workflow.py
    conversion.py         (extended)
    mapping.py              (bulk, filters)
  models/
    conversion_item.py
    conversion_run.py
  alembic/versions/
    002_production_upgrade.py
```

---

## Appendix B — Config additions

```env
# Workflow gates
WORKFLOW_MIN_MAPPING_APPROVAL_PCT=80
WORKFLOW_REQUIRE_TARGET_MODEL=true

# Feature flags
FEATURE_EXPERT_MODE=true
FEATURE_FABRIC_PUBLISH=false
FEATURE_DARK_MODE=false
```

---

## Appendix C — Out of scope (v2+)

- Live BO CMS / BI Launch Pad connector (not file upload)
- Real-time Fabric deployment
- Crystal formula → DAX transpiler (beyond synonym mapping)
- Multi-project portfolio analytics
- Collaborative commenting on mappings

---

*Document version: 1.0 — Generated for BI Loom production upgrade initiative.*
