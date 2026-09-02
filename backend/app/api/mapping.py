from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory, get_db
from app.core.middleware import get_request_id, success_response
from app.schemas.project import MappingResponse, MappingReviewRequest, MappingUpdate
from app.services.project_service import MappingService

router = APIRouter(prefix="/projects/{project_id}/mapping", tags=["mapping"])


async def _run_mapping(project_id: str, job_id: str):
    async with async_session_factory() as db:
        service = MappingService(db)
        await service.execute_mapping(project_id, job_id)
        await db.commit()


@router.post("/run")
async def run_mapping(
    project_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    service = MappingService(db)
    job = await service.start_mapping(project_id)
    background_tasks.add_task(_run_mapping, project_id, job.id)
    return success_response({"job_id": job.id, "status": "PENDING"}, get_request_id(request))


@router.get("/active-job")
async def get_active_mapping_job(
    project_id: str, request: Request, db: AsyncSession = Depends(get_db),
):
    service = MappingService(db)
    job = await service.get_active_mapping_job(project_id)
    if not job:
        return success_response(None, get_request_id(request))
    return success_response({
        "job_id": job.id,
        "status": job.status.value if hasattr(job.status, "value") else job.status,
        "progress": job.progress,
        "error_message": job.error_message,
    }, get_request_id(request))


@router.get("/stats")
async def mapping_stats(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = MappingService(db)
    stats = await service.get_mapping_stats(project_id)
    return success_response(stats, get_request_id(request))


@router.post("/bulk-approve")
async def bulk_approve_mappings(
    project_id: str, request: Request,
    min_confidence: float = Query(90.0, ge=0, le=100),
    db: AsyncSession = Depends(get_db),
):
    service = MappingService(db)
    result = await service.bulk_approve(project_id, min_confidence)
    return success_response(result, get_request_id(request))


@router.post("/bulk-approve-all")
async def bulk_approve_all_mappings(
    project_id: str, request: Request, db: AsyncSession = Depends(get_db),
):
    service = MappingService(db)
    result = await service.bulk_approve_all(project_id)
    return success_response(result, get_request_id(request))


@router.post("/bulk-reject")
async def bulk_reject_mappings(
    project_id: str, request: Request,
    max_confidence: float = Query(50.0, ge=0, le=100),
    db: AsyncSession = Depends(get_db),
):
    service = MappingService(db)
    result = await service.bulk_reject(project_id, max_confidence)
    return success_response(result, get_request_id(request))


@router.post("/bulk-reject-all")
async def bulk_reject_all_mappings(
    project_id: str, request: Request, db: AsyncSession = Depends(get_db),
):
    service = MappingService(db)
    result = await service.bulk_reject_all(project_id)
    return success_response(result, get_request_id(request))


@router.get("")
async def list_mappings(
    project_id: str, request: Request,
    status: str | None = None, confidence_level: str | None = None,
    document: str | None = None, unmapped_only: bool = False,
    db: AsyncSession = Depends(get_db),
):
    service = MappingService(db)
    mappings = await service.list_mappings(
        project_id, status, confidence_level, document, unmapped_only,
    )
    return success_response(
        [MappingResponse.model_validate(m).model_dump() for m in mappings],
        get_request_id(request),
    )


@router.get("/{mapping_id}")
async def get_mapping(project_id: str, mapping_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = MappingService(db)
    mapping = await service.get_mapping(mapping_id)
    return success_response(MappingResponse.model_validate(mapping).model_dump(), get_request_id(request))


@router.post("/{mapping_id}/approve")
async def approve_mapping(
    project_id: str, mapping_id: str,
    request: Request, db: AsyncSession = Depends(get_db),
    body: MappingReviewRequest | None = None,
):
    service = MappingService(db)
    review = body or MappingReviewRequest()
    mapping = await service.approve(mapping_id, review.reviewer, review.comment)
    return success_response(MappingResponse.model_validate(mapping).model_dump(), get_request_id(request))


@router.post("/{mapping_id}/reject")
async def reject_mapping(
    project_id: str, mapping_id: str,
    request: Request, db: AsyncSession = Depends(get_db),
    body: MappingReviewRequest | None = None,
):
    service = MappingService(db)
    review = body or MappingReviewRequest()
    mapping = await service.reject(mapping_id, review.reviewer, review.comment)
    return success_response(MappingResponse.model_validate(mapping).model_dump(), get_request_id(request))


@router.put("/{mapping_id}")
async def update_mapping(
    project_id: str, mapping_id: str, body: MappingUpdate,
    request: Request, db: AsyncSession = Depends(get_db),
):
    service = MappingService(db)
    mapping = await service.update_mapping(mapping_id, body.model_dump())
    return success_response(MappingResponse.model_validate(mapping).model_dump(), get_request_id(request))
