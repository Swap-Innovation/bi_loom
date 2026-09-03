from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.middleware import get_request_id, success_response
from app.schemas.project import ArtifactResponse
from app.services.project_service import ArtifactService

router = APIRouter(prefix="/projects/{project_id}/artifacts", tags=["artifacts"])


@router.post("")
async def upload_artifact(
    project_id: str,
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    if len(content) > settings.max_upload_size_bytes:
        from app.core.exceptions import ValidationError
        raise ValidationError(f"File exceeds max size of {settings.max_upload_size_mb}MB")

    allowed = {
        ".zip", ".xml", ".json", ".sql",
        ".biar", ".lcmbiar", ".wid", ".rep", ".unv", ".unx", ".qry",
    }
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    if ext not in allowed:
        from app.core.exceptions import ValidationError
        raise ValidationError(
            f"File type {ext} not allowed. Use ZIP, XML, BIAR/LCMBIAR, WID, REP, UNV/UNX, JSON, or SQL."
        )

    service = ArtifactService(db)
    artifact = await service.upload(project_id, file.filename or "upload", content)
    return success_response(ArtifactResponse.model_validate(artifact).model_dump(), get_request_id(request))


@router.get("")
async def list_artifacts(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = ArtifactService(db)
    artifacts = await service.list_by_project(project_id)
    return success_response(
        [ArtifactResponse.model_validate(a).model_dump() for a in artifacts],
        get_request_id(request),
    )


@router.delete("/{artifact_id}")
async def delete_artifact(
    project_id: str, artifact_id: str, request: Request, db: AsyncSession = Depends(get_db),
):
    service = ArtifactService(db)
    deleted = await service.delete(project_id, artifact_id)
    return success_response({"deleted": deleted}, get_request_id(request))


@router.post("/validate")
async def validate_artifact(
    project_id: str,
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    if len(content) > settings.max_upload_size_bytes:
        from app.core.exceptions import ValidationError
        raise ValidationError(f"File exceeds max size of {settings.max_upload_size_mb}MB")

    service = ArtifactService(db)
    result = service.validate_content(file.filename or "upload", content)
    return success_response(result, get_request_id(request))


@router.get("/checklist")
async def get_preparse_checklist(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = ArtifactService(db)
    checklist = await service.get_preparse_checklist(project_id)
    return success_response(checklist, get_request_id(request))
