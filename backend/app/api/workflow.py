from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.middleware import get_request_id, success_response
from app.services.workflow_service import WorkflowService

router = APIRouter(prefix="/projects/{project_id}/workflow", tags=["workflow"])


@router.get("")
async def get_workflow(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = WorkflowService(db)
    workflow = await service.get_workflow(project_id)
    return success_response(workflow, get_request_id(request))
