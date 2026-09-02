"""Chat assistant API tests."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_general_chat(client):
    response = await client.post("/api/v1/chat", json={
        "message": "What is the migration workflow?",
        "page_path": "dashboard",
        "history": [],
    })
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "Ingest" in body["data"]["reply"]


@pytest.mark.asyncio
async def test_chat_page_hints(client):
    from app.services.chat_service import ChatService, PAGE_HINTS
    assert "ingest/parsing" in PAGE_HINTS
    assert PAGE_HINTS["map"]["label"] == "Mapping Workbench"
