import json
import zipfile
from pathlib import Path

import pytest

from app.parsers.business_objects.report_parser import BusinessObjectsParser

SAMPLE_DIR = Path("/app/sample-data/projects/fixed-telco-orders/source/business-objects")
if not SAMPLE_DIR.exists():
    SAMPLE_DIR = Path(__file__).parent.parent.parent / "sample-data" / "projects" / "fixed-telco-orders" / "source" / "business-objects"


@pytest.fixture
def sample_extract_dir(tmp_path):
    zip_path = SAMPLE_DIR.parent.parent / "artifacts" / "fixed-telco-orders.zip"
    if not zip_path.exists():
        zip_path = SAMPLE_DIR.parent.parent.parent.parent / "fixed-telco-orders.zip"
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(tmp_path)
    return tmp_path


def test_parse_synthetic_export(sample_extract_dir):
    parser = BusinessObjectsParser(sample_extract_dir)
    mspec, capability, inventory = parser.parse()

    assert mspec.version == "1.0"
    assert len(mspec.documents) == 4
    assert len(mspec.folders) == 2
    assert mspec.hierarchy_summary["product_types"]["webi"] == 1
    assert mspec.hierarchy_summary["product_types"]["crystal"] == 1
    assert mspec.hierarchy_summary["product_types"]["dashboard"] == 1
    assert mspec.hierarchy_summary["product_types"]["analysis"] == 1

    webi = next(d for d in mspec.documents if d.product_type == "webi")
    assert webi.name == "Fixed Telco Orders"
    assert len(webi.pages) >= 2
    assert sum(len(p.blocks) for p in webi.pages) >= 5

    crystal = next(d for d in mspec.documents if d.product_type == "crystal")
    assert len(crystal.sections) >= 4

    unsupported = [v for v in webi.visuals if v.status == "UNSUPPORTED"]
    assert len(unsupported) == 1

    assert inventory["grand_total"] > 0
    assert "platform_organization" in inventory["categories"]
    assert len(inventory["hierarchy"]["documents"]) == 4


def test_parse_extracts_measures(sample_extract_dir):
    parser = BusinessObjectsParser(sample_extract_dir)
    mspec, _, _ = parser.parse()
    webi = next(d for d in mspec.documents if d.product_type == "webi")
    assert len(webi.measures) >= 1


def test_parse_extracts_variables(sample_extract_dir):
    parser = BusinessObjectsParser(sample_extract_dir)
    mspec, _, _ = parser.parse()
    webi = next(d for d in mspec.documents if d.product_type == "webi")
    assert len(webi.variables) >= 3


def test_parse_extracts_sql(sample_extract_dir):
    parser = BusinessObjectsParser(sample_extract_dir)
    mspec, _, _ = parser.parse()
    assert len(mspec.queries) >= 1
    assert "CUSTOMER_ID" in (mspec.queries[0].sql or "")
