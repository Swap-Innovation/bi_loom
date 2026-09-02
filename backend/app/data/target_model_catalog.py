import json
from pathlib import Path
from typing import Any

from app.data.sample_manifest import iter_catalog_model_paths


def _catalog_dir() -> Path:
    """Legacy catalog dir — prefer per-project target folders."""
    base = Path(__file__).resolve()
    for parent in (base.parents[2], base.parents[3]):
        candidate = parent / "sample-data" / "projects" / "fixed-telco-orders" / "target"
        if candidate.exists():
            return candidate
    return Path("/app/sample-data/projects/fixed-telco-orders/target")


CATALOG_PATH = _catalog_dir()


def list_catalog_models() -> list[dict[str, Any]]:
    """Return available preset target semantic models from sample-data projects."""
    models = []
    for path in iter_catalog_model_paths():
        try:
            data = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        catalog_id = path.stem
        parent_project = path.parent.parent.name if path.parent.name == "target" else path.stem
        tables = data.get("tables", [])
        models.append({
            "catalog_id": catalog_id,
            "name": _catalog_name(catalog_id, tables, parent_project),
            "description": _catalog_description(catalog_id, tables, parent_project),
            "table_count": len(tables),
            "column_count": len(data.get("columns", [])),
            "measure_count": len(data.get("measures", [])),
            "relationship_count": len(data.get("relationships", [])),
            "filename": path.name,
            "sample_project_id": parent_project,
        })
    return models


def load_catalog_model(catalog_id: str) -> dict[str, Any] | None:
    for path in iter_catalog_model_paths():
        if path.stem == catalog_id:
            return json.loads(path.read_text())
    return None


def _catalog_name(catalog_id: str, tables: list[dict], project_id: str) -> str:
    names = {
        "pluto-model": "Fixed Telco Orders (Pluto Gold)",
        "retail-analytics": "Retail Analytics Semantic Model",
    }
    if catalog_id in names:
        return names[catalog_id]
    return catalog_id.replace("-", " ").title()


def _catalog_description(catalog_id: str, tables: list[dict], project_id: str) -> str:
    table_names = ", ".join(t.get("name", "") for t in tables[:4])
    suffix = "…" if len(tables) > 4 else ""
    return f"[{project_id}] {len(tables)} tables: {table_names}{suffix}"
