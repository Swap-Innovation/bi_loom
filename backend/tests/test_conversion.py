"""Tests for conversion workspace and PBI preview."""
import pytest

from app.generators.powerbi.pbi_preview import build_target_tree


SAMPLE_MSPEC = {
    "documents": [{
        "id": "doc-1",
        "name": "Sales Report",
        "product_type": "webi",
        "pages": [{
            "id": "page-1",
            "name": "Overview",
            "page_type": "tab",
            "blocks": [{
                "id": "block-1",
                "type": "table",
                "title": "Orders Table",
                "field_names": ["CUSTOMER_NAME", "ORDER_AMOUNT"],
                "status": "SUPPORTED",
            }],
        }],
    }],
    "measures": [{"id": "m1", "name": "Total Revenue", "expression": "Sum(OrderAmount)"}],
}

SAMPLE_PLUTO = {
    "_meta": {"name": "Test Model", "is_active": True},
    "tables": [{"name": "DimCustomer"}, {"name": "FactOrder"}],
    "columns": [
        {"table": "DimCustomer", "column": "CustomerName", "type": "string"},
        {"table": "FactOrder", "column": "OrderAmount", "type": "decimal"},
    ],
    "measures": [{"table": "FactOrder", "name": "TotalRevenue", "expression": "SUM(FactOrder[OrderAmount])"}],
}

SAMPLE_MAPPINGS = [
    {"source_name": "CUSTOMER_NAME", "target_table": "DimCustomer", "target_column": "CustomerName", "status": "APPROVED"},
    {"source_name": "ORDER_AMOUNT", "target_table": "FactOrder", "target_column": "OrderAmount", "status": "APPROVED"},
]


def test_build_target_tree_semantic_model():
    tree = build_target_tree(SAMPLE_MSPEC, SAMPLE_PLUTO, SAMPLE_MAPPINGS)
    assert tree["semantic_model"]["name"] == "Test Model"
    assert len(tree["semantic_model"]["tables"]) == 2
    assert tree["summary"]["tables"] == 2
    assert tree["summary"]["columns"] == 2


def test_build_target_tree_reports_from_documents():
    tree = build_target_tree(SAMPLE_MSPEC, SAMPLE_PLUTO, SAMPLE_MAPPINGS)
    assert len(tree["reports"]) == 1
    report = tree["reports"][0]
    assert report["name"] == "Sales Report"
    assert report["page_count"] == 1
    visual = report["pages"][0]["visuals"][0]
    assert visual["type"] == "tableEx"
    assert visual["fields"][0]["status"] == "APPROVED"


def test_build_target_tree_unmapped_fields():
    tree = build_target_tree(SAMPLE_MSPEC, SAMPLE_PLUTO, [])
    visual = tree["reports"][0]["pages"][0]["visuals"][0]
    assert any(f["status"] == "unmapped" for f in visual["fields"])


def test_catalog_lists_models():
    from app.data.target_model_catalog import list_catalog_models
    models = list_catalog_models()
    assert len(models) >= 1
    ids = {m["catalog_id"] for m in models}
    assert "pluto-model" in ids or "retail-analytics" in ids
