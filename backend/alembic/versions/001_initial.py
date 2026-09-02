"""Initial schema."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("source_technology", sa.String(100), server_default="SAP Business Objects"),
        sa.Column("target_technology", sa.String(100), server_default="Power BI"),
        sa.Column(
            "status",
            sa.Enum(
                "CREATED", "UPLOADED", "PARSING", "PARSED", "MAPPING", "REVIEW_REQUIRED",
                "MAPPING_APPROVED", "GENERATING", "GENERATED", "VALIDATING", "COMPLETED", "FAILED",
                name="projectstatus",
            ),
            server_default="CREATED",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "artifacts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("filename", sa.String(512), nullable=False),
        sa.Column("file_type", sa.String(50)),
        sa.Column("file_size", sa.Integer),
        sa.Column("storage_path", sa.String(1024), nullable=False),
        sa.Column("status", sa.String(50), server_default="UPLOADED"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "parse_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("status", sa.String(50), server_default="PENDING"),
        sa.Column("progress", sa.JSON),
        sa.Column("capability_report", sa.JSON),
        sa.Column("error_message", sa.Text),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "mspec_documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("version", sa.String(20), server_default="1.0"),
        sa.Column("mspec", sa.JSON, nullable=False),
        sa.Column("is_mapped", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "pluto_models",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("model_data", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "glossary_terms",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("term", sa.String(255), nullable=False),
        sa.Column("synonyms", sa.JSON),
        sa.Column("definition", sa.Text),
        sa.Column("embedding", Vector(384)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "vector_index",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("object_type", sa.String(50), nullable=False),
        sa.Column("object_id", sa.String(255), nullable=False),
        sa.Column("object_name", sa.String(512), nullable=False),
        sa.Column("table_name", sa.String(255)),
        sa.Column("metadata_json", sa.JSON),
        sa.Column("embedding", Vector(384), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "mappings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_id", sa.String(255)),
        sa.Column("source_name", sa.String(512), nullable=False),
        sa.Column("source_context", sa.JSON),
        sa.Column("target_type", sa.String(50)),
        sa.Column("target_table", sa.String(255)),
        sa.Column("target_column", sa.String(255)),
        sa.Column("target_measure", sa.String(255)),
        sa.Column("target_expression", sa.Text),
        sa.Column("confidence", sa.Float, server_default="0"),
        sa.Column("confidence_level", sa.Enum("HIGH", "MEDIUM", "LOW", name="confidencelevel"), server_default="LOW"),
        sa.Column("reasoning", sa.JSON),
        sa.Column("evidence", sa.JSON),
        sa.Column("recommendation", sa.Text),
        sa.Column(
            "status",
            sa.Enum("PENDING_REVIEW", "APPROVED", "REJECTED", "MODIFIED", name="mappingstatus"),
            server_default="PENDING_REVIEW",
        ),
        sa.Column("reviewer", sa.String(255)),
        sa.Column("review_comment", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "mapping_reviews",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("mapping_id", sa.String(36), sa.ForeignKey("mappings.id"), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("reviewer", sa.String(255)),
        sa.Column("comment", sa.Text),
        sa.Column("previous_target", sa.JSON),
        sa.Column("new_target", sa.JSON),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "approved_mappings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_name", sa.String(512), nullable=False),
        sa.Column("target_table", sa.String(255)),
        sa.Column("target_column", sa.String(255)),
        sa.Column("target_measure", sa.String(255)),
        sa.Column("embedding", Vector(384)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "generation_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("status", sa.String(50), server_default="PENDING"),
        sa.Column("output_path", sa.String(1024)),
        sa.Column("error_message", sa.Text),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "generated_artifacts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("generation_run_id", sa.String(36), sa.ForeignKey("generation_runs.id"), nullable=False),
        sa.Column("artifact_type", sa.String(50), nullable=False),
        sa.Column("filename", sa.String(512), nullable=False),
        sa.Column("storage_path", sa.String(1024), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "validation_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("status", sa.String(50), server_default="PENDING"),
        sa.Column("results", sa.JSON),
        sa.Column("migration_score", sa.Float),
        sa.Column("error_message", sa.Text),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("job_type", sa.Enum("PARSE", "MAPPING", "GENERATION", "VALIDATION", name="jobtype"), nullable=False),
        sa.Column("status", sa.Enum("PENDING", "RUNNING", "COMPLETED", "FAILED", name="jobstatus"), server_default="PENDING"),
        sa.Column("progress", sa.JSON),
        sa.Column("result", sa.JSON),
        sa.Column("error_message", sa.Text),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id")),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(50)),
        sa.Column("entity_id", sa.String(36)),
        sa.Column("details", sa.JSON),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    for table in [
        "audit_logs", "jobs", "validation_runs", "generated_artifacts", "generation_runs",
        "approved_mappings", "mapping_reviews", "mappings", "vector_index", "glossary_terms",
        "pluto_models", "mspec_documents", "parse_runs", "artifacts", "projects",
    ]:
        op.drop_table(table)
    for enum_name in ["jobstatus", "jobtype", "mappingstatus", "confidencelevel", "projectstatus"]:
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
