from fastapi import APIRouter, Depends, Request

from app.core.middleware import get_request_id, success_response
from app.data.sample_manifest import list_sample_projects, load_manifest

router = APIRouter(prefix="/sample-data", tags=["sample-data"])


@router.get("/manifest")
async def get_sample_manifest(request: Request):
    """Return the read-only sample-data asset catalog (templates for uploads)."""
    manifest = load_manifest()
    manifest["projects_detail"] = list_sample_projects()
    return success_response(manifest, get_request_id(request))


@router.get("/projects")
async def list_sample_data_projects(request: Request):
    return success_response(list_sample_projects(), get_request_id(request))
