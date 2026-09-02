from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.middleware import get_request_id, success_response
from app.data.target_model_catalog import list_catalog_models
from app.services.project_service import PlutoService

router = APIRouter(prefix="/target-models", tags=["catalog"])


@router.get("/catalog")
async def global_target_catalog(request: Request):
    return success_response(list_catalog_models(), get_request_id(request))


@router.get("/catalog/compare")
async def compare_catalog_models(request: Request, a: str, b: str, db: AsyncSession = Depends(get_db)):
    service = PlutoService(db)
    diff = service.compare_catalog_models(a, b)
    if not diff:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("One or both catalog models not found")
    return success_response(diff, get_request_id(request))


@router.get("/catalog/{catalog_id}")
async def get_catalog_detail(catalog_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = PlutoService(db)
    preview = service.get_catalog_preview(catalog_id)
    if not preview:
        from app.core.exceptions import NotFoundError
        raise NotFoundError(f"Catalog model '{catalog_id}' not found")
    return success_response(preview, get_request_id(request))
