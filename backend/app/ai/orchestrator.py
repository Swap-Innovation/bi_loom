from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.confidence_agent import exact_name_match, glossary_match, normalized_name_match, score_confidence_level
from app.ai.llm_client import get_llm_client
from app.ai.mock_responses import AIMappingResult
from app.ai.prompts import build_mapping_prompt
from app.core.database import generate_id
from app.models import ApprovedMapping, ConfidenceLevel, Mapping, MappingStatus
from app.vector.semantic_search import semantic_search

ProgressCallback = Callable[[dict[str, Any]], Awaitable[None]]


async def run_mapping_pipeline(
    db: AsyncSession,
    project_id: str,
    mspec: dict[str, Any],
    pluto_model: dict[str, Any],
    glossary_terms: list[dict[str, Any]],
    on_progress: ProgressCallback | None = None,
) -> list[Mapping]:
    mappings: list[Mapping] = []
    pluto_columns = pluto_model.get("columns", [])
    pluto_measures = pluto_model.get("measures", [])

    async def emit(payload: dict[str, Any]) -> None:
        if on_progress:
            await on_progress(payload)

    await emit({
        "phase": "init",
        "agent": "Mapping Orchestrator",
        "kind": "thought",
        "label": "Load MSpec source objects and Pluto target schema",
        "status": "running",
    })

    source_objects = _extract_source_objects(mspec)
    total = len(source_objects)

    await emit({
        "phase": "init",
        "agent": "Mapping Orchestrator",
        "kind": "action",
        "label": f"Extracted {total} source fields/measures from MSpec",
        "status": "complete",
        "current": 0,
        "total": total,
    })

    approved_result = await db.execute(
        select(ApprovedMapping).where(ApprovedMapping.project_id == project_id)
    )
    approved_examples = [
        {"source": a.source_name, "target_table": a.target_table, "target_column": a.target_column}
        for a in approved_result.scalars().all()
    ]

    await emit({
        "phase": "init",
        "agent": "Memory Agent",
        "kind": "action",
        "label": f"Loaded {len(approved_examples)} approved mapping examples for few-shot context",
        "status": "complete",
        "current": 0,
        "total": total,
    })

    stats = {"exact": 0, "normalized": 0, "llm": 0, "skipped_approved": 0}

    for idx, obj in enumerate(source_objects, start=1):
        source_name = obj["name"]

        mapping, method = await _map_single_object(
            db, project_id, obj, pluto_columns, pluto_measures, glossary_terms, approved_examples,
            on_progress=on_progress,
            progress_meta={"idx": idx, "total": total},
        )
        mappings.append(mapping)

        if method == "skipped_approved":
            stats["skipped_approved"] += 1
            agent = "Guard Agent"
            label = f"Keep approved mapping for “{source_name}” (no overwrite)"
        elif method == "exact":
            stats["exact"] += 1
            agent = "ExactMatch Agent"
            label = (
                f"Exact match “{source_name}” → "
                f"{mapping.target_table}.{mapping.target_column or mapping.target_measure} "
                f"({mapping.confidence:.0f}%)"
            )
        elif method == "normalized":
            stats["normalized"] += 1
            agent = "NormalizedMatch Agent"
            label = (
                f"Normalized match “{source_name}” → "
                f"{mapping.target_table}.{mapping.target_column or mapping.target_measure} "
                f"({mapping.confidence:.0f}%)"
            )
        else:
            stats["llm"] += 1
            agent = "LLM Mapping Agent"
            label = (
                f"{'LLM timeout — left for review' if method == 'llm_timeout' else 'LLM mapped'} "
                f"“{source_name}” → "
                f"{mapping.target_table or '—'}.{mapping.target_column or mapping.target_measure or '—'} "
                f"({mapping.confidence:.0f}% · {mapping.confidence_level.value if mapping.confidence_level else ''})"
            )

        await emit({
            "phase": "map_field",
            "agent": agent,
            "kind": "action",
            "label": label,
            "status": "complete",
            "current": idx,
            "total": total,
            "field": source_name,
            "method": method,
            "stats": dict(stats),
        })

    await emit({
        "phase": "done",
        "agent": "Mapping Orchestrator",
        "kind": "action",
        "label": (
            f"Finished {total} fields · exact={stats['exact']} · "
            f"normalized={stats['normalized']} · llm={stats['llm']} · "
            f"kept_approved={stats['skipped_approved']}"
        ),
        "status": "complete",
        "current": total,
        "total": total,
        "stats": stats,
    })

    return mappings


def _extract_source_objects(mspec: dict) -> list[dict]:
    objects = []
    seen: set[str] = set()

    def add(name: str, obj_type: str, context: dict):
        key = f"{obj_type}:{name}"
        if name and key not in seen:
            seen.add(key)
            objects.append({"name": name, "type": obj_type, "context": context})

    for doc in mspec.get("documents", []):
        doc_name = doc.get("name", "")
        product = doc.get("product_type", "webi")
        for page in doc.get("pages", []):
            page_name = page.get("name", "")
            for block in page.get("blocks", []):
                block_title = block.get("title") or block.get("type", "")
                for fname in block.get("field_names", []):
                    add(fname, "column", {
                        "document": doc_name, "product": product,
                        "page": page_name, "block": block_title, "block_type": block.get("type"),
                        "mspec_path": f"documents/{doc_name}/pages/{page_name}/blocks/{block_title}/fields/{fname}",
                    })
        for visual in doc.get("visuals", []):
            for field in visual.get("fields", []):
                add(field.get("name", ""), "column", {
                    "document": doc_name, "visual": visual.get("title"), "page": visual.get("page_name"),
                })
        for measure in doc.get("measures", []):
            mname = measure.get("name", "")
            add(mname, "measure", {
                "document": doc_name, "expression": measure.get("expression"),
                "mspec_path": f"documents/{doc_name}/measures/{mname}",
            })

    for report in mspec.get("reports", []):
        for visual in report.get("visuals", []):
            for field in visual.get("fields", []):
                add(field.get("name", ""), "column", {
                    "report": report.get("name"), "visual": visual.get("title"),
                })
        for measure in report.get("measures", []):
            add(measure.get("name", ""), "measure", {
                "report": report.get("name"), "expression": measure.get("expression"),
            })
    for query in mspec.get("queries", []):
        if query.get("sql"):
            from app.parsers.business_objects.sql_parser import parse_sql
            parsed = parse_sql(query["sql"])
            for table in parsed.get("tables", []):
                add(table, "table", {"query": query.get("name")})
    return objects


async def _map_single_object(
    db: AsyncSession,
    project_id: str,
    obj: dict,
    pluto_columns: list[dict],
    pluto_measures: list[dict],
    glossary_terms: list[dict],
    approved_examples: list[dict],
    on_progress: ProgressCallback | None = None,
    progress_meta: dict | None = None,
) -> tuple[Mapping, str]:
    source_name = obj["name"]
    source_type = obj["type"]
    method = "llm"
    meta = progress_meta or {}

    result = exact_name_match(source_name, pluto_columns)
    if result:
        method = "exact"
    if not result:
        result = normalized_name_match(source_name, pluto_columns)
        if result:
            method = "normalized"

    glossary_matches = glossary_match(source_name, glossary_terms)
    candidates = await semantic_search(db, project_id, source_name, top_n=10)

    if not result or result.get("confidence", 0) < 80:
        method = "llm"
        idx = meta.get("idx", 0)
        total = meta.get("total", 0)
        if on_progress:
            await on_progress({
                "phase": "map_field",
                "agent": "LLM Mapping Agent",
                "kind": "thought",
                "label": f"Calling LLM for “{source_name}” ({idx}/{total})…",
                "status": "running",
                "current": idx,
                "total": total,
                "field": source_name,
                "method": "llm",
            })
        llm = get_llm_client()
        prompt = build_mapping_prompt(
            source_name, source_type, obj.get("context", {}),
            candidates, glossary_matches, approved_examples,
        )
        try:
            import asyncio
            ai_result = await asyncio.wait_for(
                llm.complete_json(prompt, AIMappingResult),
                timeout=45.0,
            )
            result = {
                "target_table": ai_result.target_table,
                "target_column": ai_result.target_column,
                "target_measure": ai_result.target_measure,
                "target_expression": ai_result.target_expression,
                "confidence": ai_result.confidence,
                "reasoning": ai_result.reasoning,
                "evidence": ai_result.evidence,
                "recommendation": ai_result.recommendation,
            }
            if on_progress:
                await on_progress({
                    "phase": "map_field",
                    "agent": "LLM Mapping Agent",
                    "kind": "thought",
                    "label": f"LLM returned suggestion for “{source_name}”",
                    "status": "complete",
                    "current": idx,
                    "total": total,
                    "field": source_name,
                    "method": "llm",
                })
        except Exception as exc:
            method = "llm_timeout"
            result = {
                "target_table": None,
                "target_column": None,
                "target_measure": None,
                "target_expression": None,
                "confidence": 0,
                "reasoning": [f"LLM mapping skipped ({type(exc).__name__}): leave for manual review"],
                "evidence": [],
                "recommendation": "REVIEW",
            }
            if on_progress:
                await on_progress({
                    "phase": "map_field",
                    "agent": "LLM Mapping Agent",
                    "kind": "thought",
                    "label": f"LLM skipped for “{source_name}” ({type(exc).__name__})",
                    "status": "complete",
                    "current": idx,
                    "total": total,
                    "field": source_name,
                    "method": "llm_timeout",
                })
    else:
        if glossary_matches:
            result["reasoning"].append(f"Business glossary match: {', '.join(glossary_matches)}")
            result["confidence"] = min(result["confidence"] + 5, 100)

    confidence = result.get("confidence", 0)
    level = score_confidence_level(confidence)

    existing = await db.execute(
        select(Mapping).where(
            Mapping.project_id == project_id,
            Mapping.source_name == source_name,
            Mapping.source_type == source_type,
        )
    )
    mapping = existing.scalar_one_or_none()

    if mapping and mapping.status in (MappingStatus.APPROVED, MappingStatus.MODIFIED):
        return mapping, "skipped_approved"

    if mapping:
        mapping.target_type = source_type
        mapping.target_table = result.get("target_table")
        mapping.target_column = result.get("target_column")
        mapping.target_measure = result.get("target_measure")
        mapping.target_expression = result.get("target_expression")
        mapping.confidence = confidence
        mapping.confidence_level = ConfidenceLevel(level)
        mapping.reasoning = result.get("reasoning", [])
        mapping.evidence = result.get("evidence", [])
        mapping.recommendation = result.get("recommendation", "")
        mapping.status = MappingStatus.PENDING_REVIEW
        mapping.source_context = obj.get("context")
        return mapping, method

    mapping = Mapping(
        id=generate_id(),
        project_id=project_id,
        source_type=source_type,
        source_name=source_name,
        source_context=obj.get("context"),
        target_type=source_type,
        target_table=result.get("target_table"),
        target_column=result.get("target_column"),
        target_measure=result.get("target_measure"),
        target_expression=result.get("target_expression"),
        confidence=confidence,
        confidence_level=ConfidenceLevel(level),
        reasoning=result.get("reasoning", []),
        evidence=result.get("evidence", []),
        recommendation=result.get("recommendation", ""),
        status=MappingStatus.PENDING_REVIEW,
    )
    db.add(mapping)
    return mapping, method
