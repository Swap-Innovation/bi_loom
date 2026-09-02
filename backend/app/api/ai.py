from fastapi import APIRouter, Request

from app.ai.llm_client import get_ai_status
from app.core.middleware import get_request_id, success_response

router = APIRouter(tags=["ai"])


@router.get("/ai/status")
async def ai_status(request: Request):
    return success_response(get_ai_status(), get_request_id(request))
