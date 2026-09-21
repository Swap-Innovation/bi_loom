from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import ai, artifacts, catalog, chat, conversion, generation, ingest, mapping, mspec, parsing, pluto, projects, results, sample_data, validation, workflow
from app.core.config import settings
from app.core.exceptions import AppException
from app.core.logging import setup_logging
from app.core.middleware import RequestContextMiddleware, error_response, get_request_id


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    # BackgroundTasks do not survive process restart — clear orphaned in-flight jobs
    try:
        from datetime import datetime, timezone

        from sqlalchemy import update

        from app.core.database import async_session_factory
        from app.models import Job, JobStatus

        async with async_session_factory() as db:
            await db.execute(
                update(Job)
                .where(Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING]))
                .values(
                    status=JobStatus.FAILED,
                    error_message="Job interrupted by server restart — run again",
                    completed_at=datetime.now(timezone.utc),
                )
            )
            # Gen/Val runs are separate from Job rows — fail orphans too
            from app.models import GenerationRun, ValidationRun

            now = datetime.now(timezone.utc)
            await db.execute(
                update(GenerationRun)
                .where(GenerationRun.status.in_(["PENDING", "RUNNING"]))
                .values(
                    status="FAILED",
                    error_message="Generation interrupted by server restart — run again",
                    completed_at=now,
                )
            )
            await db.execute(
                update(ValidationRun)
                .where(ValidationRun.status.in_(["PENDING", "RUNNING"]))
                .values(
                    status="FAILED",
                    error_message="Validation interrupted by server restart — run again",
                    completed_at=now,
                )
            )
            await db.commit()
    except Exception:
        # DB may not be ready on first boot; request-time stale heal still covers this
        pass
    yield


app = FastAPI(
    title="BI Loom",
    description="AI-assisted SAP Business Objects → Power BI migration",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestContextMiddleware)

app.include_router(projects.router, prefix="/api/v1")
app.include_router(sample_data.router, prefix="/api/v1")
app.include_router(artifacts.router, prefix="/api/v1")
app.include_router(ingest.router, prefix="/api/v1")
app.include_router(parsing.router, prefix="/api/v1")
app.include_router(mspec.router, prefix="/api/v1")
app.include_router(pluto.router, prefix="/api/v1")
app.include_router(catalog.router, prefix="/api/v1")
app.include_router(mapping.router, prefix="/api/v1")
app.include_router(conversion.router, prefix="/api/v1")
app.include_router(workflow.router, prefix="/api/v1")
app.include_router(generation.router, prefix="/api/v1")
app.include_router(validation.router, prefix="/api/v1")
app.include_router(results.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1")


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response(exc, get_request_id(request)),
    )


@app.get("/health")
async def health():
    return {"status": "healthy", "version": "1.0.0"}


@app.get("/api/v1/integrations")
async def integrations():
    return {
        "source": {"technology": "SAP Business Objects", "version": "MVP", "parser": "business_objects"},
        "target": {"technology": "Power BI", "generator": "powerbi"},
    }
