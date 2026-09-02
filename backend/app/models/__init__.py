import enum
from datetime import datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.core.database import Base


class ProjectStatus(str, enum.Enum):
    CREATED = "CREATED"
    UPLOADED = "UPLOADED"
    PARSING = "PARSING"
    PARSED = "PARSED"
    MAPPING = "MAPPING"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    MAPPING_APPROVED = "MAPPING_APPROVED"
    GENERATING = "GENERATING"
    GENERATED = "GENERATED"
    VALIDATING = "VALIDATING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class MappingStatus(str, enum.Enum):
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    MODIFIED = "MODIFIED"


class ConfidenceLevel(str, enum.Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class JobStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class JobType(str, enum.Enum):
    PARSE = "PARSE"
    MAPPING = "MAPPING"
    CONVERSION = "CONVERSION"
    GENERATION = "GENERATION"
    VALIDATION = "VALIDATION"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    source_technology: Mapped[str] = mapped_column(String(100), default="SAP Business Objects")
    target_technology: Mapped[str] = mapped_column(String(100), default="Power BI")
    status: Mapped[ProjectStatus] = mapped_column(Enum(ProjectStatus), default=ProjectStatus.CREATED)
    selected_pluto_model_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("pluto_models.id"), nullable=True)
    active_mspec_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("mspec_documents.id"), nullable=True)
    settings: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=dict)
    owner_id: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    artifacts: Mapped[list["Artifact"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    parse_runs: Mapped[list["ParseRun"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    mspec_documents: Mapped[list["MSpecDocument"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        foreign_keys="MSpecDocument.project_id",
    )
    pluto_models: Mapped[list["PlutoModel"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        foreign_keys="PlutoModel.project_id",
    )
    glossary_terms: Mapped[list["GlossaryTerm"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    mappings: Mapped[list["Mapping"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    jobs: Mapped[list["Job"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50))
    file_size: Mapped[int] = mapped_column(Integer)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="UPLOADED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="artifacts")


class ParseRun(Base):
    __tablename__ = "parse_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="PENDING")
    progress: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    capability_report: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="parse_runs")


class MSpecDocument(Base):
    __tablename__ = "mspec_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    version: Mapped[str] = mapped_column(String(20), default="1.0")
    mspec: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    is_mapped: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped["Project"] = relationship(
        back_populates="mspec_documents",
        foreign_keys=[project_id],
    )


class PlutoModel(Base):
    __tablename__ = "pluto_models"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), default="Imported Model")
    catalog_id: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(default=False)
    model_data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(
        back_populates="pluto_models",
        foreign_keys=[project_id],
    )


class GlossaryTerm(Base):
    __tablename__ = "glossary_terms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    term: Mapped[str] = mapped_column(String(255), nullable=False)
    synonyms: Mapped[list[str] | None] = mapped_column(JSONB)
    definition: Mapped[str | None] = mapped_column(Text)
    embedding = mapped_column(Vector(settings.embedding_dimensions), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="glossary_terms")


class VectorIndex(Base):
    __tablename__ = "vector_index"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    object_type: Mapped[str] = mapped_column(String(50), nullable=False)
    object_id: Mapped[str] = mapped_column(String(255), nullable=False)
    object_name: Mapped[str] = mapped_column(String(512), nullable=False)
    table_name: Mapped[str | None] = mapped_column(String(255))
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    embedding = mapped_column(Vector(settings.embedding_dimensions), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Mapping(Base):
    __tablename__ = "mappings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[str | None] = mapped_column(String(255))
    source_name: Mapped[str] = mapped_column(String(512), nullable=False)
    source_context: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    target_type: Mapped[str | None] = mapped_column(String(50))
    target_table: Mapped[str | None] = mapped_column(String(255))
    target_column: Mapped[str | None] = mapped_column(String(255))
    target_measure: Mapped[str | None] = mapped_column(String(255))
    target_expression: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    confidence_level: Mapped[ConfidenceLevel] = mapped_column(Enum(ConfidenceLevel), default=ConfidenceLevel.LOW)
    reasoning: Mapped[list[str] | None] = mapped_column(JSONB)
    evidence: Mapped[list[str] | None] = mapped_column(JSONB)
    recommendation: Mapped[str | None] = mapped_column(Text)
    status: Mapped[MappingStatus] = mapped_column(Enum(MappingStatus), default=MappingStatus.PENDING_REVIEW)
    reviewer: Mapped[str | None] = mapped_column(String(255))
    review_comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped["Project"] = relationship(back_populates="mappings")
    reviews: Mapped[list["MappingReview"]] = relationship(back_populates="mapping", cascade="all, delete-orphan")


class MappingReview(Base):
    __tablename__ = "mapping_reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    mapping_id: Mapped[str] = mapped_column(String(36), ForeignKey("mappings.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    reviewer: Mapped[str | None] = mapped_column(String(255))
    comment: Mapped[str | None] = mapped_column(Text)
    previous_target: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    new_target: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    mapping: Mapped["Mapping"] = relationship(back_populates="reviews")


class ApprovedMapping(Base):
    __tablename__ = "approved_mappings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_name: Mapped[str] = mapped_column(String(512), nullable=False)
    target_table: Mapped[str | None] = mapped_column(String(255))
    target_column: Mapped[str | None] = mapped_column(String(255))
    target_measure: Mapped[str | None] = mapped_column(String(255))
    embedding = mapped_column(Vector(settings.embedding_dimensions), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GenerationRun(Base):
    __tablename__ = "generation_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="PENDING")
    output_path: Mapped[str | None] = mapped_column(String(1024))
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GeneratedArtifact(Base):
    __tablename__ = "generated_artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    generation_run_id: Mapped[str] = mapped_column(String(36), ForeignKey("generation_runs.id"), nullable=False)
    artifact_type: Mapped[str] = mapped_column(String(50), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ValidationRun(Base):
    __tablename__ = "validation_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="PENDING")
    results: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    migration_score: Mapped[float | None] = mapped_column(Float)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    job_type: Mapped[JobType] = mapped_column(Enum(JobType), nullable=False)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.PENDING)
    progress: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="jobs")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("projects.id"))
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(50))
    entity_id: Mapped[str | None] = mapped_column(String(36))
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ConversionRun(Base):
    __tablename__ = "conversion_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="PENDING")
    progress: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ConversionItem(Base):
    __tablename__ = "conversion_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    conversion_run_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("conversion_runs.id"))
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[str] = mapped_column(String(255), nullable=False)
    source_name: Mapped[str] = mapped_column(String(512), nullable=False)
    source_path: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    target_type: Mapped[str | None] = mapped_column(String(50))
    target_id: Mapped[str | None] = mapped_column(String(255))
    target_path: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    conversion_step: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    mapping_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("mappings.id"))
    error_message: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
