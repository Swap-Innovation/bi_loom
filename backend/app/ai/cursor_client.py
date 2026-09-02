"""Cursor Cloud Agents client — one-shot and token streaming via SDK."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import threading
from collections.abc import AsyncIterator, Callable
from typing import Any

from cursor_sdk import (
    Agent,
    AgentOptions,
    CloudAgentOptions,
    CloudEnvironment,
    CursorAgentError,
    SendOptions,
)

logger = logging.getLogger(__name__)


def extract_json_object(text: str) -> dict[str, Any]:
    """Parse JSON from agent reply (raw or fenced)."""
    text = text.strip()
    if text.startswith("{"):
        return json.loads(text)
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        return json.loads(fence.group(1))
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        return json.loads(text[start : end + 1])
    raise ValueError("No JSON object found in Cursor agent response")


class CursorCloudClient:
    """Cloud agents via Cursor SDK (empty workspace — chat / JSON helpers)."""

    def __init__(
        self,
        api_key: str,
        model: str = "auto",
        base_url: str = "https://api.cursor.com",
        agent_pool: str | None = None,
        poll_interval_s: float = 2.0,
        max_wait_s: float = 120.0,
    ):
        self.api_key = api_key
        self.model = model if model and model not in ("cursor-default", "gpt-4o-mini") else "auto"
        self.base_url = base_url.rstrip("/")
        self.agent_pool = agent_pool
        self.poll_interval_s = poll_interval_s
        self.max_wait_s = max_wait_s

    def _agent_options(self) -> AgentOptions:
        cloud_kwargs: dict[str, Any] = {"repos": []}
        if self.agent_pool:
            cloud_kwargs["env"] = CloudEnvironment(type="pool", name=self.agent_pool)
        return AgentOptions(
            api_key=self.api_key,
            model=self.model,
            cloud=CloudAgentOptions(**cloud_kwargs),
        )

    def _run_prompt(self, prompt: str) -> str:
        """One-shot (no stream) — used for JSON mapping helpers."""
        options = self._agent_options()
        try:
            result = Agent.prompt(prompt, options)
        except CursorAgentError as exc:
            raise RuntimeError(f"Cursor agent startup failed: {exc.message}") from exc

        if result.status == "error":
            raise RuntimeError(f"Cursor agent run failed: {result.id}")
        text = (result.result or "").strip()
        if not text:
            raise RuntimeError("Cursor run finished with empty result")
        return text

    async def complete_text(self, prompt: str) -> str:
        return await asyncio.to_thread(self._run_prompt, prompt)

    def _stream_sync(
        self,
        prompt: str,
        on_event: Callable[[dict[str, Any]], None],
    ) -> str:
        """
        Create cloud agent, send prompt, stream thinking + assistant deltas via on_delta.
        Returns final assistant text.
        """
        assistant_parts: list[str] = []
        thinking_parts: list[str] = []

        def on_delta(update: Any) -> None:
            utype = getattr(update, "type", None) or ""
            text = getattr(update, "text", None) or ""
            if not text and utype not in ("tool_call", "status"):
                # Some deltas nest text differently
                text = getattr(update, "delta", None) or ""
            if utype in ("thinking-delta", "thinking_delta"):
                thinking_parts.append(text)
                on_event({"type": "thinking", "text": text})
            elif utype in ("text-delta", "text_delta", "assistant-delta"):
                assistant_parts.append(text)
                on_event({"type": "token", "text": text})
            elif utype in ("tool-call-started", "tool_call_started"):
                name = getattr(update, "name", None) or getattr(update, "tool_name", None) or "tool"
                on_event({"type": "tool", "text": f"Tool started: {name}", "status": "running"})
            elif utype in ("tool-call-completed", "tool_call_completed"):
                name = getattr(update, "name", None) or getattr(update, "tool_name", None) or "tool"
                on_event({"type": "tool", "text": f"Tool finished: {name}", "status": "complete"})

        try:
            with Agent.create(self._agent_options()) as agent:
                on_event({"type": "status", "text": "Cursor agent started", "status": "running"})
                run = agent.send(
                    prompt,
                    SendOptions(on_delta=on_delta, mode="agent"),
                )
                result = run.wait()
                if result.status == "error":
                    raise RuntimeError(f"Cursor agent run failed: {result.id}")
                final = (result.result or "".join(assistant_parts) or "").strip()
                if not final:
                    raise RuntimeError("Cursor run finished with empty result")
                on_event({"type": "done", "text": final})
                return final
        except CursorAgentError as exc:
            raise RuntimeError(f"Cursor agent startup failed: {exc.message}") from exc

    async def stream_chat(self, prompt: str) -> AsyncIterator[dict[str, Any]]:
        """Async generator of {type, text, ...} events for SSE chat."""
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

        def on_event(event: dict[str, Any]) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, event)

        def worker() -> None:
            try:
                self._stream_sync(prompt, on_event)
            except Exception as exc:
                loop.call_soon_threadsafe(
                    queue.put_nowait,
                    {"type": "error", "text": str(exc)},
                )
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)

        thread = threading.Thread(target=worker, name="cursor-stream", daemon=True)
        thread.start()

        while True:
            item = await queue.get()
            if item is None:
                break
            yield item
