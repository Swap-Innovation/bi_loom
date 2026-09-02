from pathlib import Path

from app.generators.powerbi.pbip_generator import PBIPGenerator


def test_pbip_generator_uses_documents_hierarchy(tmp_path: Path):
    mspec = {
        "project": {"name": "Telco Orders"},
        "documents": [
            {
                "id": "doc-1",
                "name": "Orders Report",
                "product_type": "webi",
                "pages": [
                    {
                        "id": "page-1",
                        "name": "Summary",
                        "blocks": [
                            {
                                "id": "block-1",
                                "type": "table",
                                "title": "Order Table",
                                "field_names": ["Order_ID", "Revenue"],
                                "status": "SUPPORTED",
                            },
                            {
                                "id": "block-2",
                                "type": "olap",
                                "title": "OLAP View",
                                "status": "UNSUPPORTED",
                            },
                        ],
                    }
                ],
            }
        ],
        "mappings": [
            {"source_name": "Order_ID", "target_table": "Orders", "target_column": "OrderID"},
        ],
    }
    pluto = {
        "tables": [
            {"name": "Orders", "columns": [{"name": "OrderID", "data_type": "string"}]},
        ],
    }
    conversion_items = [
        {
            "source_type": "block",
            "source_id": "block-1",
            "source_name": "Order Table",
            "target_path": {"table": "Orders", "column": "OrderID"},
            "status": "complete",
        },
    ]

    gen = PBIPGenerator(mspec, pluto, tmp_path, conversion_items=conversion_items)
    result = gen.generate()

    assert result["report_count"] == 1
    assert result["unsupported_count"] == 1
    assert (tmp_path / "Orders_Report.Report" / "definition.pbir").exists()
    assert (tmp_path / "PlutoSemanticModel.SemanticModel" / "model.json").exists()
    assert (tmp_path / "artifact-tree.json").exists()
    assert result["artifact_tree"]["reports"][0]["name"] == "Orders_Report"
