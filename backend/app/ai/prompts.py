from pathlib import Path
from typing import Any

from app.core.config import settings


def load_prompt(name: str) -> str:
    prompt_path = Path(__file__).parent.parent.parent / "prompts" / name
    if prompt_path.exists():
        return prompt_path.read_text()
    return f"Analyze and map the following object. Prompt template {name} not found."


def build_mapping_prompt(
    source_name: str,
    source_type: str,
    source_context: dict[str, Any],
    candidates: list[dict[str, Any]],
    glossary_matches: list[str],
    approved_examples: list[dict[str, Any]],
) -> str:
    template = load_prompt("object_mapping_v1.txt")
    return template.format(
        source_name=source_name,
        source_type=source_type,
        source_context=str(source_context),
        candidates=str(candidates[:10]),
        glossary_matches=str(glossary_matches),
        approved_examples=str(approved_examples[:5]),
    )
