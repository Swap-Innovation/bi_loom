import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.middleware import get_request_id, success_response
from app.services.chat_service import ChatService

router = APIRouter(tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    page_path: str = ""
    history: list[ChatMessage] = Field(default_factory=list)
    activity_context: str = ""


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, default=str)}\n\n"


@router.post("/projects/{project_id}/chat")
async def project_chat(
    project_id: str,
    body: ChatRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    result = await service.chat(
        project_id,
        body.message,
        body.page_path,
        [m.model_dump() for m in body.history],
        body.activity_context,
    )
    return success_response(result, get_request_id(request))


@router.post("/chat")
async def general_chat(body: ChatRequest, request: Request, db: AsyncSession = Depends(get_db)):
    service = ChatService(db)
    result = await service.chat_general(
        body.message,
        body.page_path,
        [m.model_dump() for m in body.history],
        body.activity_context,
    )
    return success_response(result, get_request_id(request))


@router.post("/projects/{project_id}/chat/stream")
async def project_chat_stream(
    project_id: str,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)

    async def event_gen():
        try:
            async for event in service.stream_chat(
                project_id,
                body.message,
                body.page_path,
                [m.model_dump() for m in body.history],
                body.activity_context,
            ):
                yield _sse(event)
        except Exception as exc:
            yield _sse({"type": "error", "text": str(exc)})
            yield _sse({"type": "done", "text": ""})

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat/stream")
async def general_chat_stream(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)

    async def event_gen():
        try:
            async for event in service.stream_chat(
                None,
                body.message,
                body.page_path,
                [m.model_dump() for m in body.history],
                body.activity_context,
            ):
                yield _sse(event)
        except Exception as exc:
            yield _sse({"type": "error", "text": str(exc)})
            yield _sse({"type": "done", "text": ""})

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
