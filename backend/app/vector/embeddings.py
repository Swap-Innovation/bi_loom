import hashlib
import re

import numpy as np

from app.core.config import settings


def _hash_embed(text: str, dimensions: int = None) -> list[float]:
    dims = dimensions or settings.embedding_dimensions
    h = hashlib.sha256(text.lower().encode()).digest()
    rng = np.random.RandomState(int.from_bytes(h[:4], "big"))
    vec = rng.randn(dims).astype(np.float32)
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return vec.tolist()


async def generate_embedding(text: str) -> list[float]:
    # MVP: deterministic local embeddings (no external API).
    # CURSOR_API_KEY does not affect embedding generation in dummy mode.
    return _hash_embed(text)


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())
