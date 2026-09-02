import json
from pathlib import Path
from typing import Any


def _sample_data_root() -> Path:
    base = Path(__file__).resolve()
    for parent in (base.parents[2], base.parents[3]):
        candidate = parent / "sample-data"
        if candidate.exists():
            return candidate
    return Path("/app/sample-data")


SAMPLE_DATA_ROOT = _sample_data_root()
MANIFEST_PATH = SAMPLE_DATA_ROOT / "manifest.json"
PROJECTS_DIR = SAMPLE_DATA_ROOT / "projects"


def load_manifest() -> dict[str, Any]:
    if not MANIFEST_PATH.exists():
        return {"version": "2.0", "projects": [], "demo_project_template": {}}
    return json.loads(MANIFEST_PATH.read_text())


def list_sample_projects() -> list[dict[str, Any]]:
    manifest = load_manifest()
    projects = []
    for entry in manifest.get("projects", []):
        project_path = SAMPLE_DATA_ROOT / entry["path"]
        project_json = project_path / "project.json"
        meta = json.loads(project_json.read_text()) if project_json.exists() else {}
        projects.append({**entry, **meta})
    return projects


def get_sample_project(project_id: str) -> dict[str, Any] | None:
    for project in list_sample_projects():
        if project.get("id") == project_id:
            return project
    return None


def get_demo_template() -> dict[str, Any]:
    manifest = load_manifest()
    template = manifest.get("demo_project_template", {})
    sample_id = template.get("sample_project_id", "fixed-telco-orders")
    sample = get_sample_project(sample_id) or {}
    return {
        "name": template.get("name") or sample.get("name", "Demo Migration"),
        "description": template.get("description") or sample.get("description", ""),
        "source_technology": template.get("source_technology", "SAP Business Objects"),
        "target_technology": template.get("target_technology", "Power BI"),
    }


def resolve_asset_path(relative_path: str) -> Path:
    resolved = (SAMPLE_DATA_ROOT / relative_path).resolve()
    if not str(resolved).startswith(str(SAMPLE_DATA_ROOT.resolve())):
        raise ValueError("Invalid asset path")
    return resolved


def resolve_project_asset(project_id: str, *parts: str) -> Path | None:
    project = get_sample_project(project_id)
    if not project:
        return None
    path = SAMPLE_DATA_ROOT / project["path"]
    for part in parts:
        path = path / part
    return path if path.exists() else None


def iter_catalog_model_paths() -> list[Path]:
    """All Pluto model JSON files under projects/*/target/."""
    paths: list[Path] = []
    if PROJECTS_DIR.exists():
        for target_dir in PROJECTS_DIR.glob("*/target"):
            for path in sorted(target_dir.glob("*.json")):
                if path.name != "glossary.json":
                    paths.append(path)
    # Legacy fallback
    legacy = SAMPLE_DATA_ROOT / "pluto"
    if legacy.exists():
        for path in sorted(legacy.glob("*.json")):
            if path.name != "glossary.json" and path not in paths:
                paths.append(path)
    return paths
