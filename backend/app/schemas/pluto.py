from typing import Any

from pydantic import BaseModel, Field


class PlutoColumn(BaseModel):
    table: str
    column: str
    type: str
    description: str | None = None
    display_name: str | None = None
    synonyms: list[str] = Field(default_factory=list)


class PlutoMeasure(BaseModel):
    table: str
    name: str
    expression: str | None = None
    description: str | None = None
    display_name: str | None = None
    synonyms: list[str] = Field(default_factory=list)


class PlutoRelationship(BaseModel):
    from_table: str
    from_column: str
    to_table: str
    to_column: str
    cardinality: str | None = None


class PlutoHierarchy(BaseModel):
    table: str
    name: str
    levels: list[str] = Field(default_factory=list)


class PlutoModelSchema(BaseModel):
    tables: list[dict[str, Any]] = Field(default_factory=list)
    columns: list[PlutoColumn] = Field(default_factory=list)
    measures: list[PlutoMeasure] = Field(default_factory=list)
    relationships: list[PlutoRelationship] = Field(default_factory=list)
    hierarchies: list[PlutoHierarchy] = Field(default_factory=list)


class GlossaryTermSchema(BaseModel):
    term: str
    synonyms: list[str] = Field(default_factory=list)
    definition: str | None = None
