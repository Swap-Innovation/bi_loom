import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_integrations(client):
    response = await client.get("/api/v1/integrations")
    assert response.status_code == 200
    data = response.json()
    assert data["source"]["technology"] == "SAP Business Objects"


@pytest.mark.asyncio
async def test_dashboard(client):
    response = await client.get("/api/v1/dashboard")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "reports_in_scope" in body["data"]
