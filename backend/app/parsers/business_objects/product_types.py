"""SAP Business Objects product type definitions and detection."""

from pathlib import Path
from typing import Any

PRODUCT_TYPES = ("webi", "crystal", "dashboard", "analysis")

PRODUCT_LABELS = {
    "webi": "Web Intelligence",
    "crystal": "Crystal Reports",
    "dashboard": "BO Dashboard",
    "analysis": "Analysis (OLAP)",
}

# Tableau analogy for UI tooltips
PRODUCT_ANALOGY = {
    "webi": "Document → Report Tabs → Blocks",
    "crystal": "Report → Sections → Objects",
    "dashboard": "Dashboard → Canvas → Components",
    "analysis": "Workbook → Views → Charts",
}


def detect_product_type(xml_path: Path) -> str:
    """Detect BO product type from root XML element or filename."""
    name = xml_path.name.lower()
    if "dashboard" in name or xml_path.parent.name.startswith("dashboard"):
        return "dashboard"
    if "crystal" in name or xml_path.parent.name.startswith("crystal"):
        return "crystal"
    if "workbook" in name or "analysis" in name or xml_path.parent.name.startswith("analysis"):
        return "analysis"

    try:
        import xml.etree.ElementTree as ET
        root = ET.parse(xml_path).getroot()
        tag = root.tag.lower()
        product = (root.get("productType") or root.get("type") or "").lower()
        if "dashboard" in tag or product == "dashboard":
            return "dashboard"
        if "crystal" in tag or product == "crystal":
            return "crystal"
        if "analysis" in tag or "workbook" in tag or product == "analysis":
            return "analysis"
    except Exception:
        pass
    return "webi"


def detect_export_structure(extract_dir: Path) -> dict[str, Any]:
    manifest = extract_dir / "manifest.json"
    if manifest.exists():
        import json
        data = json.loads(manifest.read_text())
        docs = data.get("documents", data.get("reports", []))
        product_counts: dict[str, int] = {}
        for doc in docs:
            pt = doc.get("product_type", "webi")
            product_counts[pt] = product_counts.get(pt, 0) + 1
        return {
            "format": "synthetic_bo",
            "confidence": 1.0,
            "folders": len(data.get("folders", [])),
            "documents": len(docs),
            "product_types": product_counts,
        }

    xml_files = list(extract_dir.rglob("*.xml"))
    product_counts: dict[str, int] = {}
    for xf in xml_files:
        pt = detect_product_type(xf)
        product_counts[pt] = product_counts.get(pt, 0) + 1
    return {
        "format": "xml_export",
        "confidence": 0.8,
        "xml_count": len(xml_files),
        "product_types": product_counts,
    }
