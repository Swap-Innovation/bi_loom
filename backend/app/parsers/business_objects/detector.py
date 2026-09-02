from pathlib import Path
from typing import Any


from app.parsers.business_objects.product_types import detect_export_structure


def detect_export_format(extract_dir: Path) -> dict[str, Any]:
    return detect_export_structure(extract_dir)
