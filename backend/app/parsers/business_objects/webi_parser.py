"""Parser for SAP Web Intelligence documents (document → tabs → blocks)."""

import re
import xml.etree.ElementTree as ET
from pathlib import Path

from app.core.database import generate_id
from app.parsers.business_objects.base_parser import ParseContext
from app.schemas.mspec import (
    MSpecBlock,
    MSpecDocument,
    MSpecField,
    MSpecFilter,
    MSpecMeasure,
    MSpecPage,
    MSpecVariable,
    MSpecVisual,
    SourceTraceability,
)

SUPPORTED_VISUALS = {"table", "matrix", "bar", "column", "line", "pie", "donut", "kpi", "card"}


class WebiParser:
    def parse(self, xml_path: Path, doc_info: dict, ctx: ParseContext) -> MSpecDocument:
        root = ET.parse(xml_path).getroot()
        doc_id = doc_info.get("id", generate_id())
        pages_map: dict[str, MSpecPage] = {}
        visuals: list[MSpecVisual] = []
        measures: list[MSpecMeasure] = []
        variables: list[MSpecVariable] = []
        filters: list[MSpecFilter] = []

        self._parse_connectivity(root, xml_path, ctx)
        self._parse_universe(root, xml_path, ctx)
        self._parse_pages(root, xml_path, ctx, pages_map)
        self._parse_query(root, xml_path, ctx)
        self._parse_calculations(root, xml_path, ctx, measures)
        self._parse_variables(root, xml_path, ctx, variables)
        self._parse_filters(root, xml_path, ctx, filters)
        self._parse_layout(root, xml_path, ctx)
        self._parse_visuals(root, xml_path, doc_id, ctx, pages_map, visuals)
        self._parse_free_cells(root, xml_path, doc_id, ctx, pages_map, visuals)
        self._parse_interactivity(root, xml_path, ctx)

        ctx.add_item("report_document", doc_info.get("name", ""), "webi_document")

        return MSpecDocument(
            id=doc_id, name=doc_info.get("name", xml_path.stem),
            product_type="webi", description=doc_info.get("description"),
            folder_id=doc_info.get("folder_id"),
            pages=list(pages_map.values()), visuals=visuals,
            measures=measures, variables=variables, filters=filters,
            source=SourceTraceability(file=xml_path.name),
        )

    def _get_or_create_page(self, pages_map: dict, page_name: str, xml_path: Path) -> MSpecPage:
        if page_name not in pages_map:
            pages_map[page_name] = MSpecPage(
                id=generate_id(), name=page_name, page_type="tab", blocks=[],
                source=SourceTraceability(file=xml_path.name),
            )
        return pages_map[page_name]

    def _parse_connectivity(self, root, xml_path, ctx: ParseContext):
        for conn in root.findall(".//connections/connection"):
            ctx.add_item("data_connectivity", conn.get("name", ""), "connection",
                         {"conn_type": conn.get("type"), "datasource": conn.get("datasource"),
                          "server": conn.get("server"), "database": conn.get("database")})
        for dp in root.findall(".//dataProviders/dataProvider"):
            ctx.add_item("data_connectivity", dp.get("name", ""), "data_provider",
                         {"type": dp.get("type"), "universe": dp.get("universe")})

    def _parse_universe(self, root, xml_path, ctx: ParseContext):
        universe = root.find("universe")
        if universe is None:
            return
        ctx.add_item("data_connectivity", universe.get("name", ""), "universe",
                     {"dataFoundation": universe.get("dataFoundation")})
        for cls in universe.findall(".//class"):
            ctx.add_item("semantic_layer", cls.get("name", ""), "class")
            for dim in cls.findall("dimension"):
                ctx.add_item("semantic_layer", dim.get("name", ""), "dimension", {"dataType": dim.get("dataType")})
            for meas in cls.findall("measure"):
                ctx.add_item("semantic_layer", meas.get("name", ""), "universe_measure",
                             {"aggregation": meas.get("aggregation")})
            for det in cls.findall("detail"):
                ctx.add_item("semantic_layer", det.get("name", ""), "detail")
        for ctx_elem in universe.findall(".//context"):
            ctx.add_item("semantic_layer", ctx_elem.get("name", ""), "context", {"tables": ctx_elem.get("tables")})
        for lov in universe.findall(".//lov"):
            ctx.add_item("semantic_layer", lov.get("name", ""), "lov", {"object": lov.get("object")})
        for hier in universe.findall(".//hierarchy"):
            ctx.add_item("semantic_layer", hier.get("name", ""), "hierarchy", {"levels": hier.get("levels")})

    def _parse_pages(self, root, xml_path, ctx: ParseContext, pages_map: dict):
        doc_props = root.find("documentProperties")
        if doc_props is not None:
            ctx.add_item("report_document", root.get("name", "Report"), "document",
                           {"author": doc_props.get("author"), "locale": doc_props.get("locale")})
        for page in root.findall(".//pages/page"):
            name = page.get("name", "Page")
            pages_map[name] = MSpecPage(
                id=page.get("id", generate_id()), name=name, page_type="tab",
                index=int(page.get("index", 0)) if page.get("index") else None, blocks=[],
                source=SourceTraceability(file=xml_path.name),
            )
            ctx.add_item("report_document", name, "page", {"index": page.get("index")})

    def _parse_query(self, root, xml_path, ctx: ParseContext):
        query_elem = root.find("query")
        if query_elem is None:
            return
        ctx.add_item("queries", query_elem.get("name", "Query"), "query")
        if query_elem.findtext("sql"):
            ctx.add_item("queries", query_elem.get("name", "SQL"), "sql",
                         {"length": len(query_elem.findtext("sql", ""))})
        for join in query_elem.findall(".//join"):
            ctx.add_item("queries", f"{join.get('left')}-{join.get('right')}", "join",
                         {"type": join.get("type"), "on": join.get("on")})
        for obj in query_elem.findall(".//resultObjects/object"):
            ctx.add_item("queries", obj.get("name", ""), "result_object", {"object_type": obj.get("type")})
        for qf in query_elem.findall(".//filters/filter"):
            ctx.add_item("queries", qf.get("name", ""), "query_filter", {"operator": qf.get("operator")})

    def _parse_calculations(self, root, xml_path, ctx: ParseContext, measures: list):
        for calc in root.findall(".//calculation"):
            measures.append(MSpecMeasure(
                id=generate_id(), name=calc.get("name", "Unknown"),
                expression=calc.findtext("expression"), aggregation=calc.get("aggregation"),
                data_type=calc.get("dataType"),
                source=SourceTraceability(file=xml_path.name, path=f"calculation[@name='{calc.get('name')}']"),
            ))
            ctx.add_item("calculations", calc.get("name", ""), "calculation", {"aggregation": calc.get("aggregation")})
            if calc.findtext("formula"):
                ctx.add_item("calculations", calc.get("name", ""), "formula")

    def _parse_variables(self, root, xml_path, ctx: ParseContext, variables: list):
        for prompt in root.findall(".//prompt"):
            ctx.add_item("variables", prompt.get("name", ""), "prompt",
                         {"controlType": prompt.get("controlType")})
            variables.append(MSpecVariable(
                id=generate_id(), name=prompt.get("name", ""), data_type=prompt.get("dataType"),
                default_value=prompt.findtext("defaultValue"), prompt_text=prompt.findtext("promptText"),
                source=SourceTraceability(file=xml_path.name),
            ))
        for var in root.findall(".//variable"):
            variables.append(MSpecVariable(
                id=generate_id(), name=var.get("name", ""), data_type=var.get("dataType"),
                default_value=var.findtext("defaultValue"), prompt_text=var.findtext("prompt"),
                source=SourceTraceability(file=xml_path.name),
            ))
            ctx.add_item("variables", var.get("name", ""), "variable")
        for mv in root.findall(".//mergedVariable"):
            ctx.add_item("variables", mv.get("name", ""), "merged_variable", {"sources": mv.get("sources")})

    def _parse_filters(self, root, xml_path, ctx: ParseContext, filters: list):
        for filt in root.findall(".//filters/filter"):
            scope = filt.get("scope", "report")
            filters.append(MSpecFilter(
                id=generate_id(), name=filt.get("name", ""), operator=filt.get("operator"),
                value=filt.findtext("value"), field=filt.get("field"),
                source=SourceTraceability(file=xml_path.name),
            ))
            if scope == "block":
                ctx.add_item("filters", filt.get("name", ""), "block_filter")
            else:
                ctx.add_item("filters", filt.get("name", ""), "report_filter")
        scope = root.find("scopeOfAnalysis")
        if scope is not None:
            ctx.add_item("filters", "ScopeOfAnalysis", "scope", {"drillLevel": scope.get("drillLevel")})

    def _parse_layout(self, root, xml_path, ctx: ParseContext):
        layout = root.find("layout")
        if layout is None:
            return
        for sec in layout.findall("section"):
            ctx.add_item("report_document", sec.get("name", ""), "section", {"zone": sec.get("type")})
        for brk in layout.findall("break"):
            ctx.add_item("layout", brk.get("field", ""), "break", {"direction": brk.get("direction")})
        for hf in layout.findall("headerFooter"):
            ctx.add_item("layout", hf.get("zone", ""), "header_footer", {"text": hf.get("text")})

    def _parse_visuals(self, root, xml_path, doc_id, ctx: ParseContext, pages_map: dict, visuals: list):
        for visual_elem in root.findall(".//visual"):
            visual_type = visual_elem.get("type", "table").lower()
            page_name = visual_elem.get("page", "Summary")
            status = "SUPPORTED" if visual_type in SUPPORTED_VISUALS else "UNSUPPORTED"
            if status == "UNSUPPORTED":
                ctx.add_unsupported(f"visual:{visual_type}")
                ctx.add_item("visuals", visual_elem.get("title", visual_type), "unsupported_visual",
                             {"visual_type": visual_type})
            elif visual_type == "table":
                ctx.add_item("visuals", visual_elem.get("title", ""), "table")
            elif visual_type == "matrix":
                ctx.add_item("visuals", visual_elem.get("title", ""), "crosstab")
            else:
                ctx.add_item("visuals", visual_elem.get("title", ""), "chart", {"chart_type": visual_type})

            pos_elem = visual_elem.find("position")
            pos = {}
            if pos_elem is not None:
                pos = {"x": pos_elem.get("x"), "y": pos_elem.get("y"),
                       "width": pos_elem.get("width"), "height": pos_elem.get("height"),
                       "zIndex": pos_elem.get("zIndex")}
                ctx.add_item("layout", visual_elem.get("title", visual_type), "position", pos)
                ctx.add_item("layout", visual_elem.get("title", visual_type), "block", {"page": page_name})

            fmt = visual_elem.find("formatting")
            formatting = {}
            if fmt is not None:
                formatting = dict(fmt.attrib)
                if fmt.get("font") or fmt.get("fontSize"):
                    ctx.add_item("formatting", visual_elem.get("title", ""), "font", formatting)
                if fmt.get("background") or fmt.get("seriesColor") or fmt.get("color"):
                    ctx.add_item("formatting", visual_elem.get("title", ""), "color", formatting)

            fields = [MSpecField(id=generate_id(), name=f.get("name", ""), data_type=f.get("dataType"),
                                   role=f.get("role")) for f in visual_elem.findall("field")]

            block = MSpecBlock(
                id=generate_id(), type=visual_type, title=visual_elem.get("title"),
                position=pos, formatting=formatting,
                field_names=[f.name for f in fields], status=status,
                source=SourceTraceability(file=xml_path.name),
            )
            page = self._get_or_create_page(pages_map, page_name, xml_path)
            page.blocks.append(block)

            visual = MSpecVisual(
                id=generate_id(), type=visual_type, title=visual_elem.get("title"),
                document_id=doc_id, page_id=page.id, page_name=page_name,
                fields=fields, formatting=formatting, position=pos, status=status,
                source=SourceTraceability(file=xml_path.name),
            )
            block.visual_id = visual.id
            visuals.append(visual)

    def _parse_free_cells(self, root, xml_path, doc_id, ctx: ParseContext, pages_map: dict, visuals: list):
        for cell in root.findall(".//freeCell"):
            page_name = cell.get("page", "Summary")
            pos_elem = cell.find("position")
            pos = dict(pos_elem.attrib) if pos_elem is not None else {}
            ctx.add_item("visuals", cell.get("name", ""), "free_cell", {"text": cell.findtext("text")})
            if pos:
                ctx.add_item("layout", cell.get("name", ""), "position", pos)
            page = self._get_or_create_page(pages_map, page_name, xml_path)
            page.blocks.append(MSpecBlock(
                id=generate_id(), type="free_cell", title=cell.get("name"),
                position=pos, field_names=[], source=SourceTraceability(file=xml_path.name),
            ))

    def _parse_interactivity(self, root, xml_path, ctx: ParseContext):
        inter = root.find("interactivity")
        if inter is None:
            return
        for drill in inter.findall("drillPath"):
            ctx.add_item("interactivity", f"{drill.get('from')}->{drill.get('to')}", "drill_path")
        for link in inter.findall("hyperlink"):
            ctx.add_item("interactivity", link.get("source", ""), "hyperlink", {"target": link.get("target")})
        for alert in inter.findall("alert"):
            ctx.add_item("interactivity", alert.get("name", ""), "alert")

    @staticmethod
    def extract_tables_from_sql(sql: str) -> list[str]:
        return list(set(re.findall(r"(?:FROM|JOIN)\s+([a-zA-Z_][\w.]*)", sql, re.IGNORECASE)))
