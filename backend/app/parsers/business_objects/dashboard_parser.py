"""Parser for SAP BO Dashboards (canvas → components)."""

import xml.etree.ElementTree as ET
from pathlib import Path

from app.core.database import generate_id
from app.parsers.business_objects.base_parser import ParseContext
from app.schemas.mspec import (
    MSpecBlock,
    MSpecDocument,
    MSpecPage,
    MSpecVisual,
    SourceTraceability,
)


class DashboardParser:
    def parse(self, xml_path: Path, doc_info: dict, ctx: ParseContext) -> MSpecDocument:
        root = ET.parse(xml_path).getroot()
        doc_id = doc_info.get("id", generate_id())
        pages: list[MSpecPage] = []
        visuals: list[MSpecVisual] = []
        components: list[dict] = []

        for canvas in root.findall(".//canvas"):
            canvas_name = canvas.get("name", "Canvas")
            ctx.add_item("report_document", canvas_name, "dashboard_canvas")

            blocks: list[MSpecBlock] = []
            for comp in canvas.findall("component"):
                comp_type = comp.get("type", "chart")
                pos = {
                    "x": comp.get("x"), "y": comp.get("y"),
                    "width": comp.get("width"), "height": comp.get("height"),
                }
                components.append({
                    "name": comp.get("name"), "type": comp_type,
                    "source_report": comp.get("sourceReport"), **pos,
                })
                blocks.append(MSpecBlock(
                    id=generate_id(), type=comp_type, title=comp.get("name"),
                    position=pos,
                    field_names=[f.get("name", "") for f in comp.findall("binding")],
                    status="SUPPORTED",
                    source=SourceTraceability(file=xml_path.name),
                ))
                ctx.add_item("layout", comp.get("name", ""), "position", pos)
                if comp_type in ("chart", "gauge", "metric"):
                    ctx.add_item("visuals", comp.get("name", ""), "chart", {"chart_type": comp_type})
                elif comp_type == "selector":
                    ctx.add_item("variables", comp.get("name", ""), "dashboard_selector")
                if comp.find("formatting") is not None:
                    fmt = comp.find("formatting")
                    ctx.add_item("formatting", comp.get("name", ""), "color",
                                   {"background": fmt.get("background"), "color": fmt.get("color")})

                visuals.append(MSpecVisual(
                    id=generate_id(), type=comp_type, title=comp.get("name"),
                    document_id=doc_id, page_name=canvas_name, position=pos,
                    source=SourceTraceability(file=xml_path.name),
                ))

            pages.append(MSpecPage(
                id=generate_id(), name=canvas_name, page_type="canvas", blocks=blocks,
            ))

        for conn in root.findall(".//connections/connection"):
            ctx.add_item("data_connectivity", conn.get("name", ""), "connection",
                         {"conn_type": conn.get("type")})

        ctx.add_item("report_document", doc_info.get("name", ""), "dashboard")

        return MSpecDocument(
            id=doc_id, name=doc_info.get("name", xml_path.stem),
            product_type="dashboard", description=doc_info.get("description"),
            folder_id=doc_info.get("folder_id"), pages=pages, visuals=visuals,
            components=components,
            source=SourceTraceability(file=xml_path.name),
        )
