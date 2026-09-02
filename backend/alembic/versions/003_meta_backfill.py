"""Backfill pluto_models columns from legacy _meta in model_data."""

from typing import Sequence, Union

from alembic import op

revision: str = "003_meta_backfill"
down_revision: Union[str, None] = "002_production_upgrade"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE pluto_models
        SET
            name = COALESCE(NULLIF(model_data->'_meta'->>'name', ''), name),
            catalog_id = COALESCE(model_data->'_meta'->>'catalog_id', catalog_id),
            is_active = COALESCE((model_data->'_meta'->>'is_active')::boolean, is_active)
        WHERE model_data::jsonb ? '_meta'
    """)


def downgrade() -> None:
    pass
