import logging
import time
import uuid
from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.exceptions import AppException
from app.schemas.common import ApiResponse, ErrorDetail

logger = logging.getLogger(__name__)


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        start = time.perf_counter()
        try:
            response = await call_next(request)
            duration_ms = (time.perf_counter() - start) * 1000
            logger.info(
                "request_completed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": round(duration_ms, 2),
                },
            )
            response.headers["X-Request-ID"] = request_id
            return response
        except Exception as exc:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.error(
                "request_failed",
                extra={"request_id": request_id, "duration_ms": round(duration_ms, 2), "error": str(exc)},
            )
            raise


def get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", str(uuid.uuid4()))


def success_response(data: Any, request_id: str) -> dict:
    return ApiResponse(success=True, data=data, error=None, request_id=request_id).model_dump()


def error_response(exc: AppException, request_id: str) -> dict:
    return ApiResponse(
        success=False,
        data=None,
        error=ErrorDetail(code=exc.code, message=exc.message, details=exc.details),
        request_id=request_id,
    ).model_dump()
