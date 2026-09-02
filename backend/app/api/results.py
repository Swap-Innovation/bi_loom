from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.middleware import get_request_id, success_response
from app.models import (
    GeneratedArtifact, Mapping, MappingStatus, MSpecDocument,
    Project, ProjectStatus, ValidationRun, ConfidenceLevel,
)
from app.schemas.project import DashboardStats, ResultsResponse

router = APIRouter(tags=["results"])


@router.get("/dashboard")
async def get_dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    total_projects = await db.scalar(select(func.count()).select_from(Project)) or 0

    parsed = await db.scalar(select(func.count()).select_from(Project).where(Project.status.in_([
        ProjectStatus.PARSED, ProjectStatus.MAPPING, ProjectStatus.REVIEW_REQUIRED,
        ProjectStatus.MAPPING_APPROVED, ProjectStatus.GENERATING, ProjectStatus.GENERATED,
        ProjectStatus.VALIDATING, ProjectStatus.COMPLETED,
    ]))) or 0
    mapped = await db.scalar(select(func.count()).select_from(Project).where(Project.status.in_([
        ProjectStatus.REVIEW_REQUIRED, ProjectStatus.MAPPING_APPROVED,
        ProjectStatus.GENERATING, ProjectStatus.GENERATED, ProjectStatus.VALIDATING, ProjectStatus.COMPLETED,
    ]))) or 0
    generated = await db.scalar(select(func.count()).select_from(Project).where(Project.status.in_([
        ProjectStatus.GENERATED, ProjectStatus.VALIDATING, ProjectStatus.COMPLETED,
    ]))) or 0
    validated = await db.scalar(select(func.count()).select_from(Project).where(Project.status == ProjectStatus.COMPLETED)) or 0

    high_conf = await db.scalar(select(func.count()).select_from(Mapping).where(Mapping.confidence_level == ConfidenceLevel.HIGH)) or 0
    needs_review = await db.scalar(select(func.count()).select_from(Mapping).where(Mapping.status == MappingStatus.PENDING_REVIEW)) or 0

    stats = DashboardStats(
        reports_in_scope=184,
        parsed=parsed,
        mapped=mapped,
        generated=generated,
        validation_passed=validated,
        migration_progress=min((parsed / max(total_projects, 1)) * 100, 100),
        high_confidence=high_conf,
        needs_review=needs_review,
    )
    return success_response(stats.model_dump(), get_request_id(request))


@router.get("/projects/{project_id}/results")
async def get_results(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    val_result = await db.execute(
        select(ValidationRun).where(ValidationRun.project_id == project_id).order_by(ValidationRun.created_at.desc()).limit(1)
    )
    val_run = val_result.scalar_one_or_none()

    mappings_result = await db.execute(select(Mapping).where(Mapping.project_id == project_id))
    mappings = list(mappings_result.scalars().all())
    total = len(mappings)
    high = sum(1 for m in mappings if m.confidence_level == ConfidenceLevel.HIGH)
    medium = sum(1 for m in mappings if m.confidence_level == ConfidenceLevel.MEDIUM)
    low = sum(1 for m in mappings if m.confidence_level == ConfidenceLevel.LOW)

    artifacts_result = await db.execute(select(GeneratedArtifact).where(GeneratedArtifact.project_id == project_id))
    artifacts = list(artifacts_result.scalars().all())

    results = ResultsResponse(
        project_id=project_id,
        status=project.status.value if project else "UNKNOWN",
        migration_score=val_run.migration_score if val_run else None,
        reports_generated=len(artifacts),
        reports_requiring_review=sum(1 for m in mappings if m.status == MappingStatus.PENDING_REVIEW),
        unsupported_items=val_run.results.get("visual", {}).get("unsupported", 0) if val_run and val_run.results else 0,
        manual_actions=val_run.results.get("manual_actions", 0) if val_run and val_run.results else 0,
        mapping_coverage=val_run.results.get("migration_score_breakdown", {}).get("mapping_coverage") if val_run and val_run.results else None,
        high_confidence_pct=round(high / total * 100, 1) if total else 0,
        medium_confidence_pct=round(medium / total * 100, 1) if total else 0,
        low_confidence_pct=round(low / total * 100, 1) if total else 0,
        downloads=[
            {"type": a.artifact_type, "filename": a.filename, "id": a.id}
            for a in artifacts
        ],
    )
    return success_response(results.model_dump(), get_request_id(request))


@router.get("/projects/{project_id}/download")
async def download_package(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    from pathlib import Path
    from app.core.config import settings
    zip_path = Path(settings.storage_path) / project_id / "generated" / "migration-package.zip"
    if not zip_path.exists():
        from app.core.exceptions import NotFoundError
        raise NotFoundError("No generated package found. Run generation first.")
    return FileResponse(zip_path, filename="migration-package.zip", media_type="application/zip")


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    from datetime import datetime, timezone, timedelta

    from app.models import Job, JobStatus
    from app.schemas.project import JobResponse

    job = await db.get(Job, job_id)
    if not job:
        from app.core.exceptions import NotFoundError
        raise NotFoundError(f"Job {job_id} not found")

    # Recover hung jobs (e.g. LLM stall) so the UI can finish and show results
    if job.status == JobStatus.RUNNING and job.started_at:
        started = job.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - started > timedelta(minutes=10):
            job.status = JobStatus.FAILED
            job.error_message = job.error_message or "Job timed out — re-run to continue"
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(job)

    return success_response(JobResponse.model_validate(job).model_dump(), get_request_id(request))
