from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.middleware import get_request_id, success_response
from app.data.sample_manifest import get_demo_template
from app.schemas.project import ProjectCreate, ProjectResponse
from app.services.project_service import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("")
async def create_project(data: ProjectCreate, request: Request, db: AsyncSession = Depends(get_db)):
    service = ProjectService(db)
    project = await service.create(data)
    return success_response(ProjectResponse.model_validate(project).model_dump(), get_request_id(request))


@router.post("/from-template")
async def create_project_from_template(request: Request, db: AsyncSession = Depends(get_db)):
    """Create a project using the demo template from sample-data/manifest.json."""
    service = ProjectService(db)
    project = await service.create(ProjectCreate(**get_demo_template()))
    return success_response(ProjectResponse.model_validate(project).model_dump(), get_request_id(request))


@router.get("")
async def list_projects(request: Request, db: AsyncSession = Depends(get_db)):
    service = ProjectService(db)
    projects = await service.list_all()
    return success_response(
        [ProjectResponse.model_validate(p).model_dump() for p in projects],
        get_request_id(request),
    )


@router.get("/{project_id}")
async def get_project(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = ProjectService(db)
    project = await service.get(project_id)
    return success_response(ProjectResponse.model_validate(project).model_dump(), get_request_id(request))


@router.delete("/{project_id}")
async def delete_project(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = ProjectService(db)
    await service.delete(project_id)
    return success_response({"deleted": True}, get_request_id(request))
