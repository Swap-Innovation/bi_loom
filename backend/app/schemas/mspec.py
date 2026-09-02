from typing import Any, Literal

from pydantic import BaseModel, Field


class SourceTraceability(BaseModel):
    file: str
    path: str | None = None
    line: int | None = None


class MSpecField(BaseModel):
    id: str
    name: str
    data_type: str | None = None
    role: str | None = None
    source: SourceTraceability | None = None


class MSpecFilter(BaseModel):
    id: str
    name: str
    operator: str | None = None
    value: Any = None
    field: str | None = None
    source: SourceTraceability | None = None


class MSpecMeasure(BaseModel):
    id: str
    name: str
    expression: str | None = None
    aggregation: str | None = None
    data_type: str | None = None
    source: SourceTraceability | None = None


class MSpecVariable(BaseModel):
    id: str
    name: str
    data_type: str | None = None
    default_value: Any = None
    prompt_text: str | None = None
    source: SourceTraceability | None = None


class MSpecVisual(BaseModel):
    id: str
    type: str
    title: str | None = None
    page_id: str | None = None
    page_name: str | None = None
    document_id: str | None = None
    fields: list[MSpecField] = Field(default_factory=list)
    filters: list[MSpecFilter] = Field(default_factory=list)
    sort: list[dict[str, Any]] = Field(default_factory=list)
    formatting: dict[str, Any] = Field(default_factory=dict)
    position: dict[str, Any] = Field(default_factory=dict)
    status: Literal["SUPPORTED", "UNSUPPORTED"] = "SUPPORTED"
    source: SourceTraceability | None = None


class MSpecBlock(BaseModel):
    """A block on a report page/tab (table, chart, crosstab, KPI, free cell)."""
    id: str
    type: str
    title: str | None = None
    visual_id: str | None = None
    position: dict[str, Any] = Field(default_factory=dict)
    formatting: dict[str, Any] = Field(default_factory=dict)
    field_names: list[str] = Field(default_factory=list)
    status: Literal["SUPPORTED", "UNSUPPORTED"] = "SUPPORTED"
    source: SourceTraceability | None = None


class MSpecPage(BaseModel):
    """Report tab (WebI), canvas (Dashboard), or view container (Analysis)."""
    id: str
    name: str
    index: int | None = None
    page_type: str = "tab"  # tab | section | canvas | view
    blocks: list[MSpecBlock] = Field(default_factory=list)
    source: SourceTraceability | None = None


class MSpecDocument(BaseModel):
    """Top-level BO artifact: WebI document, Crystal report, Dashboard, or Analysis workbook."""
    id: str
    name: str
    product_type: Literal["webi", "crystal", "dashboard", "analysis"] = "webi"
    description: str | None = None
    folder_id: str | None = None
    pages: list[MSpecPage] = Field(default_factory=list)
    queries: list[str] = Field(default_factory=list)
    filters: list[MSpecFilter] = Field(default_factory=list)
    variables: list[MSpecVariable] = Field(default_factory=list)
    visuals: list[MSpecVisual] = Field(default_factory=list)
    measures: list[MSpecMeasure] = Field(default_factory=list)
    sections: list[dict[str, Any]] = Field(default_factory=list)  # Crystal sections
    components: list[dict[str, Any]] = Field(default_factory=list)  # Dashboard components
    views: list[dict[str, Any]] = Field(default_factory=list)  # Analysis views
    dependencies: list[str] = Field(default_factory=list)
    source: SourceTraceability | None = None


class MSpecFolder(BaseModel):
    """BI Launch Pad folder / category."""
    id: str
    name: str
    path: str | None = None
    parent_id: str | None = None


class MSpecQuery(BaseModel):
    id: str
    name: str
    sql: str | None = None
    tables: list[str] = Field(default_factory=list)
    joins: list[dict[str, Any]] = Field(default_factory=list)
    filters: list[MSpecFilter] = Field(default_factory=list)
    source: SourceTraceability | None = None


class MSpecReport(BaseModel):
    id: str
    name: str
    description: str | None = None
    pages: list[dict[str, Any]] = Field(default_factory=list)
    queries: list[str] = Field(default_factory=list)
    filters: list[MSpecFilter] = Field(default_factory=list)
    variables: list[MSpecVariable] = Field(default_factory=list)
    visuals: list[MSpecVisual] = Field(default_factory=list)
    measures: list[MSpecMeasure] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)
    source: SourceTraceability | None = None


class MSpecMapping(BaseModel):
    id: str
    source_type: str
    source_name: str
    target_table: str | None = None
    target_column: str | None = None
    target_measure: str | None = None
    confidence: float = 0.0
    confidence_level: str = "LOW"
    status: str = "PENDING_REVIEW"


class MSpec(BaseModel):
    version: str = "1.0"
    project: dict[str, Any] = Field(default_factory=dict)
    source: dict[str, Any] = Field(default_factory=dict)
    folders: list[MSpecFolder] = Field(default_factory=list)
    documents: list[MSpecDocument] = Field(default_factory=list)
    reports: list[MSpecReport] = Field(default_factory=list)  # flat legacy view for mapping
    queries: list[MSpecQuery] = Field(default_factory=list)
    measures: list[MSpecMeasure] = Field(default_factory=list)
    variables: list[MSpecVariable] = Field(default_factory=list)
    filters: list[MSpecFilter] = Field(default_factory=list)
    visuals: list[MSpecVisual] = Field(default_factory=list)
    dependencies: list[dict[str, Any]] = Field(default_factory=list)
    mappings: list[MSpecMapping] = Field(default_factory=list)
    validation: dict[str, Any] = Field(default_factory=dict)
    hierarchy_summary: dict[str, Any] = Field(default_factory=dict)
