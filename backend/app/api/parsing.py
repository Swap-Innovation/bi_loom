from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory, get_db
from app.core.middleware import get_request_id, success_response
from app.schemas.project import ParseStatusResponse
from app.core.exceptions import ValidationError
from app.services.project_service import ArtifactService, ParseService

router = APIRouter(prefix="/projects/{project_id}", tags=["parsing"])


class ParseRequest(BaseModel):
    document_ids: list[str] | None = None


async def _run_parse(project_id: str, parse_run_id: str, job_id: str):
    async with async_session_factory() as db:
        service = ParseService(db)
        await service.execute_parse(project_id, parse_run_id, job_id)
        await db.commit()


@router.post("/parse")
async def start_parse(
    project_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    body: ParseRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    service = ParseService(db)
    document_ids = body.document_ids if body else None

    artifact_service = ArtifactService(db)
    artifact = await artifact_service.get_primary_artifact(project_id)
    if not artifact:
        raise ValidationError(
            "No uploaded artifacts found. Upload a Business Objects export on the Upload page first."
        )

    parse_run, job = await service.start_parse(project_id, document_ids=document_ids)
    background_tasks.add_task(_run_parse, project_id, parse_run.id, job.id)
    return success_response(
        {
            "parse_run_id": parse_run.id,
            "job_id": job.id,
            "status": "PENDING",
            "document_ids": document_ids,
        },
        get_request_id(request),
    )


@router.get("/parse-status")
async def get_parse_status(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = ParseService(db)
    parse_run = await service.get_latest(project_id)
    if not parse_run:
        return success_response(None, get_request_id(request))
    return success_response(
        ParseStatusResponse(
            parse_run_id=parse_run.id,
            status=parse_run.status,
            progress=parse_run.progress,
            capability_report=parse_run.capability_report,
            error_message=parse_run.error_message,
        ).model_dump(),
        get_request_id(request),
    )
