from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory, get_db
from app.core.middleware import get_request_id, success_response
from app.services.project_service import GenerationService

router = APIRouter(prefix="/projects/{project_id}", tags=["generation"])


async def _run_generation(project_id: str, gen_run_id: str, job_id: str):
    async with async_session_factory() as db:
        service = GenerationService(db)
        await service.execute_generation(project_id, gen_run_id, job_id)
        await db.commit()


@router.post("/generate")
async def start_generation(
    project_id: str, request: Request,
    background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db),
):
    service = GenerationService(db)
    gen_run, job = await service.start_generation(project_id)
    background_tasks.add_task(_run_generation, project_id, gen_run.id, job.id)
    return success_response({"generation_run_id": gen_run.id, "job_id": job.id}, get_request_id(request))


@router.get("/generation/active-job")
async def get_active_generation_job(
    project_id: str, request: Request, db: AsyncSession = Depends(get_db),
):
    service = GenerationService(db)
    job = await service.get_active_generation_job(project_id)
    if not job:
        return success_response(None, get_request_id(request))
    return success_response({
        "job_id": job.id,
        "status": job.status.value if hasattr(job.status, "value") else job.status,
        "progress": job.progress,
        "error_message": job.error_message,
    }, get_request_id(request))


@router.get("/generation-status")
async def get_generation_status(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    import json
    from sqlalchemy import select
    from app.models import GenerationRun
    from app.core.config import settings

    service = GenerationService(db)
    # Heal stale jobs / orphan runs before reporting status
    active_job = await service.get_active_generation_job(project_id)

    result = await db.execute(
        select(GenerationRun).where(GenerationRun.project_id == project_id).order_by(GenerationRun.created_at.desc()).limit(1)
    )
    gen_run = result.scalar_one_or_none()
    if not gen_run:
        return success_response(None, get_request_id(request))

    if gen_run.status in ("PENDING", "RUNNING") and not active_job:
        await service._heal_orphan_generation_runs(project_id)
        await db.refresh(gen_run)

    artifact_tree = None
    files: list[dict] = []
    if gen_run.output_path:
        tree_path = Path(settings.storage_path) / gen_run.output_path / "artifact-tree.json"
        if tree_path.exists():
            artifact_tree = json.loads(tree_path.read_text())
            files = artifact_tree.get("files", [])

    return success_response({
        "id": gen_run.id,
        "status": gen_run.status,
        "output_path": gen_run.output_path,
        "error_message": gen_run.error_message,
        "artifact_tree": artifact_tree,
        "files": files,
        "job_id": active_job.id if active_job else None,
    }, get_request_id(request))
