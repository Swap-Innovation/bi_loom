from typing import Any

from app.core.config import settings
from app.vector.embeddings import normalize_name


def score_confidence_level(confidence: float) -> str:
    if confidence >= settings.confidence_high_threshold:
        return "HIGH"
    if confidence >= settings.confidence_medium_threshold:
        return "MEDIUM"
    return "LOW"


def exact_name_match(source_name: str, pluto_columns: list[dict]) -> dict[str, Any] | None:
    source_norm = normalize_name(source_name)
    for col in pluto_columns:
        col_norm = normalize_name(col.get("column", ""))
        if source_norm == col_norm:
            return {
                "target_table": col["table"],
                "target_column": col["column"],
                "confidence": 95,
                "reasoning": ["Exact normalized name match"],
                "evidence": [f"Normalized: {source_norm} = {col_norm}"],
            }
    return None


def normalized_name_match(source_name: str, pluto_columns: list[dict]) -> dict[str, Any] | None:
    source_norm = normalize_name(source_name)
    best_match = None
    best_score = 0
    for col in pluto_columns:
        col_norm = normalize_name(col.get("column", ""))
        if source_norm in col_norm or col_norm in source_norm:
            score = len(set(source_norm) & set(col_norm)) / max(len(source_norm), len(col_norm)) * 100
            if score > best_score:
                best_score = score
                best_match = {
                    "target_table": col["table"],
                    "target_column": col["column"],
                    "confidence": min(score, 85),
                    "reasoning": ["Partial normalized name match"],
                    "evidence": [f"Partial match: {source_norm} ~ {col_norm}"],
                }
    return best_match


def glossary_match(source_name: str, glossary_terms: list[dict]) -> list[str]:
    matches = []
    source_lower = source_name.lower()
    for term in glossary_terms:
        if term.get("term", "").lower() in source_lower:
            matches.append(term["term"])
        for syn in term.get("synonyms", []):
            if syn.lower() in source_lower:
                matches.append(term["term"])
    return matches
