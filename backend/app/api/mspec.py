from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.middleware import get_request_id, success_response
from app.models import MSpecDocument
from app.services.conversion_service import ConversionService
from app.services.project_service import ParseService

router = APIRouter(prefix="/projects/{project_id}/mspec", tags=["mspec"])


@router.post("/generate")
async def generate_mspec(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Persist MSpec from the latest completed parse draft (separate from Parsing)."""
    service = ParseService(db)
    result = await service.generate_mspec(project_id)
    return success_response(result, get_request_id(request))


@router.get("")
async def get_mspec(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MSpecDocument).where(MSpecDocument.project_id == project_id).order_by(MSpecDocument.created_at.desc()).limit(1)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise NotFoundError("No MSpec found for this project")
    return success_response({"id": doc.id, "version": doc.version, "mspec": doc.mspec}, get_request_id(request))


@router.get("/reports")
async def list_reports(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MSpecDocument).where(MSpecDocument.project_id == project_id).order_by(MSpecDocument.created_at.desc()).limit(1)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise NotFoundError("No MSpec found")
    reports = doc.mspec.get("reports", [])
    return success_response(reports, get_request_id(request))


@router.get("/reports/{report_id}")
async def get_report(project_id: str, report_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MSpecDocument).where(MSpecDocument.project_id == project_id).order_by(MSpecDocument.created_at.desc()).limit(1)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise NotFoundError("No MSpec found")
    for report in doc.mspec.get("reports", []):
        if report.get("id") == report_id:
            return success_response(report, get_request_id(request))
    raise NotFoundError(f"Report {report_id} not found")


@router.get("/search")
async def search_mspec(
    project_id: str, request: Request, q: str = "", db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    from app.models import MSpecDocument
    service = ConversionService(db)
    result = await db.execute(
        select(MSpecDocument).where(MSpecDocument.project_id == project_id)
        .order_by(MSpecDocument.created_at.desc()).limit(1)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise NotFoundError("No MSpec found")
    matches = service.search_mspec(doc.mspec, q) if q else []
    return success_response({"query": q, "results": matches, "count": len(matches)}, get_request_id(request))


@router.get("/detail")
async def get_mspec_detail(
    project_id: str, request: Request, mspec_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    service = ConversionService(db)
    detail = await service.get_mspec_detail(project_id, mspec_id)
    if not detail.get("mspec"):
        raise NotFoundError("No MSpec found for this project")
    return success_response(detail, get_request_id(request))


@router.get("/versions")
async def list_mspec_versions(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = ConversionService(db)
    versions = await service.list_mspec_versions(project_id)
    return success_response(versions, get_request_id(request))
