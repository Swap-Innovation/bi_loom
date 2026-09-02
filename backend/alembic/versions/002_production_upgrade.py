"""Production upgrade schema migration."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_production_upgrade"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("selected_pluto_model_id", sa.String(36), nullable=True))
    op.add_column("projects", sa.Column("active_mspec_id", sa.String(36), nullable=True))
    op.add_column("projects", sa.Column("settings", sa.JSON(), server_default="{}", nullable=True))
    op.add_column("projects", sa.Column("owner_id", sa.String(255), nullable=True))

    op.add_column("pluto_models", sa.Column("name", sa.String(255), server_default="Imported Model", nullable=False))
    op.add_column("pluto_models", sa.Column("catalog_id", sa.String(100), nullable=True))
    op.add_column("pluto_models", sa.Column("is_active", sa.Boolean(), server_default="false", nullable=False))

    op.create_foreign_key(
        "fk_projects_selected_pluto_model", "projects", "pluto_models",
        ["selected_pluto_model_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_projects_active_mspec", "projects", "mspec_documents",
        ["active_mspec_id"], ["id"], ondelete="SET NULL",
    )

    op.create_table(
        "conversion_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("status", sa.String(50), server_default="PENDING"),
        sa.Column("progress", sa.JSON()),
        sa.Column("error_message", sa.Text()),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "conversion_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("conversion_run_id", sa.String(36), sa.ForeignKey("conversion_runs.id"), nullable=True),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_id", sa.String(255), nullable=False),
        sa.Column("source_name", sa.String(512), nullable=False),
        sa.Column("source_path", sa.JSON()),
        sa.Column("target_type", sa.String(50)),
        sa.Column("target_id", sa.String(255)),
        sa.Column("target_path", sa.JSON()),
        sa.Column("conversion_step", sa.String(50), nullable=False),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("mapping_id", sa.String(36), sa.ForeignKey("mappings.id"), nullable=True),
        sa.Column("error_message", sa.Text()),
        sa.Column("metadata_json", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "source_type", "source_id", name="uq_conversion_item_source"),
    )

    op.create_index("ix_conversion_items_project", "conversion_items", ["project_id"])
    op.create_index("ix_conversion_items_status", "conversion_items", ["project_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_conversion_items_status", "conversion_items")
    op.drop_index("ix_conversion_items_project", "conversion_items")
    op.drop_table("conversion_items")
    op.drop_table("conversion_runs")
    op.drop_constraint("fk_projects_active_mspec", "projects", type_="foreignkey")
    op.drop_constraint("fk_projects_selected_pluto_model", "projects", type_="foreignkey")
    op.drop_column("pluto_models", "is_active")
    op.drop_column("pluto_models", "catalog_id")
    op.drop_column("pluto_models", "name")
    op.drop_column("projects", "owner_id")
    op.drop_column("projects", "settings")
    op.drop_column("projects", "active_mspec_id")
    op.drop_column("projects", "selected_pluto_model_id")
