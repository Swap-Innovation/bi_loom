"""SAP Business Objects Web Intelligence asset taxonomy.

Ordered from data connectivity through final report presentation.
Each category maps to parser steps and UI sections.
"""

from typing import TypedDict


class AssetCategory(TypedDict):
    id: str
    label: str
    description: str
    steps: list[str]


# Full BO report stack: platform → connection → semantic layer → document → presentation
BO_ASSET_CATEGORIES: list[AssetCategory] = [
    {
        "id": "platform_organization",
        "label": "Platform & Organization",
        "description": "BI Launch Pad folders, documents, and product type identification (WebI, Crystal, Dashboard, Analysis)",
        "steps": [
            "folders_parsed",
            "documents_discovered",
            "product_types_identified",
        ],
    },
    {
        "id": "data_connectivity",
        "label": "Data Connectivity & Foundation",
        "description": "Connections, universes, data providers, and data sources",
        "steps": [
            "connections_parsed",
            "universes_parsed",
            "data_providers_parsed",
        ],
    },
    {
        "id": "semantic_layer",
        "label": "Semantic Layer (Universe)",
        "description": "Classes, dimensions, measures, details, contexts, LOVs, hierarchies",
        "steps": [
            "classes_parsed",
            "dimensions_parsed",
            "measures_parsed",
            "details_parsed",
            "contexts_parsed",
            "lovs_parsed",
            "hierarchies_parsed",
        ],
    },
    {
        "id": "report_document",
        "label": "Report Document",
        "description": "Document properties, pages/tabs, and report structure",
        "steps": [
            "document_properties_parsed",
            "pages_parsed",
            "sections_parsed",
        ],
    },
    {
        "id": "queries",
        "label": "Queries & Data Retrieval",
        "description": "Query definitions, SQL, joins, result objects, query filters",
        "steps": [
            "queries_parsed",
            "sql_parsed",
            "joins_parsed",
            "result_objects_parsed",
            "query_filters_parsed",
        ],
    },
    {
        "id": "variables",
        "label": "Variables & Prompts",
        "description": "Input controls, prompts, merged and formula variables",
        "steps": [
            "prompts_parsed",
            "variables_parsed",
            "merged_variables_parsed",
        ],
    },
    {
        "id": "calculations",
        "label": "Calculations & Formulas",
        "description": "Report formulas, running calculations, aggregations",
        "steps": [
            "calculations_parsed",
            "formulas_parsed",
            "aggregations_parsed",
        ],
    },
    {
        "id": "filters",
        "label": "Filters & Scope of Analysis",
        "description": "Report filters, block filters, scope definitions",
        "steps": [
            "report_filters_parsed",
            "block_filters_parsed",
            "scope_of_analysis_parsed",
        ],
    },
    {
        "id": "layout",
        "label": "Layout & Positioning",
        "description": "Blocks, sections, breaks, size and position (x, y, width, height)",
        "steps": [
            "blocks_parsed",
            "breaks_parsed",
            "positioning_parsed",
            "headers_footers_parsed",
        ],
    },
    {
        "id": "visuals",
        "label": "Visuals & Report Blocks",
        "description": "Tables, crosstabs, charts, KPIs, free cells, images",
        "steps": [
            "tables_parsed",
            "charts_parsed",
            "crosstabs_parsed",
            "free_cells_parsed",
            "unsupported_visuals_parsed",
        ],
    },
    {
        "id": "formatting",
        "label": "Formatting & Styles",
        "description": "Fonts, colors, borders, alignment, conditional formatting, number formats",
        "steps": [
            "fonts_parsed",
            "colors_parsed",
            "borders_parsed",
            "conditional_formatting_parsed",
            "number_formats_parsed",
        ],
    },
    {
        "id": "interactivity",
        "label": "Interactivity & Navigation",
        "description": "Drill paths, hyperlinks, document links, alerts",
        "steps": [
            "drill_paths_parsed",
            "hyperlinks_parsed",
            "alerts_parsed",
        ],
    },
    {
        "id": "mspec",
        "label": "MSpec Generation",
        "description": "Canonical migration specification assembly",
        "steps": [
            "dependencies_resolved",
            "mspec_generated",
        ],
    },
]

STEP_LABELS: dict[str, str] = {
    # Platform
    "folders_parsed": "BI Launch Pad folders / categories",
    "documents_discovered": "Documents discovered (WebI, Crystal, Dashboard, Analysis)",
    "product_types_identified": "Product types identified",
    # Data connectivity
    "connections_parsed": "Connections (JDBC/ODBC/OLAP/BEx)",
    "universes_parsed": "Universes / Data foundations",
    "data_providers_parsed": "Data providers",
    # Semantic layer
    "classes_parsed": "Universe classes",
    "dimensions_parsed": "Dimensions",
    "measures_parsed": "Universe measures",
    "details_parsed": "Detail objects",
    "contexts_parsed": "Contexts",
    "lovs_parsed": "Lists of values (LOVs)",
    "hierarchies_parsed": "Hierarchies",
    # Report document
    "document_properties_parsed": "Document properties",
    "pages_parsed": "Pages / report tabs",
    "sections_parsed": "Sections & structure zones",
    # Queries
    "queries_parsed": "Query definitions",
    "sql_parsed": "SQL / MDX statements",
    "joins_parsed": "Joins & relationships",
    "result_objects_parsed": "Result objects",
    "query_filters_parsed": "Query-level filters",
    # Variables
    "prompts_parsed": "Prompts / input controls",
    "variables_parsed": "Variables",
    "merged_variables_parsed": "Merged variables",
    # Calculations
    "calculations_parsed": "Calculations",
    "formulas_parsed": "Formulas",
    "aggregations_parsed": "Aggregations",
    # Filters
    "report_filters_parsed": "Report filters",
    "block_filters_parsed": "Block filters",
    "scope_of_analysis_parsed": "Scope of analysis",
    # Layout
    "blocks_parsed": "Blocks & containers",
    "breaks_parsed": "Breaks & grouping",
    "positioning_parsed": "Position & size (x, y, w, h)",
    "headers_footers_parsed": "Headers & footers",
    # Visuals
    "tables_parsed": "Tables",
    "charts_parsed": "Charts",
    "crosstabs_parsed": "Crosstabs / matrices",
    "free_cells_parsed": "Free-standing cells",
    "unsupported_visuals_parsed": "Unsupported visuals (flagged)",
    # Formatting
    "fonts_parsed": "Fonts & typography",
    "colors_parsed": "Colors (fill, text, series)",
    "borders_parsed": "Borders & lines",
    "conditional_formatting_parsed": "Conditional formatting rules",
    "number_formats_parsed": "Number & date formats",
    # Interactivity
    "drill_paths_parsed": "Drill paths",
    "hyperlinks_parsed": "Hyperlinks",
    "alerts_parsed": "Alerts",
    # MSpec
    "dependencies_resolved": "Dependencies resolved",
    "mspec_generated": "MSpec generated",
}

ALL_PARSE_STEPS: list[str] = []
for cat in BO_ASSET_CATEGORIES:
    ALL_PARSE_STEPS.extend(cat["steps"])

# Initial step before category parsing begins
INITIAL_STEP = "files_detected"
FULL_STEP_SEQUENCE = [INITIAL_STEP] + ALL_PARSE_STEPS


def get_category_for_step(step: str) -> str | None:
    for cat in BO_ASSET_CATEGORIES:
        if step in cat["steps"]:
            return cat["id"]
    return None
