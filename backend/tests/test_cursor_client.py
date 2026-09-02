from unittest.mock import MagicMock, patch

import pytest

from app.ai.cursor_client import CursorCloudClient, extract_json_object


def test_extract_json_object_from_fence():
    text = 'Here is the result:\n```json\n{"ok": true}\n```'
    assert extract_json_object(text) == {"ok": True}


@pytest.mark.asyncio
async def test_cursor_cloud_client_uses_sdk_prompt():
    client = CursorCloudClient(api_key="crsr_test", model="auto")
    mock_result = MagicMock(status="finished", result="Hello from Cursor", id="run-test")

    with patch("app.ai.cursor_client.Agent.prompt", return_value=mock_result) as mock_prompt:
        with patch("asyncio.to_thread", side_effect=lambda fn, arg: fn(arg)):
            result = await client.complete_text("Say hello")

    assert result == "Hello from Cursor"
    mock_prompt.assert_called_once()
    args, _kwargs = mock_prompt.call_args
    assert args[0] == "Say hello"
    assert args[1].api_key == "crsr_test"
    assert args[1].model == "auto"


@pytest.mark.asyncio
async def test_cursor_stream_chat_emits_tokens():
    client = CursorCloudClient(api_key="crsr_test", model="auto")

    def fake_stream(prompt, on_event):
        on_event({"type": "thinking", "text": "reason"})
        on_event({"type": "token", "text": "Hello"})
        on_event({"type": "token", "text": " world"})
        on_event({"type": "done", "text": "Hello world"})
        return "Hello world"

    with patch.object(client, "_stream_sync", side_effect=fake_stream):
        events = [e async for e in client.stream_chat("hi")]

    types = [e["type"] for e in events]
    assert "thinking" in types
    assert types.count("token") == 2
    assert events[-1]["type"] == "done"
    assert events[-1]["text"] == "Hello world"
