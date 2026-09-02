"""Workflow phase status and next-action logic for the migration pipeline."""
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Artifact,
    ConversionItem,
    GenerationRun,
    Mapping,
    MappingStatus,
    MSpecDocument,
    ParseRun,
    PlutoModel,
    Project,
    ProjectStatus,
    ValidationRun,
)


PHASES = ("ingest", "target", "map", "convert", "deliver")

# Convert-only steps (Mapping / Generate live in their own phases)
CONVERT_STEP_IDS = (
    "report_structure",
    "visual_conversion",
    "measures_formulas",
    "filters_variables",
)


class WorkflowService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_workflow(self, project_id: str) -> dict[str, Any]:
        project = await self.db.get(Project, project_id)
        if not project:
            from app.core.exceptions import NotFoundError
            raise NotFoundError(f"Project {project_id} not found")

        artifacts = await self._list_artifacts(project_id)
        mspec = await self._get_mspec(project_id)
        parse_run = await self._latest_parse(project_id)
        parse_complete = bool(parse_run and parse_run.status == "COMPLETED")
        parse_report = (parse_run.capability_report or {}) if parse_run else {}
        pending_mspec = bool(parse_report.get("pending_mspec"))
        # True when a fresh draft awaits Generate (first parse or re-parse after MSpec exists)
        mspec_draft_ready = bool(parse_report.get("mspec_ready") and parse_report.get("pending_mspec"))
        pluto = await self._get_active_pluto(project_id)
        mappings = await self._list_mappings(project_id)
        convert_steps_done = await self._convert_steps_done(project_id)
        gen_run = await self._latest_generation(project_id)
        val_run = await self._latest_validation(project_id)

        ingest_status, ingest_blockers = self._ingest_phase(
            artifacts, mspec, project.status,
            parse_complete=parse_complete,
            mspec_draft_ready=mspec_draft_ready,
        )
        target_status, target_blockers = self._target_phase(pluto, ingest_status)
        map_status, map_blockers = self._map_phase(mappings, target_status, pluto)
        convert_status, convert_blockers = self._convert_phase(
            map_status, mspec, convert_steps_done, target_status=target_status,
        )
        deliver_status, deliver_blockers = self._deliver_phase(gen_run, val_run, convert_status)

        phases = [
            self._phase("ingest", "Ingest", "Upload and parse BO export", ingest_status, ingest_blockers, f"/projects/{project_id}/ingest"),
            self._phase("target", "Target", "Select semantic model", target_status, target_blockers, f"/projects/{project_id}/target"),
            self._phase("map", "Mapping", "Review semantic mappings", map_status, map_blockers, f"/projects/{project_id}/map"),
            self._phase("convert", "Convert", "BO → Power BI conversion", convert_status, convert_blockers, f"/projects/{project_id}/convert"),
            self._phase("deliver", "Deliver", "Generate, validate, download", deliver_status, deliver_blockers, f"/projects/{project_id}/deliver"),
        ]

        current_phase = self._current_phase(phases)
        next_action = self._next_action(
            project_id, phases, artifacts, mspec, pluto, mappings, convert_steps_done,
            parse_complete=parse_complete,
            mspec_draft_ready=mspec_draft_ready,
            parse_running=bool(parse_run and parse_run.status in ("PENDING", "RUNNING")),
            parse_failed=bool(parse_run and parse_run.status == "FAILED"),
            pending_mspec=pending_mspec,
            gen_run=gen_run,
            val_run=val_run,
        )

        return {
            "project_id": project_id,
            "project_status": project.status.value,
            "current_phase": current_phase,
            "phases": phases,
            "next_action": next_action,
            "summary": {
                "artifacts": len(artifacts),
                "has_mspec": mspec is not None,
                "has_target_model": pluto is not None,
                "mappings_total": len(mappings),
                "mappings_reviewed": sum(1 for m in mappings if m.status in (MappingStatus.APPROVED, MappingStatus.MODIFIED)),
                "mappings_pending": sum(1 for m in mappings if m.status == MappingStatus.PENDING_REVIEW),
                "convert_steps_done": list(convert_steps_done),
                "convert_complete": convert_status == "complete",
                "generated": gen_run is not None and gen_run.status == "COMPLETED",
                "validated": val_run is not None and val_run.status == "COMPLETED",
            },
        }

    def _phase(self, id_: str, label: str, description: str, status: str, blockers: list[str], route: str) -> dict:
        return {
            "id": id_,
            "label": label,
            "description": description,
            "status": status,
            "blockers": blockers,
            "route": route,
        }

    def _ingest_phase(
        self,
        artifacts: list,
        mspec: MSpecDocument | None,
        project_status: ProjectStatus,
        parse_complete: bool = False,
        mspec_draft_ready: bool = False,
    ) -> tuple[str, list[str]]:
        blockers: list[str] = []
        if not artifacts:
            blockers.append("Upload a Business Objects export")
            return "pending", blockers
        if not parse_complete and project_status not in (
            ProjectStatus.PARSED, ProjectStatus.MAPPING, ProjectStatus.REVIEW_REQUIRED,
            ProjectStatus.MAPPING_APPROVED, ProjectStatus.GENERATING, ProjectStatus.GENERATED,
            ProjectStatus.VALIDATING, ProjectStatus.COMPLETED,
        ):
            blockers.append("Run parsing on the uploaded export")
            return "in_progress", blockers
        # Fresh parse draft waiting to be materialized (including after re-parse)
        if mspec_draft_ready or not mspec:
            blockers.append("Generate MSpec from the parse draft")
            return "in_progress", blockers
        return "complete", []

    def _target_phase(self, pluto: PlutoModel | None, ingest_status: str) -> tuple[str, list[str]]:
        if ingest_status != "complete":
            return "blocked", ["Complete ingest phase first"]
        if not pluto:
            return "pending", ["Select a target semantic model"]
        return "complete", []

    def _map_phase(self, mappings: list[Mapping], target_status: str, pluto: PlutoModel | None) -> tuple[str, list[str]]:
        if target_status != "complete":
            return "blocked", ["Select target semantic model first"]
        if not pluto:
            return "blocked", ["No target model selected"]
        if not mappings:
            return "pending", ["Run AI semantic mapping"]
        pending = sum(1 for m in mappings if m.status == MappingStatus.PENDING_REVIEW)
        if pending > 0:
            return "in_progress", [f"{pending} mapping(s) pending review"]

        def is_mapped(m: Mapping) -> bool:
            return bool(m.target_table and (m.target_column or m.target_measure))

        reviewed = [m for m in mappings if m.status in (MappingStatus.APPROVED, MappingStatus.MODIFIED)]
        if not reviewed:
            return "pending", ["Approve or modify mappings"]
        unmapped_approved = [m for m in reviewed if not is_mapped(m)]
        if unmapped_approved:
            return "in_progress", [
                f"{len(unmapped_approved)} approved/modified row(s) still lack a target — assign or reject"
            ]
        return "complete", []

    def _convert_phase(
        self,
        map_status: str,
        mspec: MSpecDocument | None,
        convert_steps_done: set[str],
        target_status: str = "complete",
    ) -> tuple[str, list[str]]:
        # Defense in depth: Convert stays blocked until Target + Mapping are done
        if target_status != "complete":
            return "blocked", ["Select and confirm a target semantic model first"]
        if map_status != "complete":
            return "blocked", ["Complete mapping review first"]
        if not mspec:
            return "blocked", ["MSpec required"]
        missing = [s for s in CONVERT_STEP_IDS if s not in convert_steps_done]
        if not convert_steps_done:
            return "pending", ["Run conversion steps in Convert studio"]
        if missing:
            labels = {
                "report_structure": "Reports",
                "visual_conversion": "Visuals",
                "measures_formulas": "Measures",
                "filters_variables": "Filters",
            }
            return "in_progress", [f"Complete: {', '.join(labels.get(m, m) for m in missing)}"]
        return "complete", []

    def _deliver_phase(self, gen_run: GenerationRun | None, val_run: ValidationRun | None, convert_status: str) -> tuple[str, list[str]]:
        if convert_status != "complete":
            return "blocked", ["Complete all Convert steps first"]
        if val_run and val_run.status == "COMPLETED":
            return "complete", []
        if val_run and val_run.status in ("PENDING", "RUNNING"):
            return "in_progress", ["Validation in progress"]
        if gen_run and gen_run.status == "COMPLETED":
            return "in_progress", ["Run validation"]
        if gen_run and gen_run.status in ("PENDING", "RUNNING"):
            return "in_progress", ["Generation in progress"]
        if gen_run and gen_run.status == "FAILED":
            return "in_progress", ["Retry PBI generation"]
        return "pending", ["Generate Power BI package"]

    def _current_phase(self, phases: list[dict]) -> str:
        for p in phases:
            if p["status"] in ("pending", "in_progress"):
                return p["id"]
        return "deliver"

    def _next_action(
        self, project_id: str, phases: list[dict], artifacts, mspec, pluto, mappings, convert_steps_done: set[str],
        parse_complete: bool = False,
        mspec_draft_ready: bool = False,
        parse_running: bool = False,
        parse_failed: bool = False,
        pending_mspec: bool = False,
        gen_run: GenerationRun | None = None,
        val_run: ValidationRun | None = None,
    ) -> dict[str, str] | None:
        for p in phases:
            if p["status"] == "blocked":
                continue
            if p["status"] == "complete":
                continue
            if p["id"] == "ingest":
                if not artifacts:
                    return {"label": "Upload BO export", "route": f"/projects/{project_id}/ingest/artifacts", "enabled": True}
                if parse_running:
                    return {"label": "Parsing in progress", "route": f"/projects/{project_id}/ingest/parsing", "enabled": True}
                if not parse_complete or parse_failed:
                    return {
                        "label": "Start Parsing" if not parse_failed else "Retry Parsing",
                        "route": f"/projects/{project_id}/ingest/parsing",
                        "enabled": True,
                    }
                if mspec_draft_ready or not mspec:
                    return {
                        "label": "Generate MSpec",
                        "route": f"/projects/{project_id}/ingest/mspec",
                        "enabled": True,
                    }
                return {"label": "View MSpec", "route": f"/projects/{project_id}/ingest/mspec", "enabled": True}
            if p["id"] == "target":
                return {"label": "Select target model", "route": f"/projects/{project_id}/target", "enabled": True}
            if p["id"] == "map":
                if not mappings:
                    return {"label": "Run AI mapping", "route": f"/projects/{project_id}/map", "enabled": True}
                pending = sum(1 for m in mappings if m.status == MappingStatus.PENDING_REVIEW)
                if pending > 0:
                    return {
                        "label": f"Review mappings ({pending} pending)",
                        "route": f"/projects/{project_id}/map",
                        "enabled": True,
                    }
                reviewed = [
                    m for m in mappings
                    if m.status in (MappingStatus.APPROVED, MappingStatus.MODIFIED)
                ]
                unmapped = [
                    m for m in reviewed
                    if not (m.target_table and (m.target_column or m.target_measure))
                ]
                if unmapped:
                    return {
                        "label": f"Assign targets ({len(unmapped)} unmapped)",
                        "route": f"/projects/{project_id}/map",
                        "enabled": True,
                    }
                return {"label": "Review mappings", "route": f"/projects/{project_id}/map", "enabled": True}
            if p["id"] == "convert":
                for step_id in CONVERT_STEP_IDS:
                    if step_id not in convert_steps_done:
                        return {
                            "label": "Continue conversion",
                            "route": f"/projects/{project_id}/convert?step={step_id}",
                            "enabled": True,
                        }
                return {"label": "Open conversion studio", "route": f"/projects/{project_id}/convert", "enabled": True}
            if p["id"] == "deliver":
                if gen_run and gen_run.status in ("PENDING", "RUNNING"):
                    return {
                        "label": "Generation in progress",
                        "route": f"/projects/{project_id}/deliver/generate",
                        "enabled": True,
                    }
                if not gen_run or gen_run.status != "COMPLETED":
                    label = "Retry PBI generation" if gen_run and gen_run.status == "FAILED" else "Generate PBI package"
                    return {
                        "label": label,
                        "route": f"/projects/{project_id}/deliver/generate",
                        "enabled": True,
                    }
                if val_run and val_run.status in ("PENDING", "RUNNING"):
                    return {
                        "label": "Validation in progress",
                        "route": f"/projects/{project_id}/deliver/validate",
                        "enabled": True,
                    }
                if not val_run or val_run.status != "COMPLETED":
                    label = "Retry validation" if val_run and val_run.status == "FAILED" else "Run validation"
                    return {
                        "label": label,
                        "route": f"/projects/{project_id}/deliver/validate",
                        "enabled": True,
                    }
                return {
                    "label": "View results",
                    "route": f"/projects/{project_id}/deliver/results",
                    "enabled": True,
                }
        return {"label": "View results", "route": f"/projects/{project_id}/deliver/results", "enabled": True}

    async def _latest_parse(self, project_id: str) -> ParseRun | None:
        result = await self.db.execute(
            select(ParseRun).where(ParseRun.project_id == project_id).order_by(ParseRun.created_at.desc()).limit(1)
        )
        return result.scalar_one_or_none()

    async def _list_artifacts(self, project_id: str) -> list[Artifact]:
        result = await self.db.execute(select(Artifact).where(Artifact.project_id == project_id))
        return list(result.scalars().all())

    async def _get_mspec(self, project_id: str) -> MSpecDocument | None:
        result = await self.db.execute(
            select(MSpecDocument).where(MSpecDocument.project_id == project_id).order_by(MSpecDocument.created_at.desc()).limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_active_pluto(self, project_id: str) -> PlutoModel | None:
        from app.services.project_service import PlutoService
        return await PlutoService(self.db).get_active(project_id)

    async def _list_mappings(self, project_id: str) -> list[Mapping]:
        result = await self.db.execute(select(Mapping).where(Mapping.project_id == project_id))
        return list(result.scalars().all())

    async def _convert_steps_done(self, project_id: str) -> set[str]:
        result = await self.db.execute(
            select(ConversionItem.conversion_step).where(ConversionItem.project_id == project_id).distinct()
        )
        done: set[str] = set()
        for (step,) in result.all():
            if step == "visual":
                done.add("visual_conversion")
            elif step in CONVERT_STEP_IDS:
                done.add(step)
        # Heal projects stuck when MSpec has no filters/variables (no items were created)
        if "filters_variables" not in done and {
            "report_structure", "visual_conversion", "measures_formulas"
        }.issubset(done):
            mspec = await self._get_mspec(project_id)
            if mspec:
                data = mspec.mspec or {}
                if not data.get("filters") and not data.get("variables"):
                    done.add("filters_variables")
        return done

    async def _latest_generation(self, project_id: str) -> GenerationRun | None:
        result = await self.db.execute(
            select(GenerationRun).where(GenerationRun.project_id == project_id).order_by(GenerationRun.created_at.desc()).limit(1)
        )
        return result.scalar_one_or_none()

    async def _latest_validation(self, project_id: str) -> ValidationRun | None:
        result = await self.db.execute(
            select(ValidationRun).where(ValidationRun.project_id == project_id).order_by(ValidationRun.created_at.desc()).limit(1)
        )
        return result.scalar_one_or_none()

    def is_phase_accessible(self, workflow: dict, phase_id: str) -> bool:
        phase = next((p for p in workflow["phases"] if p["id"] == phase_id), None)
        if not phase:
            return False
        return phase["status"] != "blocked"
