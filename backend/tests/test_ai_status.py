"""AI status endpoint tests."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_ai_status(client):
    response = await client.get("/api/v1/ai/status")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["mode"] in ("mock", "live")
    assert data["provider"] in ("mock", "cursor", "openai")
    assert "label" in data


def test_get_ai_status_mock_mode():
    from app.ai.llm_client import get_ai_status
    from app.core.config import settings

    original_mode = settings.ai_mode
    try:
        settings.ai_mode = "mock"
        status = get_ai_status()
        assert status["mode"] == "mock"
        assert status["label"] == "Mock"
    finally:
        settings.ai_mode = original_mode


def test_get_ai_status_live_cursor():
    from app.ai.llm_client import get_ai_status
    from app.core.config import settings

    original_mode = settings.ai_mode
    original_cursor = settings.cursor_api_key
    original_openai = settings.openai_api_key
    try:
        settings.ai_mode = "live"
        settings.cursor_api_key = "crsr_test"
        settings.openai_api_key = ""
        status = get_ai_status()
        assert status["mode"] == "live"
        assert status["provider"] == "cursor"
        assert status["label"] == "Live"
    finally:
        settings.ai_mode = original_mode
        settings.cursor_api_key = original_cursor
        settings.openai_api_key = original_openai
