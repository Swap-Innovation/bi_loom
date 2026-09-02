from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory, get_db
from app.core.middleware import get_request_id, success_response
from app.services.conversion_service import ConversionService

router = APIRouter(prefix="/projects/{project_id}/conversion", tags=["conversion"])


async def _run_conversion(project_id: str, run_id: str):
    async with async_session_factory() as db:
        service = ConversionService(db)
        await service.run_conversion(project_id)
        await db.commit()


@router.get("/workspace")
async def get_conversion_workspace(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = ConversionService(db)
    workspace = await service.get_workspace(project_id)
    return success_response(workspace, get_request_id(request))


@router.post("/run")
async def start_conversion(
    project_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    step: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    service = ConversionService(db)
    result = await service.run_conversion(project_id, step=step)
    await db.commit()
    return success_response(result, get_request_id(request))


@router.get("/items")
async def list_conversion_items(
    project_id: str, request: Request,
    status: str | None = None, step: str | None = None,
    limit: int = Query(100, le=500), offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    service = ConversionService(db)
    items = await service.list_items(project_id, status, step, limit, offset)
    return success_response(items, get_request_id(request))


@router.get("/runs/latest")
async def get_latest_conversion_run(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = ConversionService(db)
    run = await service.get_latest_run(project_id)
    return success_response(run, get_request_id(request))


@router.patch("/items/{item_id}")
async def update_conversion_item(
    project_id: str,
    item_id: str,
    body: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    service = ConversionService(db)
    item = await service.update_item(project_id, item_id, body)
    await db.commit()
    return success_response(item, get_request_id(request))
