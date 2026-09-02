"""Progressive BO → Power BI conversion workspace builder."""
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.generators.powerbi.pbi_preview import build_target_tree
from app.models import Mapping, MappingStatus, MSpecDocument, PlutoModel, Project


class ConversionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_workspace(self, project_id: str) -> dict[str, Any]:
        project = await self.db.get(Project, project_id)
        mspec_doc = await self._get_mspec(project_id)
        pluto = await self._get_active_pluto(project_id)
        mappings = await self._get_mappings(project_id)

        mspec = mspec_doc.mspec if mspec_doc else {}
        pluto_data = pluto.model_data if pluto else {}
        mapping_dicts = [self._mapping_to_dict(m) for m in mappings]

        source_tree = self._build_source_tree(mspec)
        target_tree = build_target_tree(mspec, pluto_data, mapping_dicts) if pluto else None
        item_steps = await self._conversion_item_steps(project_id)
        steps = self._build_conversion_steps(mspec, pluto, mappings, target_tree, item_steps)
        mspec_sections = self._build_mspec_sections(mspec) if mspec else None

        return {
            "project_status": project.status.value if project else "UNKNOWN",
            "has_mspec": mspec_doc is not None,
            "has_target_model": pluto is not None,
            "selected_target_model": self._pluto_summary(pluto) if pluto else None,
            "source_tree": source_tree,
            "target_tree": target_tree,
            "conversion_steps": steps,
            "mspec_sections": mspec_sections,
            "mapping_stats": self._mapping_stats(mappings),
            "overall_progress": self._overall_progress(steps),
        }

    async def get_mspec_detail(self, project_id: str, mspec_id: str | None = None) -> dict[str, Any]:
        if mspec_id:
            mspec_doc = await self.db.get(MSpecDocument, mspec_id)
            if not mspec_doc or mspec_doc.project_id != project_id:
                from app.core.exceptions import NotFoundError
                raise NotFoundError(f"MSpec {mspec_id} not found")
        else:
            mspec_doc = await self._get_mspec(project_id)
        if not mspec_doc:
            return {"id": None, "version": None, "mspec": None, "sections": None}
        mspec = mspec_doc.mspec
        return {
            "id": mspec_doc.id,
            "version": mspec_doc.version,
            "mspec": mspec,
            "sections": self._build_mspec_sections(mspec),
            "created_at": mspec_doc.created_at.isoformat() if mspec_doc.created_at else None,
        }

    async def list_mspec_versions(self, project_id: str) -> list[dict]:
        result = await self.db.execute(
            select(MSpecDocument)
            .where(MSpecDocument.project_id == project_id)
            .order_by(MSpecDocument.created_at.desc())
        )
        docs = list(result.scalars().all())
        return [
            {
                "id": d.id,
                "version": d.version,
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "document_count": len(d.mspec.get("documents", [])),
            }
            for d in docs
        ]

    async def _get_mspec(self, project_id: str) -> MSpecDocument | None:
        result = await self.db.execute(
            select(MSpecDocument)
            .where(MSpecDocument.project_id == project_id)
            .order_by(MSpecDocument.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_active_pluto(self, project_id: str) -> PlutoModel | None:
        from app.services.project_service import PlutoService
        return await PlutoService(self.db).get_active(project_id)

    async def _get_mappings(self, project_id: str) -> list[Mapping]:
        result = await self.db.execute(select(Mapping).where(Mapping.project_id == project_id))
        return list(result.scalars().all())

    def _mapping_to_dict(self, m: Mapping) -> dict:
        return {
            "source_name": m.source_name,
            "source_type": m.source_type,
            "target_table": m.target_table,
            "target_column": m.target_column,
            "target_measure": m.target_measure,
            "confidence": m.confidence,
            "status": m.status.value if hasattr(m.status, "value") else m.status,
        }

    def _pluto_summary(self, pluto: PlutoModel) -> dict:
        meta = pluto.model_data.get("_meta", {}) if isinstance(pluto.model_data, dict) else {}
        data = pluto.model_data if isinstance(pluto.model_data, dict) else {}
        return {
            "id": pluto.id,
            "name": getattr(pluto, "name", None) or meta.get("name", "Imported Model"),
            "catalog_id": getattr(pluto, "catalog_id", None) or meta.get("catalog_id"),
            "is_active": bool(getattr(pluto, "is_active", False)),
            "table_count": len(data.get("tables", [])),
            "column_count": len(data.get("columns", [])),
            "measure_count": len(data.get("measures", [])),
        }

    def _build_source_tree(self, mspec: dict) -> dict:
        folders = mspec.get("folders", [])
        documents = mspec.get("documents", [])
        docs_out = []
        for doc in documents:
            pages = []
            for page in doc.get("pages", []):
                blocks = [
                    {
                        "id": b.get("id"),
                        "name": b.get("title") or b.get("type"),
                        "type": b.get("type"),
                        "status": b.get("status", "SUPPORTED"),
                        "field_names": b.get("field_names", []),
                    }
                    for b in page.get("blocks", [])
                ]
                pages.append({
                    "id": page.get("id"),
                    "name": page.get("name"),
                    "type": page.get("page_type", "tab"),
                    "blocks": blocks,
                })
            folder = next((f.get("name") for f in folders if f.get("id") == doc.get("folder_id")), None)
            docs_out.append({
                "id": doc.get("id"),
                "name": doc.get("name"),
                "product_type": doc.get("product_type", "webi"),
                "product_label": doc.get("product_type", "webi").upper(),
                "folder": folder,
                "pages": pages,
                "page_count": len(pages),
                "block_count": sum(len(p["blocks"]) for p in pages),
                "visual_count": len(doc.get("visuals", [])),
                "queries": doc.get("queries", []),
                "measures": [m.get("name") for m in doc.get("measures", [])],
                "variables": [v.get("name") for v in doc.get("variables", [])],
            })

        return {
            "folders": [{"id": f.get("id"), "name": f.get("name"), "path": f.get("path")} for f in folders],
            "documents": docs_out,
            "summary": mspec.get("hierarchy_summary", {}),
            "queries": mspec.get("queries", []),
            "global_measures": mspec.get("measures", []),
            "global_variables": mspec.get("variables", []),
            "global_filters": mspec.get("filters", []),
        }

    def _build_mspec_sections(self, mspec: dict) -> list[dict]:
        sections = [
            {
                "id": "overview",
                "label": "Overview",
                "count": 1,
                "items": [{
                    "version": mspec.get("version"),
                    "project": mspec.get("project"),
                    "source": mspec.get("source"),
                    "hierarchy_summary": mspec.get("hierarchy_summary"),
                }],
            },
            {
                "id": "folders",
                "label": "Folders",
                "count": len(mspec.get("folders", [])),
                "items": mspec.get("folders", []),
            },
            {
                "id": "documents",
                "label": "Documents",
                "count": len(mspec.get("documents", [])),
                "items": mspec.get("documents", []),
            },
            {
                "id": "queries",
                "label": "Queries & SQL",
                "count": len(mspec.get("queries", [])),
                "items": mspec.get("queries", []),
            },
            {
                "id": "measures",
                "label": "Measures",
                "count": len(mspec.get("measures", [])),
                "items": mspec.get("measures", []),
            },
            {
                "id": "variables",
                "label": "Variables & Prompts",
                "count": len(mspec.get("variables", [])),
                "items": mspec.get("variables", []),
            },
            {
                "id": "filters",
                "label": "Filters",
                "count": len(mspec.get("filters", [])),
                "items": mspec.get("filters", []),
            },
            {
                "id": "visuals",
                "label": "Visuals",
                "count": len(mspec.get("visuals", [])),
                "items": mspec.get("visuals", []),
            },
            {
                "id": "dependencies",
                "label": "Dependencies",
                "count": len(mspec.get("dependencies", [])),
                "items": mspec.get("dependencies", []),
            },
            {
                "id": "mappings",
                "label": "MSpec Mappings",
                "count": len(mspec.get("mappings", [])),
                "items": mspec.get("mappings", []),
            },
            {
                "id": "validation",
                "label": "Validation Rules",
                "count": 1 if mspec.get("validation") else 0,
                "items": [mspec.get("validation")] if mspec.get("validation") else [],
            },
        ]
        return sections

    async def _conversion_item_steps(self, project_id: str) -> set[str]:
        from app.models import ConversionItem

        result = await self.db.execute(
            select(ConversionItem.conversion_step)
            .where(ConversionItem.project_id == project_id)
            .distinct()
        )
        done: set[str] = set()
        for (step,) in result.all():
            if step == "visual":
                done.add("visual_conversion")
            elif step:
                done.add(step)
        # Mirror workflow heal: empty filters/variables still complete the step
        if "filters_variables" not in done and {
            "report_structure", "visual_conversion", "measures_formulas"
        }.issubset(done):
            mspec_doc = await self._get_mspec(project_id)
            if mspec_doc:
                data = mspec_doc.mspec or {}
                if not data.get("filters") and not data.get("variables"):
                    done.add("filters_variables")
        return done

    def _step_status_from_items(self, step_id: str, item_steps: set[str], unlocked: bool) -> str:
        if not unlocked:
            return "blocked"
        if step_id in item_steps or (step_id == "visual_conversion" and "visual" in item_steps):
            return "complete"
        return "pending"

    def _build_conversion_steps(
        self,
        mspec: dict,
        pluto: PlutoModel | None,
        mappings: list[Mapping],
        target_tree: dict | None,
        item_steps: set[str] | None = None,
    ) -> list[dict]:
        has_mspec = bool(mspec)
        has_pluto = pluto is not None
        has_mappings = len(mappings) > 0
        approved = [m for m in mappings if m.status in (MappingStatus.APPROVED, MappingStatus.MODIFIED)]
        total_fields = self._count_source_fields(mspec) if mspec else 0
        mapped_fields = len(approved)
        item_steps = item_steps or set()
        map_ready = has_pluto and has_mappings and len(approved) > 0

        steps = [
            {
                "id": "parse",
                "label": "Parse BO Export → MSpec",
                "description": "Extract folders, documents, pages, blocks, queries, measures from SAP BO",
                "status": "complete" if has_mspec else "pending",
                "progress_pct": 100 if has_mspec else 0,
                "items": self._step_items_parse(mspec) if has_mspec else [],
            },
            {
                "id": "target_model",
                "label": "Select Target Semantic Model",
                "description": "Choose Power BI semantic model (Pluto) to map source fields against",
                "status": "complete" if has_pluto else ("blocked" if not has_mspec else "pending"),
                "progress_pct": 100 if has_pluto else 0,
                "items": [self._pluto_summary(pluto)] if pluto else [],
            },
            {
                "id": "semantic_mapping",
                "label": "Semantic Field Mapping",
                "description": "Map BO fields/measures to target model columns and DAX measures",
                "status": self._step_status_mapping(has_pluto, has_mappings, approved, total_fields),
                "progress_pct": round(mapped_fields / total_fields * 100) if total_fields and approved else (100 if has_mappings else 0),
                "items": [
                    {"label": "Total source fields", "value": total_fields},
                    {"label": "Mappings proposed", "value": len(mappings)},
                    {"label": "Approved / modified", "value": len(approved)},
                    {"label": "Pending review", "value": sum(1 for m in mappings if m.status == MappingStatus.PENDING_REVIEW)},
                ],
            },
            {
                "id": "report_structure",
                "label": "Report Structure Conversion",
                "description": "Convert BO documents → PBI reports, pages/tabs → report pages",
                "status": self._step_status_from_items("report_structure", item_steps, has_mspec and map_ready),
                "progress_pct": 100 if "report_structure" in item_steps else 0,
                "items": self._step_items_structure(mspec, target_tree),
            },
            {
                "id": "visual_conversion",
                "label": "Visual & Block Conversion",
                "description": "Map tables, charts, crosstabs, KPIs to Power BI visual types",
                "status": self._step_status_from_items("visual_conversion", item_steps, has_mspec and map_ready),
                "progress_pct": 100 if "visual_conversion" in item_steps or "visual" in item_steps else 0,
                "items": self._step_items_visuals(mspec, target_tree),
            },
            {
                "id": "measures_formulas",
                "label": "Measures & Formulas",
                "description": "Convert BO calculations to DAX measures via semantic mapping",
                "status": self._step_status_from_items("measures_formulas", item_steps, has_mspec and map_ready),
                "progress_pct": 100 if "measures_formulas" in item_steps else 0,
                "items": [{"name": m.get("name"), "expression": m.get("expression"), "aggregation": m.get("aggregation")} for m in mspec.get("measures", [])],
            },
            {
                "id": "filters_variables",
                "label": "Filters & Variables",
                "description": "Convert report filters and prompt variables to PBI slicers/parameters",
                "status": self._step_status_from_items("filters_variables", item_steps, has_mspec and map_ready),
                "progress_pct": 100 if "filters_variables" in item_steps else 0,
                "items": [
                    {"type": "filter", "count": len(mspec.get("filters", []))},
                    {"type": "variable", "count": len(mspec.get("variables", []))},
                ] if has_mspec else [],
            },
        ]
        return steps

    def _count_source_fields(self, mspec: dict) -> int:
        names: set[str] = set()
        for doc in mspec.get("documents", []):
            for page in doc.get("pages", []):
                for block in page.get("blocks", []):
                    names.update(block.get("field_names", []))
            for m in doc.get("measures", []):
                if m.get("name"):
                    names.add(m["name"])
        for report in mspec.get("reports", []):
            for visual in report.get("visuals", []):
                for f in visual.get("fields", []):
                    if f.get("name"):
                        names.add(f["name"])
        for m in mspec.get("measures", []):
            if m.get("name"):
                names.add(m["name"])
        return len(names)

    def _step_status_mapping(self, has_pluto, has_mappings, approved, total) -> str:
        if not has_pluto:
            return "blocked"
        if not has_mappings:
            return "pending"
        if approved and total and len(approved) >= total * 0.8:
            return "complete"
        return "in_progress"

    def _step_status_structure(self, has_mspec, target_tree) -> str:
        if not has_mspec:
            return "blocked"
        if target_tree and target_tree.get("reports"):
            return "in_progress"
        return "pending"

    def _step_status_visuals(self, has_mspec, target_tree) -> str:
        if not has_mspec or not target_tree:
            return "blocked"
        if target_tree.get("summary", {}).get("visuals", 0) > 0:
            return "in_progress"
        return "pending"

    def _structure_progress(self, mspec, target_tree) -> int:
        src_docs = len(mspec.get("documents", [])) or len(mspec.get("reports", []))
        tgt_reports = len(target_tree.get("reports", [])) if target_tree else 0
        if not src_docs:
            return 0
        return min(100, round(tgt_reports / src_docs * 100))

    def _visual_progress(self, mspec, target_tree) -> int:
        if not target_tree:
            return 0
        total = target_tree.get("summary", {}).get("visuals", 0)
        if total == 0:
            return 0
        mapped = 0
        for report in target_tree.get("reports", []):
            for page in report.get("pages", []):
                for visual in page.get("visuals", []):
                    fields = visual.get("fields", [])
                    if fields and all(f.get("status") != "unmapped" for f in fields):
                        mapped += 1
        return round(mapped / total * 100) if total else 0

    def _step_items_parse(self, mspec) -> list:
        summary = mspec.get("hierarchy_summary", {})
        return [
            {"label": "Folders", "value": summary.get("folders", len(mspec.get("folders", [])))},
            {"label": "Documents", "value": summary.get("documents", len(mspec.get("documents", [])))},
            {"label": "Pages", "value": summary.get("pages", 0)},
            {"label": "Blocks", "value": summary.get("blocks", 0)},
            {"label": "Queries", "value": len(mspec.get("queries", []))},
            {"label": "Measures", "value": len(mspec.get("measures", []))},
        ]

    def _step_items_structure(self, mspec, target_tree) -> list:
        items = []
        for doc in mspec.get("documents", []):
            tgt = next((r for r in (target_tree or {}).get("reports", []) if r.get("id") == doc.get("id")), None)
            items.append({
                "source": doc.get("name"),
                "target": tgt.get("name") if tgt else "—",
                "pages": f"{len(doc.get('pages', []))} → {tgt.get('page_count', 0) if tgt else 0}",
                "status": "mapped" if tgt else "pending",
            })
        return items

    def _step_items_visuals(self, mspec, target_tree) -> list:
        items = []
        if not target_tree:
            return items
        for report in target_tree.get("reports", []):
            for page in report.get("pages", []):
                for visual in page.get("visuals", []):
                    unmapped = sum(1 for f in visual.get("fields", []) if f.get("status") == "unmapped")
                    items.append({
                        "report": report.get("name"),
                        "page": page.get("name"),
                        "visual": visual.get("name"),
                        "pbi_type": visual.get("type"),
                        "unmapped_fields": unmapped,
                        "status": visual.get("status"),
                    })
        return items[:20]

    def _mapping_stats(self, mappings: list[Mapping]) -> dict:
        return {
            "total": len(mappings),
            "approved": sum(1 for m in mappings if m.status == MappingStatus.APPROVED),
            "modified": sum(1 for m in mappings if m.status == MappingStatus.MODIFIED),
            "pending": sum(1 for m in mappings if m.status == MappingStatus.PENDING_REVIEW),
            "rejected": sum(1 for m in mappings if m.status == MappingStatus.REJECTED),
        }

    def _overall_progress(self, steps: list[dict]) -> int:
        convert_ids = {
            "report_structure",
            "visual_conversion",
            "measures_formulas",
            "filters_variables",
        }
        convert_steps = [s for s in steps if s.get("id") in convert_ids]
        pool = convert_steps or steps
        if not pool:
            return 0
        return round(sum(s.get("progress_pct", 0) for s in pool) / len(pool))

    async def run_conversion(self, project_id: str, step: str | None = None) -> dict:
        from datetime import datetime, timezone
        from app.core.database import generate_id
        from app.generators.powerbi.pbi_preview import _bo_to_pbi_visual
        from app.models import ConversionItem, ConversionRun

        mspec_doc = await self._get_mspec(project_id)
        if not mspec_doc:
            from app.core.exceptions import ValidationError
            raise ValidationError("MSpec required before conversion")

        pluto = await self._get_active_pluto(project_id)
        if not pluto:
            from app.core.exceptions import ValidationError
            raise ValidationError("Select an active target semantic model before conversion")

        mappings = await self._get_mappings(project_id)
        from app.models import MappingStatus
        pending = sum(1 for m in mappings if m.status == MappingStatus.PENDING_REVIEW)
        reviewed = [
            m for m in mappings
            if m.status in (MappingStatus.APPROVED, MappingStatus.MODIFIED)
        ]
        if not mappings:
            from app.core.exceptions import ValidationError
            raise ValidationError("Run AI mapping and complete review before conversion")
        if pending > 0 or not reviewed:
            from app.core.exceptions import ValidationError
            raise ValidationError(
                "Complete mapping review (approve/reject pending rows) before conversion"
            )
        unmapped = [
            m for m in reviewed
            if not (m.target_table and (m.target_column or m.target_measure))
        ]
        if unmapped:
            from app.core.exceptions import ValidationError
            raise ValidationError(
                f"{len(unmapped)} approved mapping(s) still lack a target — assign or reject before Convert"
            )

        mapping_by_name = {m.source_name.upper(): m for m in mappings}
        mspec = mspec_doc.mspec

        run = ConversionRun(
            id=generate_id(), project_id=project_id, status="RUNNING",
            started_at=datetime.now(timezone.utc),
        )
        self.db.add(run)
        await self.db.flush()

        items_created = 0
        items_updated = 0
        pluto_name = pluto.model_data.get("_meta", {}).get("name") if pluto else None

        steps_to_run = [step] if step else [
            "semantic_mapping", "report_structure", "visual_conversion",
            "measures_formulas", "filters_variables", "generation",
        ]

        for step_id in steps_to_run:
            if step_id in ("parse", "target_model"):
                continue
            if step_id == "semantic_mapping":
                c, u = await self._run_semantic_mapping_step(
                    project_id, run.id, mspec, mapping_by_name,
                )
            elif step_id == "report_structure":
                c, u = await self._run_report_structure_step(
                    project_id, run.id, mspec, pluto_name,
                )
            elif step_id in ("visual_conversion", "visual"):
                c, u = await self._run_visual_step(
                    project_id, run.id, mspec, mapping_by_name, pluto_name,
                )
            elif step_id == "measures_formulas":
                c, u = await self._run_measures_step(
                    project_id, run.id, mspec, mapping_by_name,
                )
            elif step_id == "filters_variables":
                c, u = await self._run_filters_step(project_id, run.id, mspec)
            elif step_id == "generation":
                c, u = await self._run_generation_step(project_id, run.id, mspec)
            else:
                c, u = await self._run_visual_step(
                    project_id, run.id, mspec, mapping_by_name, pluto_name,
                )
            items_created += c
            items_updated += u

        run.status = "COMPLETED"
        run.completed_at = datetime.now(timezone.utc)
        run.progress = {
            "items_created": items_created,
            "items_updated": items_updated,
            "step": step,
        }
        return {
            "conversion_run_id": run.id,
            "items_created": items_created,
            "items_updated": items_updated,
            "step": step,
        }

    async def _run_semantic_mapping_step(
        self, project_id, run_id, mspec, mapping_by_name,
    ) -> tuple[int, int]:
        created, updated = 0, 0
        for doc in mspec.get("documents", []):
            for page in doc.get("pages", []):
                for block in page.get("blocks", []):
                    for fname in block.get("field_names", []):
                        result = await self._upsert_field_item(
                            project_id, run_id, fname, doc, page, block, mapping_by_name,
                        )
                        created += 1 if result == "created" else 0
                        updated += 1 if result == "updated" else 0
        return created, updated

    async def _run_report_structure_step(
        self, project_id, run_id, mspec, pluto_name,
    ) -> tuple[int, int]:
        created, updated = 0, 0
        for doc in mspec.get("documents", []):
            result = await self._upsert_document_item(
                project_id, run_id, doc, pluto_name,
            )
            created += 1 if result == "created" else 0
            updated += 1 if result == "updated" else 0
        return created, updated

    async def _run_visual_step(
        self, project_id, run_id, mspec, mapping_by_name, pluto_name,
    ) -> tuple[int, int]:
        from app.generators.powerbi.pbi_preview import _bo_to_pbi_visual

        created, updated = 0, 0
        for doc in mspec.get("documents", []):
            for page in doc.get("pages", []):
                for block in page.get("blocks", []):
                    result = await self._upsert_conversion_item(
                        project_id, run_id, block, doc, page, mapping_by_name, "visual",
                        pluto_name=pluto_name,
                        pbi_visual_type=_bo_to_pbi_visual(block.get("type", "table")),
                    )
                    created += 1 if result == "created" else 0
                    updated += 1 if result == "updated" else 0
        return created, updated

    async def _run_measures_step(
        self, project_id, run_id, mspec, mapping_by_name,
    ) -> tuple[int, int]:
        created, updated = 0, 0
        measures = list(mspec.get("measures", []))
        for doc in mspec.get("documents", []):
            measures.extend(doc.get("measures", []))
        for measure in measures:
            result = await self._upsert_measure_item(
                project_id, run_id, measure, mapping_by_name,
            )
            created += 1 if result == "created" else 0
            updated += 1 if result == "updated" else 0
        return created, updated

    async def _run_filters_step(self, project_id, run_id, mspec) -> tuple[int, int]:
        created, updated = 0, 0
        for filt in mspec.get("filters", []):
            result = await self._upsert_filter_variable_item(
                project_id, run_id, filt, "filter",
            )
            created += 1 if result == "created" else 0
            updated += 1 if result == "updated" else 0
        for var in mspec.get("variables", []):
            result = await self._upsert_filter_variable_item(
                project_id, run_id, var, "variable",
            )
            created += 1 if result == "created" else 0
            updated += 1 if result == "updated" else 0
        # Empty MSpec filters/variables must still complete the Convert step
        if created + updated == 0:
            result = await self._upsert_empty_filters_marker(project_id, run_id)
            created += 1 if result == "created" else 0
            updated += 1 if result == "updated" else 0
        return created, updated

    async def _upsert_empty_filters_marker(self, project_id, run_id) -> str:
        """Mark filters_variables complete when the source has none."""
        from app.core.database import generate_id
        from app.models import ConversionItem

        source_id = f"filters:none:{project_id}"
        existing = await self.db.execute(
            select(ConversionItem).where(
                ConversionItem.project_id == project_id,
                ConversionItem.source_type == "filter",
                ConversionItem.source_id == source_id,
            )
        )
        item = existing.scalar_one_or_none()
        data = {
            "source_name": "No filters or variables in source",
            "source_path": {"empty": True},
            "conversion_step": "filters_variables",
            "status": "complete",
            "conversion_run_id": run_id,
            "target_path": {"note": "skipped — none in MSpec"},
            "target_type": "filter",
        }
        if item:
            for k, v in data.items():
                setattr(item, k, v)
            return "updated"
        self.db.add(ConversionItem(
            id=generate_id(), project_id=project_id,
            source_type="filter", source_id=source_id, **data,
        ))
        return "created"

    async def _run_generation_step(self, project_id, run_id, mspec) -> tuple[int, int]:
        from app.core.database import generate_id
        from app.models import ConversionItem

        created, updated = 0, 0
        doc_count = len(mspec.get("documents", []))
        source_id = f"gen:{project_id}"
        existing = await self.db.execute(
            select(ConversionItem).where(
                ConversionItem.project_id == project_id,
                ConversionItem.source_type == "generation",
                ConversionItem.source_id == source_id,
            )
        )
        item = existing.scalar_one_or_none()
        data = {
            "source_name": "PBI Package",
            "source_path": {"documents": doc_count},
            "conversion_step": "generation",
            "status": "pending",
            "conversion_run_id": run_id,
            "target_path": {"package": "pbip", "reports": doc_count},
            "target_type": "package",
        }
        if item:
            for k, v in data.items():
                setattr(item, k, v)
            updated += 1
        else:
            self.db.add(ConversionItem(
                id=generate_id(), project_id=project_id,
                source_type="generation", source_id=source_id, **data,
            ))
            created += 1
        return created, updated

    async def _upsert_document_item(self, project_id, run_id, doc, pluto_name) -> str:
        from app.core.database import generate_id
        from app.models import ConversionItem

        source_id = doc.get("id", doc.get("name", ""))
        existing = await self.db.execute(
            select(ConversionItem).where(
                ConversionItem.project_id == project_id,
                ConversionItem.source_type == "document",
                ConversionItem.source_id == source_id,
            )
        )
        item = existing.scalar_one_or_none()
        page_count = len(doc.get("pages", []))
        data = {
            "source_name": doc.get("name", ""),
            "source_path": {"document": doc.get("name"), "pages": page_count},
            "conversion_step": "report_structure",
            "status": "complete",
            "conversion_run_id": run_id,
            "target_path": {
                "report": doc.get("name"),
                "pages": page_count,
                "semantic_model": pluto_name,
            },
            "target_type": "report",
            "target_id": source_id,
        }
        if item:
            for k, v in data.items():
                setattr(item, k, v)
            return "updated"
        self.db.add(ConversionItem(
            id=generate_id(), project_id=project_id,
            source_type="document", source_id=source_id, **data,
        ))
        return "created"

    async def _upsert_measure_item(self, project_id, run_id, measure, mapping_by_name) -> str:
        from app.core.database import generate_id
        from app.models import ConversionItem, MappingStatus

        name = measure.get("name", "")
        source_id = f"measure:{name}"
        existing = await self.db.execute(
            select(ConversionItem).where(
                ConversionItem.project_id == project_id,
                ConversionItem.source_type == "measure",
                ConversionItem.source_id == source_id,
            )
        )
        item = existing.scalar_one_or_none()
        m = mapping_by_name.get(name.upper())
        target_path = None
        status = "pending"
        if m and m.status in (MappingStatus.APPROVED, MappingStatus.MODIFIED):
            status = "complete"
            target_path = {"table": m.target_table, "measure": m.target_measure or name}
        data = {
            "source_name": name,
            "source_path": {"expression": measure.get("expression")},
            "conversion_step": "measures_formulas",
            "status": status,
            "conversion_run_id": run_id,
            "target_path": target_path,
            "mapping_id": m.id if m else None,
        }
        if item:
            for k, v in data.items():
                setattr(item, k, v)
            return "updated"
        self.db.add(ConversionItem(
            id=generate_id(), project_id=project_id,
            source_type="measure", source_id=source_id, **data,
        ))
        return "created"

    async def _upsert_filter_variable_item(self, project_id, run_id, obj, kind) -> str:
        from app.core.database import generate_id
        from app.models import ConversionItem

        name = obj.get("name", "")
        source_id = f"{kind}:{name}"
        existing = await self.db.execute(
            select(ConversionItem).where(
                ConversionItem.project_id == project_id,
                ConversionItem.source_type == kind,
                ConversionItem.source_id == source_id,
            )
        )
        item = existing.scalar_one_or_none()
        pbi_type = "slicer" if kind == "filter" else "parameter"
        data = {
            "source_name": name,
            "source_path": {"type": kind, "definition": obj.get("definition") or obj.get("prompt")},
            "conversion_step": "filters_variables",
            "status": "pending",
            "conversion_run_id": run_id,
            "target_path": {"pbi_type": pbi_type, "name": name},
            "target_type": pbi_type,
        }
        if item:
            for k, v in data.items():
                setattr(item, k, v)
            return "updated"
        self.db.add(ConversionItem(
            id=generate_id(), project_id=project_id,
            source_type=kind, source_id=source_id, **data,
        ))
        return "created"

    async def _upsert_conversion_item(
        self, project_id, run_id, block, doc, page, mapping_by_name, step,
        pluto_name: str | None = None, pbi_visual_type: str | None = None,
    ) -> str:
        from app.core.database import generate_id
        from app.models import ConversionItem

        source_id = block.get("id", "")
        existing = await self.db.execute(
            select(ConversionItem).where(
                ConversionItem.project_id == project_id,
                ConversionItem.source_type == "block",
                ConversionItem.source_id == source_id,
            )
        )
        item = existing.scalar_one_or_none()
        status = "failed" if block.get("status") == "UNSUPPORTED" else (
            "complete" if block.get("status") == "SUPPORTED" else "pending"
        )
        block_title = block.get("title") or block.get("type", "")
        target_path = {
            "report": doc.get("name"),
            "page": page.get("name"),
            "visual": pbi_visual_type or block.get("type", "visual"),
            "semantic_model": pluto_name,
        }
        data = {
            "source_name": block_title,
            "source_path": {"document": doc.get("name"), "page": page.get("name"), "block": block_title},
            "conversion_step": step,
            "status": status,
            "conversion_run_id": run_id,
            "target_path": target_path,
            "target_type": "visual",
            "target_id": source_id,
        }
        if item:
            for k, v in data.items():
                setattr(item, k, v)
            return "updated"
        self.db.add(ConversionItem(
            id=generate_id(), project_id=project_id, source_type="block",
            source_id=source_id, **data,
        ))
        return "created"

    async def _upsert_field_item(
        self, project_id, run_id, fname, doc, page, block, mapping_by_name,
    ) -> str:
        from app.core.database import generate_id
        from app.models import ConversionItem, MappingStatus

        source_id = f"{block.get('id')}:{fname}"
        existing = await self.db.execute(
            select(ConversionItem).where(
                ConversionItem.project_id == project_id,
                ConversionItem.source_type == "field",
                ConversionItem.source_id == source_id,
            )
        )
        item = existing.scalar_one_or_none()
        m = mapping_by_name.get(fname.upper())
        status = "pending"
        mapping_id = None
        target_path = None
        if m and m.status in (MappingStatus.APPROVED, MappingStatus.MODIFIED):
            status = "complete"
            mapping_id = m.id
            target_path = {"table": m.target_table, "column": m.target_column, "measure": m.target_measure}
        elif m:
            status = "in_progress"
            mapping_id = m.id
        data = {
            "source_name": fname,
            "source_path": {"document": doc.get("name"), "page": page.get("name"), "block": block.get("title")},
            "conversion_step": "semantic_mapping",
            "status": status,
            "conversion_run_id": run_id,
            "mapping_id": mapping_id,
            "target_path": target_path,
        }
        if item:
            for k, v in data.items():
                setattr(item, k, v)
            return "updated"
        self.db.add(ConversionItem(
            id=generate_id(), project_id=project_id, source_type="field",
            source_id=source_id, **data,
        ))
        return "created"

    async def list_items(
        self, project_id: str, status: str | None = None, step: str | None = None, limit: int = 100, offset: int = 0,
    ) -> dict:
        from app.models import ConversionItem

        query = select(ConversionItem).where(ConversionItem.project_id == project_id)
        if status:
            query = query.where(ConversionItem.status == status)
        if step:
            query = query.where(ConversionItem.conversion_step == step)
        query = query.order_by(ConversionItem.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        items = list(result.scalars().all())
        return {
            "items": [
                {
                    "id": i.id, "source_type": i.source_type, "source_id": i.source_id,
                    "source_name": i.source_name, "source_path": i.source_path,
                    "conversion_step": i.conversion_step, "status": i.status,
                    "target_path": i.target_path, "mapping_id": i.mapping_id,
                }
                for i in items
            ],
            "count": len(items),
        }

    async def get_latest_run(self, project_id: str):
        from app.models import ConversionRun
        result = await self.db.execute(
            select(ConversionRun).where(ConversionRun.project_id == project_id)
            .order_by(ConversionRun.created_at.desc()).limit(1)
        )
        run = result.scalar_one_or_none()
        if not run:
            return None
        return {
            "id": run.id, "status": run.status, "progress": run.progress,
            "error_message": run.error_message,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        }

    async def update_item(self, project_id: str, item_id: str, updates: dict) -> dict:
        from app.core.exceptions import NotFoundError
        from app.models import ConversionItem

        item = await self.db.get(ConversionItem, item_id)
        if not item or item.project_id != project_id:
            raise NotFoundError(f"Conversion item {item_id} not found")

        allowed = {"status", "target_type", "target_id", "target_path", "error_message", "conversion_step"}
        for key, value in updates.items():
            if key in allowed:
                setattr(item, key, value)

        return {
            "id": item.id, "source_type": item.source_type, "source_id": item.source_id,
            "source_name": item.source_name, "source_path": item.source_path,
            "conversion_step": item.conversion_step, "status": item.status,
            "target_path": item.target_path, "mapping_id": item.mapping_id,
        }

    def search_mspec(self, mspec: dict, query: str) -> list[dict]:
        q = query.lower()
        results = []
        for section, key in [
            ("documents", "documents"), ("measures", "measures"), ("variables", "variables"),
            ("queries", "queries"), ("filters", "filters"),
        ]:
            for item in mspec.get(key, []):
                text = str(item).lower()
                name = str(item.get("name", item.get("id", ""))).lower()
                if q in text or q in name:
                    results.append({"section": section, "item": item})
        return results[:50]
