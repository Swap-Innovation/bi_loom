"""Shared parse context for inventory tracking across product parsers."""

from collections.abc import Callable
from typing import Any

from app.parsers.business_objects.asset_categories import BO_ASSET_CATEGORIES, STEP_LABELS


ProgressCallback = Callable[[dict[str, Any]], None]


class ParseContext:
    def __init__(self, on_progress: ProgressCallback | None = None):
        self.on_progress = on_progress
        self.capability_report: dict[str, list[str]] = {
            "supported": [],
            "unsupported": [],
            "warnings": [],
        }
        self.asset_inventory: dict[str, Any] = {
            "categories": {},
            "totals": {},
            "documents": [],
            "hierarchy": {"folders": [], "documents": []},
        }
        for cat in BO_ASSET_CATEGORIES:
            self.asset_inventory["categories"][cat["id"]] = {
                "id": cat["id"], "label": cat["label"], "items": [], "count": 0, "status": "pending",
            }
        self._docs_done = 0
        self._docs_total = 0

    def set_document_total(self, total: int) -> None:
        self._docs_total = max(total, 0)
        self._emit(
            agent="Parse Orchestrator",
            kind="thought",
            label=f"Plan to parse {self._docs_total} document(s) from export",
            status="complete",
            phase="plan",
        )

    def mark_document_started(self, name: str, product_type: str, index: int) -> None:
        self._emit(
            agent=f"{product_type.upper()} Parser",
            kind="action",
            label=f"Parsing document “{name}” ({index}/{self._docs_total or '?'})",
            status="running",
            phase="document",
            current=index - 1,
            total=max(self._docs_total, 1),
            field=name,
        )

    def mark_document_finished(self, name: str, product_type: str, index: int) -> None:
        self._docs_done = index
        cat = self.asset_inventory["categories"].get("platform_organization")
        if cat and cat["status"] == "pending":
            cat["status"] = "running"
        self._emit(
            agent=f"{product_type.upper()} Parser",
            kind="action",
            label=f"Finished “{name}”",
            status="complete",
            phase="document",
            current=index,
            total=max(self._docs_total, 1),
            field=name,
        )

    def add_item(self, cat_id: str, name: str, item_type: str, details: dict | None = None) -> None:
        if cat_id not in self.asset_inventory["categories"]:
            return
        item = {"name": name, "type": item_type, **(details or {})}
        cat = self.asset_inventory["categories"][cat_id]
        cat["items"].append(item)
        cat["count"] += 1
        if cat["status"] == "pending":
            cat["status"] = "running"

        # Emit only for meaningful milestones (avoid flooding on every field)
        if item_type in ("folder", "document", "connection", "universe", "query", "page", "measure", "prompt"):
            label = STEP_LABELS.get(f"{item_type}s_parsed", f"Found {item_type}: {name}")
            if item_type == "folder":
                label = f"Folder: {name}"
            elif item_type == "document":
                label = f"Document: {name}"
            elif name:
                label = f"{item_type}: {name}"
            self._emit(
                agent=f"{cat['label']} Agent",
                kind="action",
                label=label,
                status="complete",
                phase="inventory",
                current=self._docs_done,
                total=max(self._docs_total, 1),
                field=name,
            )

    def add_unsupported(self, label: str) -> None:
        self.capability_report["unsupported"].append(label)

    def compute_totals(self) -> None:
        totals: dict[str, int] = {}
        grand = 0
        for cat_id, cat_data in self.asset_inventory["categories"].items():
            totals[cat_id] = cat_data["count"]
            grand += cat_data["count"]
            if cat_data["count"] > 0:
                cat_data["status"] = "completed"
            elif cat_data["status"] == "running":
                cat_data["status"] = "completed"
            else:
                cat_data["status"] = "empty"
        self.asset_inventory["totals"] = totals
        self.asset_inventory["grand_total"] = grand

    def set_hierarchy(self, folders: list, documents: list) -> None:
        self.asset_inventory["hierarchy"] = {"folders": folders, "documents": documents}

    def build_sections_snapshot(self) -> list[dict[str, Any]]:
        sections = []
        for cat in BO_ASSET_CATEGORIES:
            data = self.asset_inventory["categories"][cat["id"]]
            sections.append({
                "id": cat["id"],
                "label": cat["label"],
                "description": cat["description"],
                "completed_steps": [s for s in cat["steps"] if data["count"] > 0] if data["count"] else [],
                "status": data["status"],
                "count": data["count"],
                "items": data["items"][:20],
            })
        return sections

    def _emit(self, **payload: Any) -> None:
        if self.on_progress:
            self.on_progress(payload)
