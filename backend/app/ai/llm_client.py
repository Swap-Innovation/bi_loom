import json
import logging
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any, Type

import httpx
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class LLMClient(ABC):
    @abstractmethod
    async def complete_json(self, prompt: str, schema: Type[BaseModel]) -> BaseModel:
        pass

    async def complete_chat(
        self,
        message: str,
        project_context: str,
        page_context: str,
        history: list[dict[str, str]],
        prompt_template: str,
        activity_context: str = "(none)",
    ) -> str:
        prompt = self._format_chat_prompt(
            message, project_context, page_context, history, prompt_template, activity_context,
        )
        return await self._complete_text(prompt, message, project_context, page_context)

    def _format_chat_prompt(
        self,
        message: str,
        project_context: str,
        page_context: str,
        history: list[dict[str, str]],
        prompt_template: str,
        activity_context: str = "(none)",
    ) -> str:
        history_text = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in history[-24:])
        return prompt_template.format(
            project_context=project_context,
            page_context=page_context,
            activity_context=activity_context[:8000] if activity_context else "(none)",
            history=history_text or "(none)",
            message=message,
        )

    async def stream_chat(
        self,
        message: str,
        project_context: str,
        page_context: str,
        history: list[dict[str, str]],
        prompt_template: str,
        activity_context: str = "(none)",
    ) -> AsyncIterator[dict[str, Any]]:
        """Default: non-streaming fallback that yields a single token then done."""
        reply = await self.complete_chat(
            message, project_context, page_context, history, prompt_template, activity_context,
        )
        yield {"type": "status", "text": "Generating reply…", "status": "running"}
        yield {"type": "token", "text": reply}
        yield {"type": "done", "text": reply}

    @abstractmethod
    async def _complete_text(
        self,
        prompt: str,
        message: str,
        project_context: str,
        page_context: str,
    ) -> str:
        pass


class MockLLMClient(LLMClient):
    async def complete_json(self, prompt: str, schema: Type[BaseModel]) -> BaseModel:
        from app.ai.mock_responses import get_mock_response
        return get_mock_response(prompt, schema)

    async def _complete_text(
        self, prompt: str, message: str, project_context: str, page_context: str
    ) -> str:
        from app.ai.chat_responses import get_mock_chat_response
        return get_mock_chat_response(message, project_context, page_context)


class OpenAILLMClient(LLMClient):
    """OpenAI-compatible chat completions (OpenAI, Azure, Ollama proxy)."""

    def __init__(self, api_key: str, model: str, base_url: str = "https://api.openai.com/v1"):
        self.api_key = api_key
        self.model = model if model and model != "cursor-default" else "gpt-4o-mini"
        self.base_url = base_url.rstrip("/")

    async def _request(self, messages: list[dict[str, str]], *, json_mode: bool) -> str:
        payload: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.2,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def complete_json(self, prompt: str, schema: Type[BaseModel]) -> BaseModel:
        schema_hint = json.dumps(schema.model_json_schema(), indent=2)
        full_prompt = f"{prompt}\n\nRespond with JSON only matching this schema:\n{schema_hint}"
        try:
            text = await self._request([{"role": "user", "content": full_prompt}], json_mode=True)
            return schema.model_validate(json.loads(text))
        except Exception as exc:
            logger.warning("openai_llm_json_fallback", extra={"error": str(exc)})
            from app.ai.mock_responses import get_mock_response
            return get_mock_response(prompt, schema)

    async def _complete_text(
        self, prompt: str, message: str, project_context: str, page_context: str
    ) -> str:
        try:
            return await self._request([{"role": "user", "content": prompt}], json_mode=False)
        except Exception as exc:
            logger.warning("openai_llm_chat_fallback", extra={"error": str(exc)})
            from app.ai.chat_responses import get_mock_chat_response
            return get_mock_chat_response(message, project_context, page_context)


class CursorLLMClient(LLMClient):
    """Live LLM via Cursor Cloud Agents API (CURSOR_API_KEY / crsr_*)."""

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = "https://api.cursor.com",
        agent_pool: str | None = None,
    ):
        from app.ai.cursor_client import CursorCloudClient

        self._cursor = CursorCloudClient(
            api_key=api_key,
            model=model,
            base_url=base_url,
            agent_pool=agent_pool or None,
        )

    async def complete_json(self, prompt: str, schema: Type[BaseModel]) -> BaseModel:
        from app.ai.cursor_client import extract_json_object

        schema_hint = json.dumps(schema.model_json_schema(), indent=2)
        full_prompt = (
            f"{prompt}\n\n"
            "You are a data migration assistant. Reply with JSON only — no markdown, no explanation.\n"
            f"Schema:\n{schema_hint}"
        )
        try:
            text = await self._cursor.complete_text(full_prompt)
            return schema.model_validate(extract_json_object(text))
        except Exception as exc:
            logger.warning("cursor_llm_json_fallback", extra={"error": str(exc)})
            from app.ai.mock_responses import get_mock_response
            return get_mock_response(prompt, schema)

    async def _complete_text(
        self, prompt: str, message: str, project_context: str, page_context: str
    ) -> str:
        try:
            return await self._cursor.complete_text(prompt)
        except Exception as exc:
            logger.warning("cursor_llm_chat_fallback", extra={"error": str(exc)})
            from app.ai.chat_responses import get_mock_chat_response
            return get_mock_chat_response(message, project_context, page_context)

    async def stream_chat(
        self,
        message: str,
        project_context: str,
        page_context: str,
        history: list[dict[str, str]],
        prompt_template: str,
        activity_context: str = "(none)",
    ) -> AsyncIterator[dict[str, Any]]:
        prompt = self._format_chat_prompt(
            message, project_context, page_context, history, prompt_template, activity_context,
        )
        try:
            async for event in self._cursor.stream_chat(prompt):
                yield event
                if event.get("type") == "error":
                    # Fall back to mock reply so UI still gets an answer
                    from app.ai.chat_responses import get_mock_chat_response
                    reply = get_mock_chat_response(message, project_context, page_context)
                    yield {"type": "token", "text": reply}
                    yield {"type": "done", "text": reply}
                    return
        except Exception as exc:
            logger.warning("cursor_llm_stream_fallback", extra={"error": str(exc)})
            from app.ai.chat_responses import get_mock_chat_response
            reply = get_mock_chat_response(message, project_context, page_context)
            yield {"type": "status", "text": f"Stream unavailable ({exc}) — mock reply", "status": "running"}
            yield {"type": "token", "text": reply}
            yield {"type": "done", "text": reply}


LiveLLMClient = OpenAILLMClient


def get_llm_client() -> LLMClient:
    from app.core.config import settings

    if settings.ai_mode == "mock":
        return MockLLMClient()

    if settings.cursor_api_key:
        return CursorLLMClient(
            api_key=settings.cursor_api_key,
            model=settings.cursor_model,
            base_url=settings.cursor_api_base_url,
            agent_pool=settings.cursor_agent_pool or None,
        )

    if settings.openai_api_key:
        return OpenAILLMClient(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            base_url=settings.openai_base_url,
        )

    logger.warning(
        "AI_MODE=live but no CURSOR_API_KEY set in secrets/cursor.env — falling back to mock"
    )
    return MockLLMClient()


def get_ai_status() -> dict[str, str]:
    """Describe which LLM backend is active (for UI status badge)."""
    from app.core.config import settings

    if settings.ai_mode == "mock":
        return {"mode": "mock", "provider": "mock", "model": "", "label": "Mock"}

    if settings.cursor_api_key:
        return {
            "mode": "live",
            "provider": "cursor",
            "model": settings.cursor_model,
            "label": "Live",
        }

    if settings.openai_api_key:
        return {
            "mode": "live",
            "provider": "openai",
            "model": settings.openai_model,
            "label": "Live",
        }

    return {
        "mode": "live",
        "provider": "mock",
        "model": "",
        "label": "Mock fallback",
    }
