import pytest
from app.schemas.mspec import MSpec, MSpecReport, MSpecVisual, SourceTraceability
from app.parsers.business_objects.sql_parser import parse_sql
from app.ai.confidence_agent import exact_name_match, score_confidence_level
from app.ai.mock_responses import get_mock_response, AIMappingResult


def test_mspec_schema_roundtrip():
    mspec = MSpec(
        version="1.0",
        reports=[MSpecReport(id="r1", name="Test Report")],
        visuals=[MSpecVisual(id="v1", type="table", title="Summary")],
    )
    data = mspec.model_dump()
    restored = MSpec.model_validate(data)
    assert restored.version == "1.0"
    assert len(restored.reports) == 1
    assert restored.reports[0].name == "Test Report"


def test_source_traceability():
    source = SourceTraceability(file="report.xml", path="/query", line=120)
    assert source.file == "report.xml"
    assert source.line == 120


def test_sql_parser():
    sql = "SELECT c.CUSTOMER_ID FROM CUSTOMERS c JOIN ORDERS o ON c.CUSTOMER_ID = o.CUSTOMER_ID WHERE o.ORDER_DATE > '2024-01-01' GROUP BY c.CUSTOMER_ID"
    result = parse_sql(sql)
    assert "CUSTOMERS" in result["tables"] or "c" in result["tables"]
    assert len(result["aggregations"]) >= 0


def test_exact_name_match():
    columns = [{"table": "DimCustomer", "column": "CustomerKey"}]
    result = exact_name_match("CustomerKey", columns)
    assert result is not None
    assert result["target_table"] == "DimCustomer"
    assert result["confidence"] >= 90


def test_confidence_levels():
    assert score_confidence_level(95) == "HIGH"
    assert score_confidence_level(80) == "MEDIUM"
    assert score_confidence_level(50) == "LOW"


def test_mock_llm_response():
    result = get_mock_response("Map CUSTOMER_ID to Pluto", AIMappingResult)
    assert result.source_name == "CUSTOMER_ID"
    assert result.confidence >= 90
    assert result.confidence_level == "HIGH"


def test_mock_llm_unknown():
    result = get_mock_response("Map UNKNOWN_FIELD_XYZ", AIMappingResult)
    assert result.confidence_level == "LOW"


def test_live_llm_client_json_fallback():
    import asyncio
    from unittest.mock import AsyncMock, patch

    from app.ai.llm_client import OpenAILLMClient

    client = OpenAILLMClient(api_key="test-key", model="gpt-4o-mini")
    with patch.object(client, "_request", new_callable=AsyncMock, side_effect=RuntimeError("api down")):
        result = asyncio.run(client.complete_json("Map CUSTOMER_ID", AIMappingResult))
    assert result.source_name == "CUSTOMER_ID"
    assert result.confidence_level == "HIGH"


def test_get_llm_client_live_with_cursor_key():
    from app.ai.llm_client import CursorLLMClient, get_llm_client
    from app.core.config import settings

    original_mode = settings.ai_mode
    original_key = settings.cursor_api_key
    original_openai = settings.openai_api_key
    try:
        settings.ai_mode = "live"
        settings.cursor_api_key = "crsr_test_key"
        settings.openai_api_key = ""
        client = get_llm_client()
        assert isinstance(client, CursorLLMClient)
    finally:
        settings.ai_mode = original_mode
        settings.cursor_api_key = original_key
        settings.openai_api_key = original_openai


def test_get_llm_client_live_with_openai_key():
    from app.ai.llm_client import OpenAILLMClient, get_llm_client
    from app.core.config import settings

    original_mode = settings.ai_mode
    original_key = settings.openai_api_key
    original_cursor = settings.cursor_api_key
    try:
        settings.ai_mode = "live"
        settings.openai_api_key = "sk-test-key"
        settings.cursor_api_key = ""
        client = get_llm_client()
        assert isinstance(client, OpenAILLMClient)
    finally:
        settings.ai_mode = original_mode
        settings.openai_api_key = original_key
        settings.cursor_api_key = original_cursor
