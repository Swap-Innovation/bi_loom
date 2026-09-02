"""Shared live job progress helpers for chatbot / JobTray streaming."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Job

MAX_LOG = 60


def _append_log(prev: dict[str, Any] | None, event: dict[str, Any]) -> list[dict[str, Any]]:
    log = list((prev or {}).get("log") or [])
    entry = {
        "id": event.get("id") or f"{event.get('agent', 'Agent')}-{len(log)}-{str(event.get('label', ''))[:32]}",
        "agent": event.get("agent", "Agent"),
        "kind": event.get("kind", "action"),
        "label": event.get("label", ""),
        "status": event.get("status", "complete"),
        "field": event.get("field"),
        "method": event.get("method"),
    }
    if log and log[-1].get("label") == entry["label"] and log[-1].get("status") == entry["status"]:
        return log[-MAX_LOG:]
    log.append(entry)
    return log[-MAX_LOG:]


async def emit_job_progress(
    db: AsyncSession,
    job_id: str,
    *,
    agent: str,
    label: str,
    kind: str = "action",
    status: str = "complete",
    phase: str | None = None,
    current: int | None = None,
    total: int | None = None,
    field: str | None = None,
    method: str | None = None,
    stats: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
    commit: bool = True,
) -> None:
    """Write a progress event onto Job.progress and optionally commit for live UI polls."""
    job = await db.get(Job, job_id)
    if not job:
        return

    prev = job.progress if isinstance(job.progress, dict) else {}
    event = {
        "agent": agent,
        "kind": kind,
        "label": label,
        "status": status,
        "field": field,
        "method": method,
    }
    log = _append_log(prev, event)

    cur = current if current is not None else prev.get("current", 0)
    tot = total if total is not None else prev.get("total", 0)

    progress: dict[str, Any] = {
        "phase": phase or prev.get("phase") or "running",
        "step_label": label,
        "current": cur,
        "total": tot,
        "agent": agent,
        "field": field,
        "method": method,
        "stats": stats if stats is not None else prev.get("stats"),
        "log": log,
    }
    if extra:
        progress.update(extra)

    job.progress = progress
    if commit:
        await db.commit()
