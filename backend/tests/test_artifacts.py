"""Artifact storage and parse-source selection tests."""

import io
import zipfile
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.storage.file_storage import LocalFileStorage


def _make_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "manifest.json",
            '{"documents":[{"id":"doc-1","name":"Report","product_type":"webi"}],"connections":[]}',
        )
        zf.writestr("reports/report-001/report.xml", "<report/>")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_storage_save_uses_uploads_layout(tmp_path):
    storage = LocalFileStorage(str(tmp_path))
    rel = await storage.save("proj-1", "art-1", "fixed-telco-orders.zip", _make_zip())
    assert rel == "proj-1/uploads/art-1/fixed-telco-orders.zip"
    assert storage.exists(rel)
    assert (tmp_path / rel).exists()


@pytest.mark.asyncio
async def test_storage_delete_directory(tmp_path):
    storage = LocalFileStorage(str(tmp_path))
    extract_dir = "proj-1/source/extracted"
    await storage.extract_zip(
        await storage.save("proj-1", "art-1", "export.zip", _make_zip()),
        extract_dir,
    )
    assert (tmp_path / extract_dir / "manifest.json").exists()
    await storage.delete_directory(extract_dir)
    assert not (tmp_path / extract_dir).exists()


@pytest.mark.asyncio
async def test_parse_without_artifact_fails_fast():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        project = await client.post("/api/v1/projects", json={"name": "Parse test"})
        project_id = project.json()["data"]["id"]
        response = await client.post(
            f"/api/v1/projects/{project_id}/parse",
            json={"document_ids": None},
        )
        assert response.status_code == 422
        assert "No uploaded artifacts" in response.json()["error"]["message"]
