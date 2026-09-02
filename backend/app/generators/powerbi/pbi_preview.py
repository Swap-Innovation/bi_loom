"""Build Power BI target asset tree preview from MSpec + mappings + Pluto model."""
from typing import Any


def build_target_tree(
    mspec: dict[str, Any],
    pluto_model: dict[str, Any],
    mappings: list[dict[str, Any]],
) -> dict[str, Any]:
    mapping_lookup = _build_mapping_lookup(mappings)
    semantic_model = _build_semantic_model_tree(pluto_model)
    reports = _build_report_trees(mspec, mapping_lookup)
    return {
        "semantic_model": semantic_model,
        "reports": reports,
        "summary": {
            "tables": len(pluto_model.get("tables", [])),
            "columns": len(pluto_model.get("columns", [])),
            "measures": len(pluto_model.get("measures", [])),
            "reports": len(reports),
            "pages": sum(r.get("page_count", 0) for r in reports),
            "visuals": sum(r.get("visual_count", 0) for r in reports),
        },
    }


def _build_mapping_lookup(mappings: list[dict[str, Any]]) -> dict[str, dict]:
    lookup: dict[str, dict] = {}
    for m in mappings:
        name = (m.get("source_name") or "").upper()
        if name:
            lookup[name] = m
    return lookup


def _build_semantic_model_tree(pluto_model: dict[str, Any]) -> dict[str, Any]:
    tables_out = []
    columns_by_table: dict[str, list] = {}
    for col in pluto_model.get("columns", []):
        table = col.get("table", "Unknown")
        columns_by_table.setdefault(table, []).append({
            "id": f"{table}.{col.get('column')}",
            "name": col.get("column"),
            "type": col.get("type", "string"),
            "description": col.get("description"),
            "asset_type": "column",
        })

    measures_by_table: dict[str, list] = {}
    for measure in pluto_model.get("measures", []):
        table = measure.get("table", "Unknown")
        measures_by_table.setdefault(table, []).append({
            "id": f"{table}.{measure.get('name')}",
            "name": measure.get("name"),
            "expression": measure.get("expression"),
            "description": measure.get("description"),
            "asset_type": "measure",
        })

    for table in pluto_model.get("tables", []):
        tname = table.get("name", "Unknown")
        tables_out.append({
            "id": tname,
            "name": tname,
            "description": table.get("description"),
            "asset_type": "table",
            "columns": columns_by_table.get(tname, []),
            "measures": measures_by_table.get(tname, []),
        })

    return {
        "id": "semantic-model",
        "name": pluto_model.get("_meta", {}).get("name", "Semantic Model"),
        "asset_type": "dataset",
        "tables": tables_out,
        "relationships": pluto_model.get("relationships", []),
        "hierarchies": pluto_model.get("hierarchies", []),
    }


def _build_report_trees(mspec: dict[str, Any], mapping_lookup: dict[str, dict]) -> list[dict]:
    reports = []
    documents = mspec.get("documents") or []
    if documents:
        for doc in documents:
            reports.append(_document_to_report(doc, mapping_lookup))
    else:
        for report in mspec.get("reports", []):
            reports.append(_legacy_report_to_tree(report, mapping_lookup))
    return reports


def _document_to_report(doc: dict, mapping_lookup: dict[str, dict]) -> dict:
    pages_out = []
    visual_count = 0
    for page in doc.get("pages", []):
        visuals = []
        for block in page.get("blocks", []):
            visual_count += 1
            mapped_fields = []
            for fname in block.get("field_names", []):
                mapped_fields.append(_resolve_field(fname, mapping_lookup))
            visuals.append({
                "id": block.get("id"),
                "name": block.get("title") or block.get("type"),
                "type": _bo_to_pbi_visual(block.get("type", "table")),
                "asset_type": "visual",
                "status": block.get("status", "SUPPORTED"),
                "fields": mapped_fields,
                "source_block_type": block.get("type"),
            })
        for visual in page.get("visuals", []):
            visual_count += 1
            mapped_fields = [
                _resolve_field(f.get("name", ""), mapping_lookup)
                for f in visual.get("fields", [])
            ]
            visuals.append({
                "id": visual.get("id"),
                "name": visual.get("title") or visual.get("type"),
                "type": _bo_to_pbi_visual(visual.get("type", "chart")),
                "asset_type": "visual",
                "status": visual.get("status", "SUPPORTED"),
                "fields": mapped_fields,
                "source_block_type": visual.get("type"),
            })
        pages_out.append({
            "id": page.get("id"),
            "name": page.get("name"),
            "asset_type": "page",
            "page_type": page.get("page_type", "tab"),
            "visuals": visuals,
            "visual_count": len(visuals),
        })

    return {
        "id": doc.get("id"),
        "name": doc.get("name"),
        "asset_type": "report",
        "product_type": doc.get("product_type"),
        "pages": pages_out,
        "page_count": len(pages_out),
        "visual_count": visual_count,
    }


def _legacy_report_to_tree(report: dict, mapping_lookup: dict[str, dict]) -> dict:
    visuals = []
    for visual in report.get("visuals", []):
        mapped_fields = [
            _resolve_field(f.get("name", ""), mapping_lookup)
            for f in visual.get("fields", [])
        ]
        visuals.append({
            "id": visual.get("id"),
            "name": visual.get("title") or visual.get("type"),
            "type": _bo_to_pbi_visual(visual.get("type", "table")),
            "asset_type": "visual",
            "status": visual.get("status", "SUPPORTED"),
            "fields": mapped_fields,
            "source_block_type": visual.get("type"),
        })
    return {
        "id": report.get("id"),
        "name": report.get("name"),
        "asset_type": "report",
        "pages": [{
            "id": f"{report.get('id')}-page-1",
            "name": report.get("name", "Page 1"),
            "asset_type": "page",
            "visuals": visuals,
            "visual_count": len(visuals),
        }],
        "page_count": 1,
        "visual_count": len(visuals),
    }


def _resolve_field(source_name: str, mapping_lookup: dict[str, dict]) -> dict:
    m = mapping_lookup.get(source_name.upper())
    if m:
        if m.get("target_measure"):
            return {
                "source": source_name,
                "table": m.get("target_table"),
                "measure": m.get("target_measure"),
                "status": m.get("status", "mapped"),
                "confidence": m.get("confidence"),
            }
        return {
            "source": source_name,
            "table": m.get("target_table"),
            "column": m.get("target_column"),
            "status": m.get("status", "mapped"),
            "confidence": m.get("confidence"),
        }
    return {"source": source_name, "status": "unmapped"}


def _bo_to_pbi_visual(bo_type: str) -> str:
    mapping = {
        "table": "tableEx",
        "chart": "clusteredBarChart",
        "bar": "clusteredBarChart",
        "line": "lineChart",
        "pie": "pieChart",
        "crosstab": "matrix",
        "kpi": "card",
        "map": "map",
        "gauge": "gauge",
        "text": "textbox",
    }
    return mapping.get((bo_type or "").lower(), "tableEx")
