"""Project-aware migration assistant chat."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm_client import get_llm_client
from app.ai.prompts import load_prompt
from app.models import (
    Artifact,
    ConversionItem,
    Mapping,
    MappingStatus,
    MSpecDocument,
    PlutoModel,
    Project,
)
from app.services.workflow_service import WorkflowService


PAGE_HINTS: dict[str, dict[str, Any]] = {
    "overview": {
        "label": "Project Overview",
        "help": "Summarize migration status, blockers, and recommended next action.",
        "suggestions": ["What should I do next?", "Summarize my migration progress", "What is blocking me?"],
    },
    "ingest/artifacts": {
        "label": "Upload Assets",
        "help": "Help upload BO export ZIP, validate manifest, and proceed to parsing.",
        "suggestions": ["What file should I upload?", "How do I use sample-data?", "Why is my ZIP invalid?"],
    },
    "ingest/parsing": {
        "label": "Parsing",
        "help": "Explain parse steps, case-by-case document parsing, and re-parse behavior.",
        "suggestions": ["Parse only one document", "What does re-parse do?", "Explain parse progress sections"],
    },
    "ingest/mspec": {
        "label": "MSpec",
        "help": "Explain MSpec structure, traceability, and how it feeds mapping.",
        "suggestions": ["What is MSpec?", "Which documents were parsed?", "Explain unsupported blocks"],
    },
    "target": {
        "label": "Target Semantic Model",
        "help": "Help select/import Pluto model, glossary, and coverage.",
        "suggestions": ["Which target model should I use?", "Import glossary", "Explain model coverage"],
    },
    "map": {
        "label": "Mapping Workbench",
        "help": "Explain AI mappings, confidence levels, bulk approve/reject, and manual overrides.",
        "suggestions": ["Approve high-confidence mappings", "Why is mapping blocked?", "Explain LOW confidence items"],
    },
    "convert": {
        "label": "Conversion Studio",
        "help": "Explain conversion items, linked selection, block inspector overrides.",
        "suggestions": ["Run conversion", "What are conversion items?", "Fix unsupported visuals"],
    },
    "deliver": {
        "label": "Deliver",
        "help": "Explain generate, validate, and download workflow.",
        "suggestions": ["Pre-flight checklist", "Difference between generate and validate", "Download package"],
    },
    "deliver/generate": {
        "label": "Generate PBI",
        "help": "Explain pre-flight, generation output, and artifact tree.",
        "suggestions": ["Can I generate without full mapping?", "What is in the package?", "Generation failed — why?"],
    },
    "deliver/validate": {
        "label": "Validate Migration",
        "help": "Explain migration score, validation cards, and drill-down links.",
        "suggestions": ["Explain my migration score", "What are manual actions?", "Fix unmapped fields"],
    },
    "deliver/results": {
        "label": "Results & Download",
        "help": "Explain downloads, confidence breakdown, and publish placeholder.",
        "suggestions": ["What can I download?", "Explain confidence breakdown", "Open in Power BI Desktop"],
    },
}


class ChatService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def build_project_context(self, project_id: str) -> dict[str, Any]:
        project = await self.db.get(Project, project_id)
        if not project:
            from app.core.exceptions import NotFoundError
            raise NotFoundError(f"Project {project_id} not found")

        workflow = await WorkflowService(self.db).get_workflow(project_id)

        mspec_result = await self.db.execute(
            select(MSpecDocument)
            .where(MSpecDocument.project_id == project_id)
            .order_by(MSpecDocument.created_at.desc())
            .limit(1)
        )
        mspec_doc = mspec_result.scalar_one_or_none()

        pluto_result = await self.db.execute(
            select(PlutoModel)
            .where(PlutoModel.project_id == project_id, PlutoModel.is_active.is_(True))
            .limit(1)
        )
        pluto = pluto_result.scalar_one_or_none()

        artifacts = await self.db.execute(
            select(Artifact).where(Artifact.project_id == project_id)
        )
        artifact_list = list(artifacts.scalars().all())

        mapping_stats = await self.db.execute(
            select(Mapping.status, func.count())
            .where(Mapping.project_id == project_id)
            .group_by(Mapping.status)
        )
        status_counts = {row[0].value if hasattr(row[0], "value") else str(row[0]): row[1] for row in mapping_stats}

        conversion_count = await self.db.scalar(
            select(func.count()).select_from(ConversionItem).where(ConversionItem.project_id == project_id)
        ) or 0

        mspec_summary: dict[str, Any] = {}
        if mspec_doc and mspec_doc.mspec:
            mspec = mspec_doc.mspec
            mspec_summary = {
                "version": mspec_doc.version,
                "documents": len(mspec.get("documents", [])),
                "reports": len(mspec.get("reports", [])),
                "hierarchy_summary": mspec.get("hierarchy_summary", {}),
            }

        return {
            "project": {
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "status": project.status.value,
                "source": project.source_technology,
                "target": project.target_technology,
            },
            "workflow": workflow,
            "artifacts": [{"filename": a.filename, "type": a.file_type, "size": a.file_size} for a in artifact_list],
            "mspec": mspec_summary,
            "target_model": {"name": pluto.name, "catalog_id": pluto.catalog_id} if pluto else None,
            "mappings": status_counts,
            "conversion_items": conversion_count,
        }

    def resolve_page(self, page_path: str) -> dict[str, Any]:
        normalized = page_path.strip("/")
        if normalized.startswith("projects/"):
            parts = normalized.split("/")
            if len(parts) >= 3:
                normalized = "/".join(parts[2:])
            else:
                normalized = "overview"

        for key in sorted(PAGE_HINTS.keys(), key=len, reverse=True):
            if normalized == key or normalized.endswith(key):
                return {"key": key, **PAGE_HINTS[key]}
        return {
            "key": normalized or "unknown",
            "label": normalized.replace("/", " › ").title() or "Migration",
            "help": "General migration assistance for the current screen.",
            "suggestions": ["What should I do next?", "Explain this page", "Summarize project status"],
        }

    async def chat(
        self,
        project_id: str,
        message: str,
        page_path: str,
        history: list[dict[str, str]] | None = None,
        activity_context: str = "",
    ) -> dict[str, Any]:
        context = await self.build_project_context(project_id)
        page = self.resolve_page(page_path)
        llm = get_llm_client()
        reply = await llm.complete_chat(
            message=message,
            project_context=json.dumps(context, default=str)[:12000],
            page_context=json.dumps(page, default=str),
            history=history or [],
            activity_context=activity_context or "(none)",
            prompt_template=load_prompt("bi_loom_assistant_v1.txt"),
        )
        return {
            "reply": reply,
            "page": page,
            "suggestions": page.get("suggestions", []),
        }

    async def stream_chat(
        self,
        project_id: str | None,
        message: str,
        page_path: str,
        history: list[dict[str, str]] | None = None,
        activity_context: str = "",
    ):
        """Yield SSE-ready dict events: thinking/token/tool/status/done/error + meta."""
        if project_id:
            context = await self.build_project_context(project_id)
            page = self.resolve_page(page_path)
            suggestions = page.get("suggestions", [])
            project_context = json.dumps(context, default=str)[:12000]
        else:
            page = self.resolve_page(page_path)
            suggestions = [
                "How do I create a project?",
                "What is the migration workflow?",
                "Where is sample-data?",
            ]
            project_context = json.dumps({"mode": "global", "note": "No project selected"})

        llm = get_llm_client()
        yield {"type": "meta", "page": page, "suggestions": suggestions}

        async for event in llm.stream_chat(
            message=message,
            project_context=project_context,
            page_context=json.dumps(page, default=str),
            history=history or [],
            activity_context=activity_context or "(none)",
            prompt_template=load_prompt("bi_loom_assistant_v1.txt"),
        ):
            yield event

    async def chat_general(
        self,
        message: str,
        page_path: str,
        history: list[dict[str, str]] | None = None,
        activity_context: str = "",
    ) -> dict[str, Any]:
        page = self.resolve_page(page_path)
        llm = get_llm_client()
        reply = await llm.complete_chat(
            message=message,
            project_context=json.dumps({"mode": "global", "note": "No project selected"}),
            page_context=json.dumps(page, default=str),
            history=history or [],
            activity_context=activity_context or "(none)",
            prompt_template=load_prompt("bi_loom_assistant_v1.txt"),
        )
        return {"reply": reply, "page": page, "suggestions": [
            "How do I create a project?",
            "What is the migration workflow?",
            "Where is sample-data?",
        ]}
