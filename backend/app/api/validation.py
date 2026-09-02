from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory, get_db
from app.core.middleware import get_request_id, success_response
from app.schemas.project import ValidationResponse
from app.services.project_service import ValidationService

router = APIRouter(prefix="/projects/{project_id}", tags=["validation"])


async def _run_validation(project_id: str, val_run_id: str, job_id: str):
    async with async_session_factory() as db:
        service = ValidationService(db)
        await service.execute_validation(project_id, val_run_id, job_id)
        await db.commit()


@router.post("/validate")
async def start_validation(
    project_id: str, request: Request,
    background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db),
):
    service = ValidationService(db)
    val_run, job = await service.start_validation(project_id)
    background_tasks.add_task(_run_validation, project_id, val_run.id, job.id)
    return success_response({"validation_run_id": val_run.id, "job_id": job.id}, get_request_id(request))


@router.get("/validation/active-job")
async def get_active_validation_job(
    project_id: str, request: Request, db: AsyncSession = Depends(get_db),
):
    service = ValidationService(db)
    job = await service.get_active_validation_job(project_id)
    if not job:
        return success_response(None, get_request_id(request))
    return success_response({
        "job_id": job.id,
        "status": job.status.value if hasattr(job.status, "value") else job.status,
        "progress": job.progress,
        "error_message": job.error_message,
    }, get_request_id(request))


@router.get("/validation")
async def get_validation(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = ValidationService(db)
    # Heal stale jobs / orphan runs before reporting
    active_job = await service.get_active_validation_job(project_id)
    val_run = await service.get_latest(project_id)
    if not val_run:
        return success_response(None, get_request_id(request))
    if val_run.status in ("PENDING", "RUNNING") and not active_job:
        await service._heal_orphan_validation_runs(project_id)
        await db.refresh(val_run)
    return success_response(
        {
            **ValidationResponse(
                validation_run_id=val_run.id,
                status=val_run.status,
                results=val_run.results,
                migration_score=val_run.migration_score,
            ).model_dump(),
            "job_id": active_job.id if active_job else None,
        },
        get_request_id(request),
    )
