"""Sample-data manifest and project delete unit tests (no live DB)."""

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.data.sample_manifest import get_demo_template, load_manifest
from app.main import app


def test_load_sample_manifest():
    manifest = load_manifest()
    assert "projects" in manifest
    assert "demo_project_template" in manifest
    legacy = manifest.get("legacy_paths", {})
    assert "projects/fixed-telco-orders" in legacy.get("bo_export_zip", "")


def test_demo_template_from_manifest():
    template = get_demo_template()
    assert template["name"]
    assert "Telco" in template["name"] or template["name"]


def test_sample_manifest_file_exists():
    root = Path(__file__).resolve().parents[2] / "sample-data"
    if not root.exists():
        root = Path("/app/sample-data")
    assert (root / "manifest.json").exists()
    assert (root / "projects" / "fixed-telco-orders" / "target" / "pluto-model.json").exists()
    assert (root / "projects" / "fixed-telco-orders" / "artifacts" / "fixed-telco-orders.zip").exists()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_sample_data_manifest_api(client):
    response = await client.get("/api/v1/sample-data/manifest")
    assert response.status_code == 200
    manifest = response.json()["data"]
    assert manifest["projects"]
    assert manifest["legacy_paths"]["glossary"] == "projects/fixed-telco-orders/target/glossary.json"
