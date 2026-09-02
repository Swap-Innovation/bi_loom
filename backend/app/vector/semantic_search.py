from typing import Any

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import VectorIndex
from app.vector.embeddings import generate_embedding


async def clear_pluto_index(db: AsyncSession, project_id: str) -> None:
    await db.execute(
        delete(VectorIndex).where(
            VectorIndex.project_id == project_id,
            VectorIndex.object_type.in_(["column", "measure"]),
        )
    )
    await db.flush()


async def index_pluto_objects(db: AsyncSession, project_id: str, model_data: dict[str, Any]) -> int:
    count = 0
    for col in model_data.get("columns", []):
        name = f"{col.get('table', '')}.{col.get('column', '')}"
        desc = col.get("description", "")
        synonyms = " ".join(col.get("synonyms", []))
        embed_text = f"{name} {desc} {synonyms}".strip()
        embedding = await generate_embedding(embed_text)
        entry = VectorIndex(
            id=f"{project_id}-{col.get('table')}-{col.get('column')}",
            project_id=project_id,
            object_type="column",
            object_id=f"{col.get('table')}.{col.get('column')}",
            object_name=name,
            table_name=col.get("table"),
            metadata_json=col,
            embedding=embedding,
        )
        db.merge(entry)
        count += 1

    for measure in model_data.get("measures", []):
        name = f"{measure.get('table', '')}.{measure.get('name', '')}"
        desc = measure.get("description", "")
        embed_text = f"{name} {desc} measure".strip()
        embedding = await generate_embedding(embed_text)
        entry = VectorIndex(
            id=f"{project_id}-measure-{measure.get('name')}",
            project_id=project_id,
            object_type="measure",
            object_id=name,
            object_name=measure.get("name", ""),
            table_name=measure.get("table"),
            metadata_json=measure,
            embedding=embedding,
        )
        db.merge(entry)
        count += 1

    await db.flush()
    return count


async def semantic_search(
    db: AsyncSession,
    project_id: str,
    query_text: str,
    top_n: int = 10,
    object_type: str | None = None,
) -> list[dict[str, Any]]:
    embedding = await generate_embedding(query_text)
    embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"

    type_filter = f"AND object_type = '{object_type}'" if object_type else ""
    sql = text(f"""
        SELECT object_id, object_name, object_type, table_name, metadata_json,
               1 - (embedding <=> '{embedding_str}'::vector) AS similarity
        FROM vector_index
        WHERE project_id = :project_id {type_filter}
        ORDER BY embedding <=> '{embedding_str}'::vector
        LIMIT :top_n
    """)
    result = await db.execute(sql, {"project_id": project_id, "top_n": top_n})
    rows = result.fetchall()
    return [
        {
            "object_id": row[0],
            "object_name": row[1],
            "object_type": row[2],
            "table_name": row[3],
            "metadata": row[4],
            "similarity": float(row[5]),
        }
        for row in rows
    ]
