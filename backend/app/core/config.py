from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_PROJECT_ROOT = Path(__file__).resolve().parents[3]


def _discover_env_files() -> tuple[str, ...]:
    """Load root .env then secrets/cursor.env (later files override)."""
    candidates = [
        _PROJECT_ROOT / ".env",
        _PROJECT_ROOT / "secrets" / "cursor.env",
        Path(".env"),
        Path("secrets/cursor.env"),
    ]
    return tuple(str(p) for p in candidates if p.is_file())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_discover_env_files(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://migration:migration@localhost:5432/bi_loom"
    ai_mode: str = "mock"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    cursor_api_key: str = ""
    cursor_model: str = "auto"
    cursor_api_base_url: str = "https://api.cursor.com"
    cursor_agent_pool: str = ""
    confidence_high_threshold: int = 90
    confidence_medium_threshold: int = 70
    storage_backend: str = "local"
    storage_path: str = "./data/artifacts"
    log_level: str = "INFO"
    max_upload_size_mb: int = 100
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    score_weight_mapping_coverage: float = 0.40
    score_weight_mapping_confidence: float = 0.20
    score_weight_report_coverage: float = 0.20
    score_weight_visual_coverage: float = 0.10
    score_weight_validation: float = 0.10
    embedding_dimensions: int = 384

    @property
    def llm_api_key(self) -> str:
        return self.cursor_api_key or self.openai_api_key

    @property
    def llm_model(self) -> str:
        if self.cursor_api_key:
            return self.cursor_model
        return self.openai_model

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


settings = Settings()
