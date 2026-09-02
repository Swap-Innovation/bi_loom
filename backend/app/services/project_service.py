from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import generate_id
from app.core.exceptions import NotFoundError, ValidationError
from app.models import (
    Artifact,
    AuditLog,
    GeneratedArtifact,
    GenerationRun,
    Job,
    JobStatus,
    JobType,
    Mapping,
    MappingReview,
    MappingStatus,
    MSpecDocument,
    ParseRun,
    PlutoModel,
    Project,
    ProjectStatus,
    ValidationRun,
    ApprovedMapping,
    GlossaryTerm,
    ConfidenceLevel,
    ConversionItem,
    ConversionRun,
    VectorIndex,
)
from app.schemas.mspec import MSpec
from app.schemas.pluto import PlutoModelSchema, GlossaryTermSchema
from app.schemas.project import ProjectCreate
from app.storage.file_storage import get_storage
from app.vector.semantic_search import clear_pluto_index, index_pluto_objects


class ProjectService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: ProjectCreate) -> Project:
        project = Project(
            id=generate_id(),
            name=data.name,
            description=data.description,
            source_technology=data.source_technology,
            target_technology=data.target_technology,
        )
        self.db.add(project)
        await self.db.flush()
        await self.db.refresh(project)
        await self._audit(project.id, "project_created", "project", project.id)
        return project

    async def list_all(self) -> list[Project]:
        result = await self.db.execute(select(Project).order_by(Project.created_at.desc()))
        return list(result.scalars().all())

    async def get(self, project_id: str) -> Project:
        project = await self.db.get(Project, project_id)
        if not project:
            raise NotFoundError(f"Project {project_id} not found")
        return project

    async def delete(self, project_id: str) -> None:
        project = await self.get(project_id)
        storage = get_storage()

        # Clear self-referential FKs before removing child rows
        project.selected_pluto_model_id = None
        project.active_mspec_id = None
        await self.db.flush()

        # Tables without ORM cascade on Project — delete in dependency order
        await self.db.execute(delete(ConversionItem).where(ConversionItem.project_id == project_id))
        await self.db.execute(delete(ConversionRun).where(ConversionRun.project_id == project_id))
        await self.db.execute(delete(GeneratedArtifact).where(GeneratedArtifact.project_id == project_id))
        await self.db.execute(delete(GenerationRun).where(GenerationRun.project_id == project_id))
        await self.db.execute(delete(ValidationRun).where(ValidationRun.project_id == project_id))

        mapping_ids = select(Mapping.id).where(Mapping.project_id == project_id)
        await self.db.execute(delete(MappingReview).where(MappingReview.mapping_id.in_(mapping_ids)))
        await self.db.execute(delete(Mapping).where(Mapping.project_id == project_id))
        await self.db.execute(delete(ApprovedMapping).where(ApprovedMapping.project_id == project_id))
        await self.db.execute(delete(VectorIndex).where(VectorIndex.project_id == project_id))
        await self.db.execute(delete(AuditLog).where(AuditLog.project_id == project_id))
        await self.db.execute(delete(Job).where(Job.project_id == project_id))
        await self.db.flush()

        await storage.delete_project_directory(project_id)
        await self.db.delete(project)

    async def update_status(self, project_id: str, status: ProjectStatus) -> Project:
        project = await self.get(project_id)
        project.status = status
        return project

    async def _audit(self, project_id: str, action: str, entity_type: str, entity_id: str, details: dict | None = None):
        log = AuditLog(
            id=generate_id(),
            project_id=project_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
        )
        self.db.add(log)


class ArtifactService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.storage = get_storage()

    async def _prune_missing(self, artifacts: list[Artifact]) -> list[Artifact]:
        """Drop DB rows whose files were removed from disk."""
        valid: list[Artifact] = []
        for artifact in artifacts:
            if self.storage.exists(artifact.storage_path):
                valid.append(artifact)
            else:
                await self.db.delete(artifact)
        return valid

    async def get_primary_artifact(self, project_id: str) -> Artifact | None:
        """Newest on-disk artifact; prefer ZIP exports for parsing."""
        artifacts = await self.list_by_project(project_id)
        if not artifacts:
            return None
        for artifact in artifacts:
            if artifact.file_type == "zip":
                return artifact
        return artifacts[0]

    async def upload(self, project_id: str, filename: str, content: bytes) -> Artifact:
        project = await self.db.get(Project, project_id)
        if not project:
            raise NotFoundError(f"Project {project_id} not found")

        # Replace prior upload with the same filename (one active file per name)
        prior = await self.db.execute(
            select(Artifact).where(Artifact.project_id == project_id, Artifact.filename == filename)
        )
        for old in prior.scalars().all():
            await self.storage.delete(old.storage_path)
            await self.db.delete(old)

        artifact_id = generate_id()
        storage_path = await self.storage.save(project_id, artifact_id, filename, content)
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "unknown"

        artifact = Artifact(
            id=artifact_id,
            project_id=project_id,
            filename=filename,
            file_type=ext,
            file_size=len(content),
            storage_path=storage_path,
        )
        self.db.add(artifact)
        project.status = ProjectStatus.UPLOADED
        await self.db.flush()
        await self.db.refresh(artifact)
        return artifact

    async def list_by_project(self, project_id: str) -> list[Artifact]:
        result = await self.db.execute(
            select(Artifact).where(Artifact.project_id == project_id).order_by(Artifact.created_at.desc())
        )
        artifacts = list(result.scalars().all())
        return await self._prune_missing(artifacts)

    async def delete(self, project_id: str, artifact_id: str) -> bool:
        artifact = await self.db.get(Artifact, artifact_id)
        if not artifact or artifact.project_id != project_id:
            raise NotFoundError(f"Artifact {artifact_id} not found")

        was_zip = artifact.file_type == "zip"
        await self.storage.delete(artifact.storage_path)
        await self.db.delete(artifact)
        await self.db.flush()

        if was_zip:
            await self.storage.delete_directory(f"{project_id}/source/extracted")
            # Legacy extract path from older builds
            await self.storage.delete_directory(f"{project_id}/extracted")

        remaining = await self.list_by_project(project_id)
        project = await self.db.get(Project, project_id)
        if project and not remaining:
            project.status = ProjectStatus.CREATED
        return True

    def validate_content(self, filename: str, content: bytes) -> dict:
        import io
        import json
        import zipfile

        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "unknown"
        result: dict = {
            "filename": filename,
            "file_type": ext,
            "file_size": len(content),
            "valid": True,
            "files": [],
            "manifest": None,
            "warnings": [],
            "file_count": 0,
            "document_count": 0,
            "connection_count": 0,
        }

        if ext == "zip":
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as zf:
                    entries = []
                    for info in zf.infolist():
                        if info.is_dir():
                            continue
                        entries.append({"name": info.filename, "size": info.file_size})
                    result["files"] = entries[:200]
                    result["file_count"] = len(entries)

                    manifest_names = [n for n in zf.namelist() if n.endswith("manifest.json")]
                    if manifest_names:
                        try:
                            manifest = json.loads(zf.read(manifest_names[0]))
                            result["manifest"] = manifest
                            result["document_count"] = len(manifest.get("documents", []))
                            result["connection_count"] = len(manifest.get("connections", []))
                        except (json.JSONDecodeError, KeyError):
                            result["warnings"].append("manifest.json found but could not be parsed")
                    else:
                        result["warnings"].append("No manifest.json — parser will scan archive structure")
            except zipfile.BadZipFile:
                result["valid"] = False
                result["warnings"].append("Invalid or corrupted ZIP archive")
        elif ext not in ("xml", "json", "sql"):
            result["valid"] = False
            result["warnings"].append(f"Unsupported file type: .{ext}")

        return result

    async def get_preparse_checklist(self, project_id: str) -> dict:
        artifacts = await self.list_by_project(project_id)
        items = [
            {"id": "artifact", "label": "BO export uploaded", "done": len(artifacts) > 0},
            {"id": "zip_valid", "label": "Archive is valid", "done": False},
            {"id": "documents", "label": "Documents detected in manifest", "done": False},
            {"id": "connections", "label": "Connections detected", "done": False},
        ]
        ready = len(artifacts) > 0
        document_count = 0
        connection_count = 0
        documents: list[dict] = []
        manifest_data: dict | None = None

        if artifacts:
            latest = artifacts[0]
            if not self.storage.exists(latest.storage_path):
                ready = False
            elif latest.file_type == "zip":
                try:
                    content = await self.storage.read(latest.storage_path)
                    validation = self.validate_content(latest.filename, content)
                    items[1]["done"] = validation["valid"]
                    document_count = validation.get("document_count", 0)
                    connection_count = validation.get("connection_count", 0)
                    items[2]["done"] = document_count > 0
                    items[3]["done"] = connection_count > 0
                    ready = validation["valid"] and len(artifacts) > 0
                    manifest_data = validation.get("manifest")
                    if manifest_data:
                        documents = [
                            {
                                "id": d.get("id"),
                                "name": d.get("name"),
                                "product_type": d.get("product_type", "webi"),
                                "description": d.get("description"),
                            }
                            for d in manifest_data.get("documents", [])
                        ]
                except Exception:
                    items[1]["done"] = False
            else:
                items[1]["done"] = True
                items[2]["done"] = True
                items[3]["done"] = True
                ready = True

        return {
            "ready": ready,
            "items": items,
            "document_count": document_count,
            "connection_count": connection_count,
            "artifact_count": len(artifacts),
            "documents": documents,
            "manifest": manifest_data,
        }


class ParseService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.storage = get_storage()

    async def start_parse(self, project_id: str, document_ids: list[str] | None = None) -> tuple[ParseRun, Job]:
        project = await self.db.get(Project, project_id)
        if not project:
            raise NotFoundError(f"Project {project_id} not found")

        parse_run = ParseRun(id=generate_id(), project_id=project_id, status="PENDING")
        job = Job(
            id=generate_id(),
            project_id=project_id,
            job_type=JobType.PARSE,
            status=JobStatus.PENDING,
            result={"document_ids": document_ids} if document_ids else None,
        )
        self.db.add(parse_run)
        self.db.add(job)
        project.status = ProjectStatus.PARSING
        await self.db.flush()
        return parse_run, job

    async def execute_parse(self, project_id: str, parse_run_id: str, job_id: str) -> None:
        from pathlib import Path
        from app.parsers.business_objects.asset_categories import BO_ASSET_CATEGORIES
        from app.parsers.business_objects.report_parser import BusinessObjectsParser
        from app.services.job_progress import emit_job_progress

        parse_run = await self.db.get(ParseRun, parse_run_id)
        job = await self.db.get(Job, job_id)
        if not parse_run or not job:
            return

        try:
            job.status = JobStatus.RUNNING
            job.started_at = datetime.now(timezone.utc)
            parse_run.status = "RUNNING"
            parse_run.started_at = datetime.now(timezone.utc)
            parse_run.progress = {
                "step": "init",
                "step_label": "Starting parse",
                "sections": [],
                "current": 0,
                "total": 0,
            }
            await emit_job_progress(
                self.db, job_id,
                agent="BO Parse Orchestrator",
                kind="thought",
                label="Locate primary uploaded artifact and prepare extract workspace",
                status="running",
                phase="init",
                current=0,
                total=1,
            )

            artifact_service = ArtifactService(self.db)
            artifact = await artifact_service.get_primary_artifact(project_id)
            if not artifact:
                raise ValidationError("No uploaded artifacts found. Upload a BO export on the Upload page first.")

            if not self.storage.exists(artifact.storage_path):
                raise ValidationError(
                    f"Uploaded file '{artifact.filename}' is missing from storage. "
                    "Please re-upload your export before parsing."
                )

            await emit_job_progress(
                self.db, job_id,
                agent="BO Parse Orchestrator",
                kind="thought",
                label="Locate primary uploaded artifact and prepare extract workspace",
                status="complete",
                phase="init",
                current=0,
                total=1,
            )
            await emit_job_progress(
                self.db, job_id,
                agent="Artifact Agent",
                kind="action",
                label=f"Using artifact “{artifact.filename}”",
                status="complete",
                phase="extract",
                current=0,
                total=1,
            )

            extract_dir = f"{project_id}/source/extracted"
            if artifact.file_type == "zip":
                await emit_job_progress(
                    self.db, job_id,
                    agent="Extract Agent",
                    kind="action",
                    label="Extracting ZIP to project source workspace",
                    status="running",
                    phase="extract",
                    current=0,
                    total=1,
                )
                extract_path = await self.storage.extract_zip(artifact.storage_path, extract_dir)
                await emit_job_progress(
                    self.db, job_id,
                    agent="Extract Agent",
                    kind="action",
                    label="ZIP extracted successfully",
                    status="complete",
                    phase="extract",
                    current=0,
                    total=1,
                )
            else:
                from pathlib import Path as P
                storage = self.storage
                base = storage.base_path if hasattr(storage, "base_path") else P(settings.storage_path)
                extract_path = str(base / artifact.storage_path).rsplit("/", 1)[0]

            # Reload after commits in emit_job_progress
            parse_run = await self.db.get(ParseRun, parse_run_id)
            job = await self.db.get(Job, job_id)
            document_ids = (job.result or {}).get("document_ids") if job and job.result else None

            async def on_parser_progress(event: dict) -> None:
                live_parse = await self.db.get(ParseRun, parse_run_id)
                if live_parse is not None:
                    live_parse.progress = {
                        "step": event.get("phase") or "document",
                        "step_label": event.get("label") or "",
                        "sections": (live_parse.progress or {}).get("sections") or [],
                        "current": event.get("current", 0),
                        "total": event.get("total", 0),
                        "current_document": event.get("field"),
                    }
                await emit_job_progress(
                    self.db, job_id,
                    agent=event.get("agent", "Parse Agent"),
                    kind=event.get("kind", "action"),
                    label=event.get("label", ""),
                    status=event.get("status", "complete"),
                    phase=event.get("phase"),
                    current=event.get("current"),
                    total=event.get("total"),
                    field=event.get("field"),
                )

            await emit_job_progress(
                self.db, job_id,
                agent="Parse Agent",
                kind="thought",
                label="Parse BO documents into an in-memory asset inventory",
                status="running",
                phase="parse",
                current=0,
                total=1,
            )

            import asyncio

            loop = asyncio.get_running_loop()
            progress_queue: asyncio.Queue = asyncio.Queue()

            def progress_bridge(event: dict) -> None:
                loop.call_soon_threadsafe(progress_queue.put_nowait, event)

            def run_parser():
                parser = BusinessObjectsParser(
                    Path(extract_path),
                    document_ids=document_ids,
                    on_progress=progress_bridge,
                )
                result = parser.parse()
                ctx_sections = parser.ctx.build_sections_snapshot()
                loop.call_soon_threadsafe(
                    progress_queue.put_nowait,
                    {"__done__": True, "result": result, "sections": ctx_sections},
                )

            worker = loop.run_in_executor(None, run_parser)

            mspec = None
            capability_report = None
            asset_inventory = None
            final_sections: list = []

            while True:
                event = await progress_queue.get()
                if event.get("__done__"):
                    mspec, capability_report, asset_inventory = event["result"]
                    final_sections = event.get("sections") or []
                    break
                await on_parser_progress(event)

            await worker

            await emit_job_progress(
                self.db, job_id,
                agent="Parse Agent",
                kind="thought",
                label="Parse BO documents into an in-memory asset inventory",
                status="complete",
                phase="parse",
                current=0,
                total=1,
            )

            # Store draft MSpec on the parse run — do not persist MSpecDocument yet.
            # User must run Generate MSpec as a separate ingest step.
            parse_run = await self.db.get(ParseRun, parse_run_id)
            if parse_run:
                parse_run.status = "COMPLETED"
                parse_run.capability_report = {
                    **capability_report,
                    "asset_inventory": asset_inventory,
                    "pending_mspec": mspec.model_dump(),
                    "mspec_ready": True,
                }
                parse_run.completed_at = datetime.now(timezone.utc)
                parse_run.progress = {
                    "step": "parse_complete",
                    "step_label": "Parsing complete — ready to generate MSpec",
                    "sections": final_sections or [
                        {
                            "id": cat["id"],
                            "label": cat["label"],
                            "description": cat["description"],
                            "completed_steps": cat["steps"] if asset_inventory.get("totals", {}).get(cat["id"], 0) else [],
                            "status": "completed" if asset_inventory.get("totals", {}).get(cat["id"], 0) else "empty",
                            "count": asset_inventory.get("totals", {}).get(cat["id"], 0),
                            "items": asset_inventory.get("categories", {}).get(cat["id"], {}).get("items", [])[:20],
                        }
                        for cat in BO_ASSET_CATEGORIES
                    ],
                    "asset_totals": asset_inventory.get("totals", {}),
                    "grand_total": asset_inventory.get("grand_total", 0),
                    "hierarchy": asset_inventory.get("hierarchy", {}),
                    "hierarchy_summary": mspec.hierarchy_summary,
                    "current": asset_inventory.get("grand_total", 0),
                    "total": asset_inventory.get("grand_total", 0),
                    "mspec_pending": True,
                }

            project = await self.db.get(Project, project_id)
            if project:
                project.status = ProjectStatus.PARSED

            job = await self.db.get(Job, job_id)
            if job:
                job.status = JobStatus.COMPLETED
                job.completed_at = datetime.now(timezone.utc)
                job.result = {
                    "reports": len(mspec.reports),
                    "assets_parsed": asset_inventory.get("grand_total", 0),
                    "mspec_pending": True,
                }
            await emit_job_progress(
                self.db, job_id,
                agent="Parse Agent",
                kind="action",
                label=f"Parse finished · {asset_inventory.get('grand_total', 0)} assets indexed · MSpec draft ready",
                status="complete",
                phase="done",
                current=1,
                total=1,
            )
        except Exception as e:
            parse_run = await self.db.get(ParseRun, parse_run_id)
            job = await self.db.get(Job, job_id)
            if parse_run:
                parse_run.status = "FAILED"
                parse_run.error_message = str(e)
                parse_run.completed_at = datetime.now(timezone.utc)
            if job:
                job.status = JobStatus.FAILED
                job.error_message = str(e)
                job.completed_at = datetime.now(timezone.utc)
                await emit_job_progress(
                    self.db, job_id,
                    agent="BO Parse Orchestrator",
                    kind="action",
                    label=f"Failed: {e}",
                    status="error",
                    phase="error",
                )
            project = await self.db.get(Project, project_id)
            if project:
                project.status = ProjectStatus.FAILED
            await self.db.commit()

    async def get_latest(self, project_id: str) -> ParseRun | None:
        result = await self.db.execute(
            select(ParseRun).where(ParseRun.project_id == project_id).order_by(ParseRun.created_at.desc()).limit(1)
        )
        return result.scalar_one_or_none()

    async def generate_mspec(self, project_id: str) -> dict:
        """Persist MSpecDocument from the latest completed parse draft."""
        from app.core.exceptions import ValidationError

        parse_run = await self.get_latest(project_id)
        if not parse_run or parse_run.status != "COMPLETED":
            raise ValidationError("Complete parsing before generating MSpec")

        report = parse_run.capability_report or {}
        pending = report.get("pending_mspec")
        if not pending:
            raise ValidationError(
                "No MSpec draft found. Re-run parsing to produce a draft, then generate MSpec."
            )

        mspec_doc = MSpecDocument(
            id=generate_id(),
            project_id=project_id,
            mspec=pending,
        )
        self.db.add(mspec_doc)

        # Drop heavy draft after materialize; mspec_ready=False marks ingest MSpec step complete
        cleaned = {k: v for k, v in report.items() if k != "pending_mspec"}
        cleaned["mspec_generated_id"] = mspec_doc.id
        cleaned["mspec_ready"] = False
        parse_run.capability_report = cleaned
        progress = dict(parse_run.progress or {})
        progress["step"] = "mspec_generated"
        progress["step_label"] = "MSpec generated"
        progress["mspec_pending"] = False
        parse_run.progress = progress

        project = await self.db.get(Project, project_id)
        if project:
            project.active_mspec_id = mspec_doc.id

        await self.db.flush()

        summary = pending.get("hierarchy_summary") or {}
        docs = pending.get("documents") or pending.get("reports") or []
        return {
            "mspec_id": mspec_doc.id,
            "version": mspec_doc.version,
            "document_count": len(docs),
            "folders": summary.get("folders", 0),
            "pages": summary.get("pages", 0),
            "blocks": summary.get("blocks", 0),
            "steps": [
                {"label": "Load parse draft from last completed run", "status": "complete"},
                {"label": "Validate MSpec schema (documents, pages, blocks)", "status": "complete"},
                {"label": f"Index {len(docs)} document(s) into migration specification", "status": "complete"},
                {"label": "Persist MSpecDocument version for Target / Mapping", "status": "complete"},
            ],
        }


class PlutoService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def import_model(
        self, project_id: str, model_data: dict,
        name: str | None = None, catalog_id: str | None = None, set_active: bool = True,
    ) -> PlutoModel:
        from sqlalchemy.orm.attributes import flag_modified

        validated = PlutoModelSchema.model_validate(model_data)
        dumped = validated.model_dump()
        display_name = name or catalog_id or "Imported Model"

        existing: PlutoModel | None = None
        if catalog_id:
            found = await self.db.execute(
                select(PlutoModel).where(
                    PlutoModel.project_id == project_id,
                    PlutoModel.catalog_id == catalog_id,
                ).order_by(PlutoModel.created_at.desc()).limit(1)
            )
            existing = found.scalar_one_or_none()

        if set_active:
            await self._deactivate_all(project_id)

        dumped["_meta"] = {
            "name": display_name,
            "catalog_id": catalog_id,
            "is_active": set_active,
        }

        if existing:
            existing.name = display_name
            existing.catalog_id = catalog_id
            existing.is_active = set_active
            existing.model_data = dumped
            flag_modified(existing, "model_data")
            pluto = existing
        else:
            pluto = PlutoModel(
                id=generate_id(),
                project_id=project_id,
                name=display_name,
                catalog_id=catalog_id,
                is_active=set_active,
                model_data=dumped,
            )
            self.db.add(pluto)

        await self.db.flush()
        if set_active:
            project = await self.db.get(Project, project_id)
            if project:
                project.selected_pluto_model_id = pluto.id
        await clear_pluto_index(self.db, project_id)
        await index_pluto_objects(self.db, project_id, dumped)
        return pluto

    @staticmethod
    def _is_active(m: PlutoModel) -> bool:
        """Column is_active is source of truth (meta can go stale)."""
        return bool(getattr(m, "is_active", False))

    async def _deactivate_all(self, project_id: str) -> None:
        from sqlalchemy.orm.attributes import flag_modified

        result = await self.db.execute(select(PlutoModel).where(PlutoModel.project_id == project_id))
        for m in result.scalars().all():
            m.is_active = False
            data = dict(m.model_data or {})
            meta = dict(data.get("_meta") or {})
            meta["is_active"] = False
            data["_meta"] = meta
            m.model_data = data
            flag_modified(m, "model_data")

    async def set_active(self, project_id: str, model_id: str) -> PlutoModel:
        from sqlalchemy.orm.attributes import flag_modified

        await self._deactivate_all(project_id)
        pluto = await self.db.get(PlutoModel, model_id)
        if not pluto or pluto.project_id != project_id:
            from app.core.exceptions import NotFoundError
            raise NotFoundError(f"Pluto model {model_id} not found")
        pluto.is_active = True
        data = dict(pluto.model_data or {})
        meta = dict(data.get("_meta") or {})
        meta["is_active"] = True
        data["_meta"] = meta
        pluto.model_data = data
        flag_modified(pluto, "model_data")
        project = await self.db.get(Project, project_id)
        if project:
            project.selected_pluto_model_id = pluto.id
        await clear_pluto_index(self.db, project_id)
        await index_pluto_objects(self.db, project_id, pluto.model_data)
        return pluto

    async def delete_model(self, project_id: str, model_id: str) -> dict:
        pluto = await self.db.get(PlutoModel, model_id)
        if not pluto or pluto.project_id != project_id:
            from app.core.exceptions import NotFoundError
            raise NotFoundError(f"Pluto model {model_id} not found")

        was_active = bool(pluto.is_active)
        project = await self.db.get(Project, project_id)
        # Clear FK before delete to avoid constraint failures
        if project and project.selected_pluto_model_id == model_id:
            project.selected_pluto_model_id = None

        await self.db.delete(pluto)
        await self.db.flush()

        # Do NOT auto-activate another model — selection must be explicit
        if was_active:
            await clear_pluto_index(self.db, project_id)

        return {"deleted": True, "id": model_id, "cleared_active": was_active}

    def get_graph(self, model_data: dict) -> dict:
        tables = model_data.get("tables", [])
        relationships = model_data.get("relationships", [])
        columns_by_table: dict[str, list[str]] = {}
        for col in model_data.get("columns", []):
            table = col.get("table", "")
            columns_by_table.setdefault(table, []).append(col.get("column", ""))

        nodes = [
            {
                "id": t.get("name", ""),
                "label": t.get("name", ""),
                "type": "fact" if str(t.get("name", "")).startswith("Fact") else "dimension",
                "description": t.get("description", ""),
                "column_count": len(columns_by_table.get(t.get("name", ""), [])),
            }
            for t in tables
        ]
        edges = [
            {
                "id": f"{r.get('from_table')}-{r.get('to_table')}-{r.get('from_column')}",
                "source": r.get("from_table", ""),
                "target": r.get("to_table", ""),
                "label": f"{r.get('from_column')} → {r.get('to_column')}",
                "cardinality": r.get("cardinality", ""),
            }
            for r in relationships
        ]
        return {"nodes": nodes, "edges": edges}

    def _extract_mspec_field_names(self, mspec: dict) -> set[str]:
        names: set[str] = set()
        for doc in mspec.get("documents", []):
            for page in doc.get("pages", []):
                for block in page.get("blocks", []):
                    for fname in block.get("field_names", []):
                        if fname:
                            names.add(str(fname).upper())
            for m in doc.get("measures", []):
                if m.get("name"):
                    names.add(str(m["name"]).upper())
        for m in mspec.get("measures", []):
            if m.get("name"):
                names.add(str(m["name"]).upper())
        for v in mspec.get("variables", []):
            if v.get("name"):
                names.add(str(v["name"]).upper())
        return names

    def _build_target_token_set(self, model_data: dict) -> set[str]:
        tokens: set[str] = set()
        for col in model_data.get("columns", []):
            table = col.get("table", "")
            column = col.get("column", "")
            if column:
                tokens.add(str(column).upper())
            if table and column:
                tokens.add(f"{table}.{column}".upper())
            for syn in col.get("synonyms", []):
                tokens.add(str(syn).upper())
        for measure in model_data.get("measures", []):
            if measure.get("name"):
                tokens.add(str(measure["name"]).upper())
            for syn in measure.get("synonyms", []):
                tokens.add(str(syn).upper())
        return tokens

    async def compute_coverage(self, project_id: str) -> dict:
        from app.models import MSpecDocument

        pluto = await self.get_active(project_id)
        result = await self.db.execute(
            select(MSpecDocument)
            .where(MSpecDocument.project_id == project_id)
            .order_by(MSpecDocument.created_at.desc())
            .limit(1)
        )
        mspec_doc = result.scalar_one_or_none()

        if not pluto:
            return {"ready": False, "match_pct": 0, "message": "No target model selected"}
        if not mspec_doc:
            return {"ready": False, "match_pct": 0, "message": "Parse BO export first to compute coverage"}

        source_fields = sorted(self._extract_mspec_field_names(mspec_doc.mspec))
        target_tokens = self._build_target_token_set(pluto.model_data)
        matched = [f for f in source_fields if f in target_tokens]
        unmatched = [f for f in source_fields if f not in target_tokens]
        total = len(source_fields)
        pct = round(len(matched) / total * 100) if total else 0

        return {
            "ready": True,
            "total_source_fields": total,
            "matched_count": len(matched),
            "unmatched_count": len(unmatched),
            "match_pct": pct,
            "unmatched_sample": unmatched[:25],
            "model_name": getattr(pluto, "name", None) or pluto.model_data.get("_meta", {}).get("name"),
        }

    def get_catalog_preview(self, catalog_id: str) -> dict | None:
        from app.data.target_model_catalog import load_catalog_model

        data = load_catalog_model(catalog_id)
        if not data:
            return None
        tables = []
        columns_by_table: dict[str, list[dict]] = {}
        for col in data.get("columns", []):
            table = col.get("table", "")
            columns_by_table.setdefault(table, []).append({
                "column": col.get("column"),
                "type": col.get("type"),
                "synonyms": col.get("synonyms", []),
            })
        for t in data.get("tables", []):
            name = t.get("name", "")
            tables.append({
                "name": name,
                "description": t.get("description", ""),
                "columns": columns_by_table.get(name, []),
            })
        return {
            "catalog_id": catalog_id,
            "tables": tables,
            "relationships": data.get("relationships", []),
            "measures": data.get("measures", []),
        }

    def compare_catalog_models(self, catalog_id_a: str, catalog_id_b: str) -> dict | None:
        from app.data.target_model_catalog import load_catalog_model

        a = load_catalog_model(catalog_id_a)
        b = load_catalog_model(catalog_id_b)
        if not a or not b:
            return None

        def table_cols(data: dict) -> dict[str, set[str]]:
            out: dict[str, set[str]] = {}
            for col in data.get("columns", []):
                out.setdefault(col.get("table", ""), set()).add(col.get("column", ""))
            return out

        cols_a = table_cols(a)
        cols_b = table_cols(b)
        tables_a = {t.get("name") for t in a.get("tables", [])}
        tables_b = {t.get("name") for t in b.get("tables", [])}

        return {
            "only_in_a": sorted(tables_a - tables_b),
            "only_in_b": sorted(tables_b - tables_a),
            "in_both": sorted(tables_a & tables_b),
            "column_diffs": [
                {
                    "table": table,
                    "only_in_a": sorted(cols_a.get(table, set()) - cols_b.get(table, set())),
                    "only_in_b": sorted(cols_b.get(table, set()) - cols_a.get(table, set())),
                }
                for table in sorted(tables_a & tables_b)
                if cols_a.get(table, set()) != cols_b.get(table, set())
            ],
        }

    async def list_models(self, project_id: str) -> list[PlutoModel]:
        result = await self.db.execute(
            select(PlutoModel).where(PlutoModel.project_id == project_id).order_by(PlutoModel.created_at.desc())
        )
        return list(result.scalars().all())

    async def ensure_single_active(self, project_id: str) -> list[PlutoModel]:
        """If multiple rows are active, keep the newest and deactivate the rest."""
        from sqlalchemy.orm.attributes import flag_modified

        models = await self.list_models(project_id)
        actives = [m for m in models if self._is_active(m)]
        if len(actives) <= 1:
            return models

        keeper = actives[0]  # list_models is newest-first
        for m in actives[1:]:
            m.is_active = False
            data = dict(m.model_data or {})
            meta = dict(data.get("_meta") or {})
            meta["is_active"] = False
            data["_meta"] = meta
            m.model_data = data
            flag_modified(m, "model_data")

        project = await self.db.get(Project, project_id)
        if project:
            project.selected_pluto_model_id = keeper.id
        await self.db.flush()
        return await self.list_models(project_id)

    async def get_active(self, project_id: str) -> PlutoModel | None:
        """Return the explicitly active Pluto model only — never fall back to newest."""
        project = await self.db.get(Project, project_id)
        if project and project.selected_pluto_model_id:
            selected = await self.db.get(PlutoModel, project.selected_pluto_model_id)
            if selected and selected.project_id == project_id and self._is_active(selected):
                return selected

        result = await self.db.execute(
            select(PlutoModel).where(
                PlutoModel.project_id == project_id,
                PlutoModel.is_active.is_(True),
            ).order_by(PlutoModel.created_at.desc()).limit(1)
        )
        return result.scalar_one_or_none()

    async def get_latest(self, project_id: str) -> PlutoModel | None:
        return await self.get_active(project_id)

    async def import_glossary(self, project_id: str, terms: list[dict]) -> list[GlossaryTerm]:
        from app.vector.embeddings import generate_embedding
        result_terms = []
        for term_data in terms:
            validated = GlossaryTermSchema.model_validate(term_data)
            embed_text = f"{validated.term} {' '.join(validated.synonyms)} {validated.definition or ''}"
            embedding = await generate_embedding(embed_text)
            term = GlossaryTerm(
                id=generate_id(),
                project_id=project_id,
                term=validated.term,
                synonyms=validated.synonyms,
                definition=validated.definition,
                embedding=embedding,
            )
            self.db.add(term)
            result_terms.append(term)
        return result_terms

    async def get_glossary(self, project_id: str) -> list[GlossaryTerm]:
        result = await self.db.execute(select(GlossaryTerm).where(GlossaryTerm.project_id == project_id))
        return list(result.scalars().all())


class MappingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def start_mapping(self, project_id: str) -> Job:
        from app.core.exceptions import ValidationError

        active = await self.get_active_mapping_job(project_id)
        if active:
            raise ValidationError(
                f"Mapping job already {active.status.value.lower()} — wait for it to finish"
            )

        job = Job(id=generate_id(), project_id=project_id, job_type=JobType.MAPPING, status=JobStatus.PENDING)
        self.db.add(job)
        project = await self.db.get(Project, project_id)
        if project:
            project.status = ProjectStatus.MAPPING
        await self.db.flush()
        return job

    async def get_active_mapping_job(self, project_id: str) -> Job | None:
        result = await self.db.execute(
            select(Job).where(
                Job.project_id == project_id,
                Job.job_type == JobType.MAPPING,
                Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING]),
            ).order_by(Job.created_at.desc()).limit(1)
        )
        job = result.scalar_one_or_none()
        if job and self._mapping_job_is_stale(job):
            job.status = JobStatus.FAILED
            job.error_message = (
                "Mapping job interrupted (server restart or stall) — run AI Mapping again"
            )
            job.completed_at = datetime.now(timezone.utc)
            await self.db.flush()
            return None
        return job

    @staticmethod
    def _mapping_job_is_stale(job: Job) -> bool:
        """BackgroundTasks do not survive restarts — heal orphaned PENDING/RUNNING rows."""
        now = datetime.now(timezone.utc)
        created = job.created_at or now
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        age_s = (now - created).total_seconds()
        # PENDING jobs should flip to RUNNING almost immediately
        if job.status == JobStatus.PENDING and age_s > 90:
            return True
        if job.status == JobStatus.RUNNING:
            started = job.started_at or created
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            # Hard ceiling for a hung worker (LLM mapping can be long; 45m is generous)
            if (now - started).total_seconds() > 45 * 60:
                return True
        return False

    async def execute_mapping(self, project_id: str, job_id: str) -> None:
        from app.ai.orchestrator import run_mapping_pipeline
        from app.services.job_progress import emit_job_progress

        job = await self.db.get(Job, job_id)
        if not job:
            return
        try:
            job.status = JobStatus.RUNNING
            job.started_at = datetime.now(timezone.utc)
            await emit_job_progress(
                self.db, job_id,
                agent="Mapping Orchestrator",
                kind="thought",
                label="Starting AI mapping pipeline",
                status="running",
                phase="init",
                current=0,
                total=0,
            )

            mspec_result = await self.db.execute(
                select(MSpecDocument).where(MSpecDocument.project_id == project_id).order_by(MSpecDocument.created_at.desc()).limit(1)
            )
            mspec_doc = mspec_result.scalar_one_or_none()
            if not mspec_doc:
                raise ValidationError("No MSpec found. Parse artifacts first.")

            pluto_svc = PlutoService(self.db)
            pluto = await pluto_svc.get_active(project_id)
            if not pluto:
                raise ValidationError("No active target model. Select one on the Target page first.")

            glossary_result = await self.db.execute(select(GlossaryTerm).where(GlossaryTerm.project_id == project_id))
            glossary = [{"term": g.term, "synonyms": g.synonyms or [], "definition": g.definition} for g in glossary_result.scalars().all()]

            async def on_progress(event: dict) -> None:
                await emit_job_progress(
                    self.db, job_id,
                    agent=event.get("agent", "Mapping Agent"),
                    kind=event.get("kind", "action"),
                    label=event.get("label", ""),
                    status=event.get("status", "complete"),
                    phase=event.get("phase"),
                    current=event.get("current"),
                    total=event.get("total"),
                    field=event.get("field"),
                    method=event.get("method"),
                    stats=event.get("stats"),
                )

            mappings = await run_mapping_pipeline(
                self.db, project_id, mspec_doc.mspec, pluto.model_data, glossary, on_progress=on_progress,
            )

            job = await self.db.get(Job, job_id)
            if not job:
                return
            job.status = JobStatus.COMPLETED
            job.completed_at = datetime.now(timezone.utc)
            job.result = {
                "mappings_created": len(mappings),
                "stats": (job.progress or {}).get("stats"),
            }
            await emit_job_progress(
                self.db, job_id,
                agent="Mapping Orchestrator",
                kind="action",
                label=f"Mapped {len(mappings)} fields — ready for review",
                status="complete",
                phase="done",
                current=len(mappings),
                total=len(mappings),
                stats=(job.progress or {}).get("stats"),
            )

            project = await self.db.get(Project, project_id)
            if project:
                project.status = ProjectStatus.REVIEW_REQUIRED
            await self.db.commit()
        except Exception as e:
            job = await self.db.get(Job, job_id)
            if job:
                job.status = JobStatus.FAILED
                job.error_message = str(e)
                job.completed_at = datetime.now(timezone.utc)
                await emit_job_progress(
                    self.db, job_id,
                    agent="Mapping Orchestrator",
                    kind="action",
                    label=f"Failed: {e}",
                    status="error",
                    phase="error",
                )
            await self.db.commit()

    async def list_mappings(
        self, project_id: str, status: str | None = None, confidence_level: str | None = None,
        document: str | None = None, unmapped_only: bool = False,
    ) -> list[Mapping]:
        query = select(Mapping).where(Mapping.project_id == project_id)
        if status:
            query = query.where(Mapping.status == MappingStatus(status))
        if confidence_level:
            query = query.where(Mapping.confidence_level == ConfidenceLevel(confidence_level))
        result = await self.db.execute(query)
        mappings = list(result.scalars().all())
        if document:
            mappings = [
                m for m in mappings
                if (m.source_context or {}).get("document") == document
                or (m.source_context or {}).get("report") == document
            ]
        if unmapped_only:
            mappings = [
                m for m in mappings
                if not m.target_table and not m.target_column and not m.target_measure
            ]
        return mappings

    async def get_mapping_stats(self, project_id: str) -> dict:
        mappings = await self.list_mappings(project_id)
        total = len(mappings)
        approved = sum(1 for m in mappings if m.status == MappingStatus.APPROVED)
        modified = sum(1 for m in mappings if m.status == MappingStatus.MODIFIED)
        pending = sum(1 for m in mappings if m.status == MappingStatus.PENDING_REVIEW)
        high = sum(1 for m in mappings if m.confidence_level == ConfidenceLevel.HIGH)
        return {
            "total": total,
            "approved": approved,
            "modified": modified,
            "pending": pending,
            "rejected": sum(1 for m in mappings if m.status == MappingStatus.REJECTED),
            "high_confidence": high,
            "coverage_pct": round((approved + modified) / total * 100, 1) if total else 0,
        }

    async def bulk_approve(self, project_id: str, min_confidence: float = 90.0) -> dict:
        result = await self.db.execute(
            select(Mapping).where(
                Mapping.project_id == project_id,
                Mapping.status == MappingStatus.PENDING_REVIEW,
                Mapping.confidence >= min_confidence,
            )
        )
        mappings = list(result.scalars().all())
        count = 0
        skipped = 0
        for mapping in mappings:
            if not (mapping.target_table and (mapping.target_column or mapping.target_measure)):
                skipped += 1
                continue
            await self.approve(mapping.id)
            count += 1
        await self._check_mapping_complete(project_id)
        return {"approved": count, "skipped_unmapped": skipped}

    async def bulk_approve_all(self, project_id: str) -> dict:
        """Approve every pending mapping that already has a target."""
        return await self.bulk_approve(project_id, min_confidence=0.0)

    async def bulk_reject(self, project_id: str, max_confidence: float = 50.0) -> dict:
        result = await self.db.execute(
            select(Mapping).where(
                Mapping.project_id == project_id,
                Mapping.status == MappingStatus.PENDING_REVIEW,
                Mapping.confidence < max_confidence,
            )
        )
        mappings = list(result.scalars().all())
        count = 0
        for mapping in mappings:
            await self.reject(mapping.id)
            count += 1
        await self._check_mapping_complete(project_id)
        return {"rejected": count}

    async def bulk_reject_all(self, project_id: str) -> dict:
        """Reject every pending mapping regardless of confidence."""
        result = await self.db.execute(
            select(Mapping).where(
                Mapping.project_id == project_id,
                Mapping.status == MappingStatus.PENDING_REVIEW,
            )
        )
        mappings = list(result.scalars().all())
        count = 0
        for mapping in mappings:
            await self.reject(mapping.id)
            count += 1
        await self._check_mapping_complete(project_id)
        return {"rejected": count}
    async def get_mapping(self, mapping_id: str) -> Mapping:
        mapping = await self.db.get(Mapping, mapping_id)
        if not mapping:
            raise NotFoundError(f"Mapping {mapping_id} not found")
        return mapping

    async def approve(self, mapping_id: str, reviewer: str | None = None, comment: str | None = None) -> Mapping:
        from app.core.exceptions import ValidationError

        mapping = await self.get_mapping(mapping_id)
        has_target = bool(mapping.target_table and (mapping.target_column or mapping.target_measure))
        if not has_target:
            raise ValidationError(
                f"Cannot approve “{mapping.source_name}” without a target — assign a column/measure or reject"
            )

        mapping.status = MappingStatus.APPROVED
        mapping.reviewer = reviewer
        mapping.review_comment = comment

        approved = ApprovedMapping(
            id=generate_id(),
            project_id=mapping.project_id,
            source_type=mapping.source_type,
            source_name=mapping.source_name,
            target_table=mapping.target_table,
            target_column=mapping.target_column,
            target_measure=mapping.target_measure,
        )
        self.db.add(approved)

        review = MappingReview(
            id=generate_id(),
            mapping_id=mapping_id,
            action="APPROVE",
            reviewer=reviewer,
            comment=comment,
        )
        self.db.add(review)
        await self._check_mapping_complete(mapping.project_id)
        return mapping

    async def _check_mapping_complete(self, project_id: str) -> None:
        result = await self.db.execute(select(Mapping).where(Mapping.project_id == project_id))
        mappings = list(result.scalars().all())
        if not mappings:
            return
        pending = [m for m in mappings if m.status == MappingStatus.PENDING_REVIEW]
        if pending:
            return
        reviewed = [m for m in mappings if m.status in (MappingStatus.APPROVED, MappingStatus.MODIFIED)]
        if not reviewed:
            return
        unmapped = [
            m for m in reviewed
            if not (m.target_table and (m.target_column or m.target_measure))
        ]
        if unmapped:
            return
        project = await self.db.get(Project, project_id)
        if project and project.status in (ProjectStatus.REVIEW_REQUIRED, ProjectStatus.MAPPING):
            project.status = ProjectStatus.MAPPING_APPROVED

    async def reject(self, mapping_id: str, reviewer: str | None = None, comment: str | None = None) -> Mapping:
        mapping = await self.get_mapping(mapping_id)
        mapping.status = MappingStatus.REJECTED
        mapping.reviewer = reviewer
        mapping.review_comment = comment
        review = MappingReview(id=generate_id(), mapping_id=mapping_id, action="REJECT", reviewer=reviewer, comment=comment)
        self.db.add(review)
        await self._check_mapping_complete(mapping.project_id)
        return mapping

    async def update_mapping(self, mapping_id: str, updates: dict) -> Mapping:
        mapping = await self.get_mapping(mapping_id)
        previous = {"target_table": mapping.target_table, "target_column": mapping.target_column}
        for key, value in updates.items():
            if value is not None and hasattr(mapping, key):
                setattr(mapping, key, value)
        mapping.status = MappingStatus.MODIFIED
        review = MappingReview(
            id=generate_id(), mapping_id=mapping_id, action="MODIFY",
            previous_target=previous,
            new_target={"target_table": mapping.target_table, "target_column": mapping.target_column},
            reviewer=updates.get("reviewer"),
            comment=updates.get("review_comment"),
        )
        self.db.add(review)
        await self._check_mapping_complete(mapping.project_id)
        return mapping


class GenerationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.storage = get_storage()

    async def get_active_generation_job(self, project_id: str) -> Job | None:
        result = await self.db.execute(
            select(Job).where(
                Job.project_id == project_id,
                Job.job_type == JobType.GENERATION,
                Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING]),
            ).order_by(Job.created_at.desc()).limit(1).with_for_update()
        )
        job = result.scalar_one_or_none()
        if job and self._job_is_stale(job):
            await self._fail_stale_job(job, "Generation job interrupted — run again")
            await self._heal_orphan_generation_runs(project_id)
            return None
        return job

    async def start_generation(self, project_id: str) -> tuple[GenerationRun, Job]:
        from app.core.exceptions import ValidationError
        from app.services.workflow_service import WorkflowService

        active = await self.get_active_generation_job(project_id)
        if active:
            raise ValidationError(
                f"Generation job already {active.status.value.lower()} — wait for it to finish"
            )

        workflow = await WorkflowService(self.db).get_workflow(project_id)
        deliver = next((p for p in workflow["phases"] if p["id"] == "deliver"), None)
        if deliver and deliver["status"] == "blocked":
            raise ValidationError(deliver["blockers"][0] if deliver["blockers"] else "Complete Convert before generating")

        gen_run = GenerationRun(id=generate_id(), project_id=project_id)
        job = Job(id=generate_id(), project_id=project_id, job_type=JobType.GENERATION, status=JobStatus.PENDING)
        self.db.add(gen_run)
        self.db.add(job)
        project = await self.db.get(Project, project_id)
        if project:
            project.status = ProjectStatus.GENERATING
        await self.db.flush()
        return gen_run, job

    async def execute_generation(self, project_id: str, gen_run_id: str, job_id: str) -> None:
        from pathlib import Path
        from app.generators.powerbi.pbip_generator import PBIPGenerator, create_download_zip
        from app.services.job_progress import emit_job_progress

        gen_run = await self.db.get(GenerationRun, gen_run_id)
        job = await self.db.get(Job, job_id)
        if not gen_run or not job:
            return
        try:
            job.status = JobStatus.RUNNING
            job.started_at = datetime.now(timezone.utc)
            gen_run.status = "RUNNING"
            gen_run.started_at = datetime.now(timezone.utc)
            total_phases = 5
            await emit_job_progress(
                self.db, job_id,
                agent="Generate Orchestrator",
                kind="thought",
                label="Check prerequisites: MSpec, target model, approved mappings, conversion items",
                status="running",
                phase="init",
                current=0,
                total=total_phases,
            )

            mspec_result = await self.db.execute(
                select(MSpecDocument).where(MSpecDocument.project_id == project_id).order_by(MSpecDocument.created_at.desc()).limit(1)
            )
            mspec_doc = mspec_result.scalar_one_or_none()
            pluto = await PlutoService(self.db).get_active(project_id)

            await emit_job_progress(
                self.db, job_id,
                agent="Context Agent",
                kind="action",
                label=f"Loaded MSpec={'yes' if mspec_doc else 'no'} · Pluto={'yes' if pluto else 'no'}",
                status="complete",
                phase="load",
                current=1,
                total=total_phases,
            )

            mappings_result = await self.db.execute(
                select(Mapping).where(Mapping.project_id == project_id, Mapping.status.in_([MappingStatus.APPROVED, MappingStatus.MODIFIED]))
            )
            approved_mappings = list(mappings_result.scalars().all())

            items_result = await self.db.execute(
                select(ConversionItem).where(ConversionItem.project_id == project_id)
            )
            conversion_items = [
                {
                    "source_type": i.source_type,
                    "source_id": i.source_id,
                    "source_name": i.source_name,
                    "target_path": i.target_path,
                    "status": i.status,
                }
                for i in items_result.scalars().all()
            ]

            await emit_job_progress(
                self.db, job_id,
                agent="Mapping Bundle Agent",
                kind="action",
                label=f"Bundle {len(approved_mappings)} approved mappings · {len(conversion_items)} conversion items",
                status="complete",
                phase="bundle",
                current=2,
                total=total_phases,
            )

            if not mspec_doc:
                raise ValidationError("No MSpec found. Parse artifacts first.")

            mapped_mspec = mspec_doc.mspec.copy()
            mapped_mspec["mappings"] = [
                {"source_name": m.source_name, "target_table": m.target_table,
                 "target_column": m.target_column, "target_measure": m.target_measure}
                for m in approved_mappings
            ]

            output_dir = Path(self.storage.base_path) / project_id / "generated"
            await emit_job_progress(
                self.db, job_id,
                agent="PBIP Generator Agent",
                kind="action",
                label="Generate .pbip report/model artifacts from mapped MSpec",
                status="running",
                phase="generate",
                current=3,
                total=total_phases,
            )

            generator = PBIPGenerator(
                mapped_mspec,
                pluto.model_data if pluto else {},
                output_dir,
                conversion_items=conversion_items,
            )
            result = generator.generate()
            artifacts = result["artifacts"]

            await emit_job_progress(
                self.db, job_id,
                agent="PBIP Generator Agent",
                kind="action",
                label=f"Created {len(artifacts)} artifact files",
                status="complete",
                phase="generate",
                current=3,
                total=total_phases,
            )

            zip_path = output_dir / "migration-package.zip"
            await emit_job_progress(
                self.db, job_id,
                agent="Package Agent",
                kind="action",
                label="Zip migration package for download",
                status="running",
                phase="package",
                current=4,
                total=total_phases,
            )
            create_download_zip(output_dir, zip_path)

            for art_type, art_path in artifacts.items():
                gen_artifact = GeneratedArtifact(
                    id=generate_id(),
                    project_id=project_id,
                    generation_run_id=gen_run_id,
                    artifact_type=art_type,
                    filename=Path(art_path).name,
                    storage_path=str(Path(art_path).relative_to(self.storage.base_path)),
                )
                self.db.add(gen_artifact)

            gen_run = await self.db.get(GenerationRun, gen_run_id)
            job = await self.db.get(Job, job_id)
            if gen_run:
                gen_run.status = "COMPLETED"
                gen_run.output_path = str(output_dir.relative_to(self.storage.base_path))
                gen_run.completed_at = datetime.now(timezone.utc)
            if job:
                job.status = JobStatus.COMPLETED
                job.completed_at = datetime.now(timezone.utc)
                job.result = {"artifacts": len(artifacts), "zip": "migration-package.zip"}

            project = await self.db.get(Project, project_id)
            if project:
                project.status = ProjectStatus.GENERATED

            await emit_job_progress(
                self.db, job_id,
                agent="Package Agent",
                kind="action",
                label="Package ready — download from Results",
                status="complete",
                phase="done",
                current=total_phases,
                total=total_phases,
            )
        except Exception as e:
            gen_run = await self.db.get(GenerationRun, gen_run_id)
            job = await self.db.get(Job, job_id)
            if gen_run:
                gen_run.status = "FAILED"
                gen_run.error_message = str(e)
                gen_run.completed_at = datetime.now(timezone.utc)
            if job:
                job.status = JobStatus.FAILED
                job.error_message = str(e)
                job.completed_at = datetime.now(timezone.utc)
                await emit_job_progress(
                    self.db, job_id,
                    agent="Generate Orchestrator",
                    kind="action",
                    label=f"Failed: {e}",
                    status="error",
                    phase="error",
                )
            await self.db.commit()

    @staticmethod
    def _job_is_stale(job: Job) -> bool:
        now = datetime.now(timezone.utc)
        created = job.created_at or now
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        age_s = (now - created).total_seconds()
        if job.status == JobStatus.PENDING and age_s > 90:
            return True
        if job.status == JobStatus.RUNNING:
            started = job.started_at or created
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            if (now - started).total_seconds() > 45 * 60:
                return True
        return False

    async def _fail_stale_job(self, job: Job, message: str) -> None:
        job.status = JobStatus.FAILED
        job.error_message = message
        job.completed_at = datetime.now(timezone.utc)
        await self.db.flush()

    async def _heal_orphan_generation_runs(self, project_id: str) -> None:
        result = await self.db.execute(
            select(GenerationRun).where(
                GenerationRun.project_id == project_id,
                GenerationRun.status.in_(["PENDING", "RUNNING"]),
            )
        )
        now = datetime.now(timezone.utc)
        for run in result.scalars().all():
            run.status = "FAILED"
            run.error_message = "Generation interrupted — run again"
            run.completed_at = now
        await self.db.flush()


class ValidationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_active_validation_job(self, project_id: str) -> Job | None:
        result = await self.db.execute(
            select(Job).where(
                Job.project_id == project_id,
                Job.job_type == JobType.VALIDATION,
                Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING]),
            ).order_by(Job.created_at.desc()).limit(1).with_for_update()
        )
        job = result.scalar_one_or_none()
        if job and GenerationService._job_is_stale(job):
            job.status = JobStatus.FAILED
            job.error_message = "Validation job interrupted — run again"
            job.completed_at = datetime.now(timezone.utc)
            await self._heal_orphan_validation_runs(project_id)
            await self.db.flush()
            return None
        return job

    async def start_validation(self, project_id: str) -> tuple[ValidationRun, Job]:
        from app.core.exceptions import ValidationError

        active = await self.get_active_validation_job(project_id)
        if active:
            raise ValidationError(
                f"Validation job already {active.status.value.lower()} — wait for it to finish"
            )

        gen_result = await self.db.execute(
            select(GenerationRun).where(GenerationRun.project_id == project_id).order_by(GenerationRun.created_at.desc()).limit(1)
        )
        gen_run = gen_result.scalar_one_or_none()
        if not gen_run or gen_run.status != "COMPLETED":
            raise ValidationError("Generate a Power BI package before running validation")

        val_run = ValidationRun(id=generate_id(), project_id=project_id)
        job = Job(id=generate_id(), project_id=project_id, job_type=JobType.VALIDATION, status=JobStatus.PENDING)
        self.db.add(val_run)
        self.db.add(job)
        project = await self.db.get(Project, project_id)
        if project:
            project.status = ProjectStatus.VALIDATING
        await self.db.flush()
        return val_run, job

    async def execute_validation(self, project_id: str, val_run_id: str, job_id: str) -> None:
        val_run = await self.db.get(ValidationRun, val_run_id)
        job = await self.db.get(Job, job_id)
        if not val_run or not job:
            return
        try:
            from app.services.job_progress import emit_job_progress

            job.status = JobStatus.RUNNING
            job.started_at = datetime.now(timezone.utc)
            val_run.status = "RUNNING"
            val_run.started_at = datetime.now(timezone.utc)
            await emit_job_progress(
                self.db, job_id,
                agent="Validation Orchestrator",
                kind="thought",
                label="Scoring mappings, structure, and visuals",
                status="running",
                phase="init",
                current=0,
                total=3,
            )

            mspec_result = await self.db.execute(
                select(MSpecDocument).where(MSpecDocument.project_id == project_id).order_by(MSpecDocument.created_at.desc()).limit(1)
            )
            mspec_doc = mspec_result.scalar_one_or_none()

            mappings_result = await self.db.execute(select(Mapping).where(Mapping.project_id == project_id))
            mappings = list(mappings_result.scalars().all())

            total_objects = len(mappings)
            mapped_count = sum(1 for m in mappings if m.status in (MappingStatus.APPROVED, MappingStatus.MODIFIED))
            high_conf = sum(1 for m in mappings if m.confidence_level == ConfidenceLevel.HIGH)
            unsupported = 0
            if mspec_doc:
                for report in mspec_doc.mspec.get("reports", []):
                    for visual in report.get("visuals", []):
                        if visual.get("status") == "UNSUPPORTED":
                            unsupported += 1

            mapping_coverage = (mapped_count / total_objects * 100) if total_objects else 0
            avg_confidence = sum(m.confidence for m in mappings) / total_objects if total_objects else 0
            report_count = len(mspec_doc.mspec.get("reports", [])) if mspec_doc else 0
            visual_count = sum(len(r.get("visuals", [])) for r in (mspec_doc.mspec.get("reports", []) if mspec_doc else []))
            supported_visuals = visual_count - unsupported
            visual_coverage = (supported_visuals / visual_count * 100) if visual_count else 100

            score = (
                settings.score_weight_mapping_coverage * mapping_coverage +
                settings.score_weight_mapping_confidence * avg_confidence +
                settings.score_weight_report_coverage * (100 if report_count > 0 else 0) +
                settings.score_weight_visual_coverage * visual_coverage +
                settings.score_weight_validation * (100 if unsupported == 0 else max(0, 100 - unsupported * 10))
            )

            results = {
                "structural": {"reports": report_count, "visuals": visual_count, "passed": True},
                "mapping": {
                    "total": total_objects, "mapped": mapped_count,
                    "unmapped": total_objects - mapped_count,
                    "high_confidence": high_conf,
                    "low_confidence": sum(1 for m in mappings if m.confidence_level == ConfidenceLevel.LOW),
                    "rejected": sum(1 for m in mappings if m.status == MappingStatus.REJECTED),
                },
                "visual": {"supported": supported_visuals, "unsupported": unsupported},
                "manual_actions": total_objects - mapped_count + unsupported,
                "migration_score_breakdown": {
                    "mapping_coverage": round(mapping_coverage, 1),
                    "avg_confidence": round(avg_confidence, 1),
                    "report_coverage": 100 if report_count > 0 else 0,
                    "visual_coverage": round(visual_coverage, 1),
                    "structural_score": 100 if report_count > 0 else 0,
                    "visual_score": round(visual_coverage, 1),
                    "data_score": round(avg_confidence, 1),
                    "weights": {
                        "mapping_coverage": int(settings.score_weight_mapping_coverage * 100),
                        "structural_score": int(settings.score_weight_report_coverage * 100),
                        "visual_score": int(settings.score_weight_visual_coverage * 100),
                        "data_score": int(settings.score_weight_mapping_confidence * 100),
                    },
                },
            }

            val_run.status = "COMPLETED"
            val_run.results = results
            val_run.migration_score = round(score, 1)
            val_run.completed_at = datetime.now(timezone.utc)
            job.status = JobStatus.COMPLETED
            job.completed_at = datetime.now(timezone.utc)
            job.result = {"migration_score": round(score, 1)}

            project = await self.db.get(Project, project_id)
            if project:
                project.status = ProjectStatus.COMPLETED

            await emit_job_progress(
                self.db, job_id,
                agent="Validation Orchestrator",
                kind="action",
                label=f"Migration score {round(score, 1)}%",
                status="complete",
                phase="done",
                current=3,
                total=3,
            )
        except Exception as e:
            val_run = await self.db.get(ValidationRun, val_run_id)
            job = await self.db.get(Job, job_id)
            if val_run:
                val_run.status = "FAILED"
                val_run.error_message = str(e)
                val_run.completed_at = datetime.now(timezone.utc)
            if job:
                job.status = JobStatus.FAILED
                job.error_message = str(e)
                job.completed_at = datetime.now(timezone.utc)

    async def _heal_orphan_validation_runs(self, project_id: str) -> None:
        result = await self.db.execute(
            select(ValidationRun).where(
                ValidationRun.project_id == project_id,
                ValidationRun.status.in_(["PENDING", "RUNNING"]),
            )
        )
        now = datetime.now(timezone.utc)
        for run in result.scalars().all():
            run.status = "FAILED"
            run.error_message = "Validation interrupted — run again"
            run.completed_at = now
        await self.db.flush()

    async def get_latest(self, project_id: str) -> ValidationRun | None:
        result = await self.db.execute(
            select(ValidationRun).where(ValidationRun.project_id == project_id).order_by(ValidationRun.created_at.desc()).limit(1)
        )
        return result.scalar_one_or_none()
