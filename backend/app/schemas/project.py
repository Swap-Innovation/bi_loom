from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models import ConfidenceLevel, MappingStatus, ProjectStatus


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    source_technology: str = "SAP Business Objects"
    target_technology: str = "Power BI"


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str | None
    source_technology: str
    target_technology: str
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ArtifactResponse(BaseModel):
    id: str
    project_id: str
    filename: str
    file_type: str | None
    file_size: int
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MappingResponse(BaseModel):
    id: str
    project_id: str
    source_type: str
    source_id: str | None
    source_name: str
    source_context: dict[str, Any] | None
    target_type: str | None
    target_table: str | None
    target_column: str | None
    target_measure: str | None
    target_expression: str | None
    confidence: float
    confidence_level: ConfidenceLevel
    reasoning: list[str] | None
    evidence: list[str] | None
    recommendation: str | None
    status: MappingStatus
    reviewer: str | None
    review_comment: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MappingUpdate(BaseModel):
    target_table: str | None = None
    target_column: str | None = None
    target_measure: str | None = None
    target_expression: str | None = None
    reviewer: str | None = None
    review_comment: str | None = None


class MappingReviewRequest(BaseModel):
    reviewer: str | None = None
    comment: str | None = None


class JobResponse(BaseModel):
    id: str
    project_id: str
    job_type: str
    status: str
    progress: dict[str, Any] | None
    result: dict[str, Any] | None
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ParseStatusResponse(BaseModel):
    parse_run_id: str
    status: str
    progress: dict[str, Any] | None
    capability_report: dict[str, Any] | None
    error_message: str | None


class ValidationResponse(BaseModel):
    validation_run_id: str
    status: str
    results: dict[str, Any] | None
    migration_score: float | None


class ResultsResponse(BaseModel):
    project_id: str
    status: str
    migration_score: float | None
    reports_generated: int
    reports_requiring_review: int
    unsupported_items: int
    manual_actions: int
    mapping_coverage: float | None
    high_confidence_pct: float | None
    medium_confidence_pct: float | None
    low_confidence_pct: float | None
    downloads: list[dict[str, str]] = Field(default_factory=list)


class DashboardStats(BaseModel):
    reports_in_scope: int = 184
    parsed: int = 0
    mapped: int = 0
    generated: int = 0
    validation_passed: int = 0
    migration_progress: float = 0.0
    high_confidence: int = 0
    needs_review: int = 0
    unsupported: int = 0
