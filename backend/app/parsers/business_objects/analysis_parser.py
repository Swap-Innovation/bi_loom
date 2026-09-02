"""Parser for SAP Analysis OLAP workbooks (workbook → views → charts)."""

import xml.etree.ElementTree as ET
from pathlib import Path

from app.core.database import generate_id
from app.parsers.business_objects.base_parser import ParseContext
from app.schemas.mspec import (
    MSpecBlock,
    MSpecDocument,
    MSpecPage,
    MSpecQuery,
    MSpecVisual,
    SourceTraceability,
)


class AnalysisParser:
    def parse(self, xml_path: Path, doc_info: dict, ctx: ParseContext) -> MSpecDocument:
        root = ET.parse(xml_path).getroot()
        doc_id = doc_info.get("id", generate_id())
        pages: list[MSpecPage] = []
        visuals: list[MSpecVisual] = []
        views: list[dict] = []
        query_ids: list[str] = []

        cube = root.find(".//cube")
        if cube is not None:
            ctx.add_item("data_connectivity", cube.get("name", ""), "olap_cube",
                         {"datasource": cube.get("datasource")})
            for dim in cube.findall("dimension"):
                ctx.add_item("semantic_layer", dim.get("name", ""), "olap_dimension")
            for measure in cube.findall("measure"):
                ctx.add_item("semantic_layer", measure.get("name", ""), "olap_measure")

        mdx = root.findtext(".//mdx")
        if mdx:
            qid = generate_id()
            query_ids.append(qid)
            ctx.add_item("queries", "OLAP Query", "mdx", {"length": len(mdx)})

        for view in root.findall(".//view"):
            view_name = view.get("name", "View")
            view_type = view.get("type", "chart")
            views.append({"name": view_name, "type": view_type})
            ctx.add_item("report_document", view_name, "analysis_view", {"view_type": view_type})

            blocks: list[MSpecBlock] = []
            for chart in view.findall("chart"):
                pos = {
                    "x": chart.get("x"), "y": chart.get("y"),
                    "width": chart.get("width"), "height": chart.get("height"),
                }
                blocks.append(MSpecBlock(
                    id=generate_id(), type=chart.get("chartType", "chart"),
                    title=chart.get("name"), position=pos,
                    field_names=[a.get("name", "") for a in chart.findall("axis")],
                    source=SourceTraceability(file=xml_path.name),
                ))
                ctx.add_item("visuals", chart.get("name", ""), "chart", {"chart_type": chart.get("chartType")})
                visuals.append(MSpecVisual(
                    id=generate_id(), type=chart.get("chartType", "chart"),
                    title=chart.get("name"), document_id=doc_id, page_name=view_name,
                    position=pos, source=SourceTraceability(file=xml_path.name),
                ))

            for table in view.findall("crosstab"):
                blocks.append(MSpecBlock(
                    id=generate_id(), type="crosstab", title=table.get("name"),
                    field_names=[d.get("name", "") for d in table.findall("dimension")],
                ))
                ctx.add_item("visuals", table.get("name", ""), "crosstab")

            pages.append(MSpecPage(
                id=generate_id(), name=view_name, page_type="view", blocks=blocks,
            ))

        ctx.add_item("report_document", doc_info.get("name", ""), "analysis_workbook")

        return MSpecDocument(
            id=doc_id, name=doc_info.get("name", xml_path.stem),
            product_type="analysis", description=doc_info.get("description"),
            folder_id=doc_info.get("folder_id"), pages=pages, visuals=visuals,
            views=views, queries=query_ids,
            source=SourceTraceability(file=xml_path.name),
        )
