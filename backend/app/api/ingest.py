from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.middleware import get_request_id, success_response
from app.models import MSpecDocument
from app.services.project_service import ArtifactService, ParseService

router = APIRouter(prefix="/projects/{project_id}", tags=["ingest"])


@router.get("/ingest/flow")
async def get_ingest_flow(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    artifact_service = ArtifactService(db)
    parse_service = ParseService(db)

    artifacts = await artifact_service.list_by_project(project_id)
    checklist = await artifact_service.get_preparse_checklist(project_id)

    parse_run = await parse_service.get_latest(project_id)
    mspec_result = await db.execute(
        select(MSpecDocument)
        .where(MSpecDocument.project_id == project_id)
        .order_by(MSpecDocument.created_at.desc())
        .limit(1)
    )
    mspec_doc = mspec_result.scalar_one_or_none()

    upload_status = "complete" if artifacts else "pending"
    parsing_status = "pending"
    if parse_run:
        parsing_status = {
            "COMPLETED": "complete",
            "RUNNING": "in_progress",
            "FAILED": "failed",
        }.get(parse_run.status, "pending")

    report = (parse_run.capability_report or {}) if parse_run else {}
    pending_mspec = bool(report.get("pending_mspec"))
    # Fresh draft awaiting Generate (first parse or re-parse) — mspec_ready stays True until generate
    mspec_draft_ready = bool(report.get("mspec_ready") and report.get("pending_mspec"))

    if mspec_draft_ready:
        mspec_status = "pending"
        mspec_can_run = True
        mspec_action = "generate"
        mspec_blocker = None
        mspec_label = "Generate MSpec"
        mspec_description = (
            "New parse draft ready — generate a new MSpec version"
            if mspec_doc else
            "Materialize migration specification from the parse draft"
        )
    elif mspec_doc:
        mspec_status = "complete"
        mspec_can_run = True
        mspec_action = "view"
        mspec_blocker = None
        mspec_label = "MSpec"
        mspec_description = "Browse and export the migration specification"
    elif parsing_status == "complete":
        mspec_status = "pending"
        mspec_can_run = False
        mspec_action = "generate"
        mspec_blocker = "Re-run parsing to produce an MSpec draft"
        mspec_label = "Generate MSpec"
        mspec_description = "Materialize migration specification from the parse draft"
    else:
        mspec_status = "blocked"
        mspec_can_run = False
        mspec_action = "generate"
        mspec_blocker = "Complete parsing first"
        mspec_label = "Generate MSpec"
        mspec_description = "Materialize migration specification from the parse draft"

    base = f"/projects/{project_id}/ingest"
    steps = [
        {
            "id": "upload",
            "step": 1,
            "label": "Upload Assets",
            "description": "Upload BO export ZIP or individual XML files",
            "status": upload_status,
            "route": f"{base}/artifacts",
            "can_run": True,
            "action": "upload",
        },
        {
            "id": "parsing",
            "step": 2,
            "label": "Parsing",
            "description": "Extract BO metadata — run all or select documents",
            "status": parsing_status if checklist["ready"] else "blocked",
            "route": f"{base}/parsing",
            "can_run": checklist["ready"],
            "action": "parse",
            "blocker": None if checklist["ready"] else "Upload a valid BO export first",
        },
        {
            "id": "mspec",
            "step": 3,
            "label": mspec_label,
            "description": mspec_description,
            "status": mspec_status,
            "route": f"{base}/mspec",
            "can_run": mspec_can_run,
            "action": mspec_action,
            "blocker": mspec_blocker,
            "pending_draft": mspec_draft_ready,
        },
    ]

    parsed_doc_ids: set[str] = set()
    draft = report.get("pending_mspec") if parse_run else None
    source_mspec = draft if mspec_draft_ready else (mspec_doc.mspec if mspec_doc else draft)
    if parse_run and parse_run.status == "COMPLETED" and source_mspec:
        for doc in source_mspec.get("documents", []):
            parsed_doc_ids.add(doc.get("id", ""))

    documents = []
    for doc in checklist.get("documents", []):
        documents.append({
            **doc,
            "parsed": doc.get("id") in parsed_doc_ids,
            "can_parse": checklist["ready"],
        })

    return success_response({
        "steps": steps,
        "documents": documents,
        "checklist": checklist,
        "artifact_count": len(artifacts),
        "has_mspec": mspec_doc is not None and not mspec_draft_ready,
        "mspec_pending": mspec_draft_ready,
        "parse_status": parse_run.status if parse_run else None,
    }, get_request_id(request))
