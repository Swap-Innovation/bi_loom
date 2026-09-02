"""Parser for SAP Crystal Reports (sections → objects)."""

import xml.etree.ElementTree as ET
from pathlib import Path

from app.core.database import generate_id
from app.parsers.business_objects.base_parser import ParseContext
from app.schemas.mspec import (
    MSpecBlock,
    MSpecDocument,
    MSpecMeasure,
    MSpecPage,
    MSpecQuery,
    MSpecVariable,
    MSpecVisual,
    SourceTraceability,
)


class CrystalParser:
    def parse(self, xml_path: Path, doc_info: dict, ctx: ParseContext) -> MSpecDocument:
        root = ET.parse(xml_path).getroot()
        doc_id = doc_info.get("id", generate_id())
        pages: list[MSpecPage] = []
        visuals: list[MSpecVisual] = []
        measures: list[MSpecMeasure] = []
        variables: list[MSpecVariable] = []
        sections_meta: list[dict] = []

        # Crystal: Report → Sections (Report Header, Page Header, Details, etc.) → Objects
        for section in root.findall(".//section"):
            sec_name = section.get("name", section.get("type", "Section"))
            sec_type = section.get("type", "details")
            sections_meta.append({"name": sec_name, "type": sec_type})
            ctx.add_item("report_document", sec_name, "crystal_section", {"section_type": sec_type})

            blocks: list[MSpecBlock] = []
            for obj in section.findall("object"):
                obj_type = obj.get("type", "field")
                block = MSpecBlock(
                    id=generate_id(),
                    type=obj_type,
                    title=obj.get("name"),
                    position={
                        "x": obj.get("left"), "y": obj.get("top"),
                        "width": obj.get("width"), "height": obj.get("height"),
                    },
                    field_names=[obj.get("field", "")] if obj.get("field") else [],
                    source=SourceTraceability(file=xml_path.name, path=f"section[@name='{sec_name}']/object"),
                )
                blocks.append(block)
                ctx.add_item("layout", obj.get("name", obj_type), "position", block.position)
                if obj_type == "chart":
                    ctx.add_item("visuals", obj.get("name", ""), "chart", {"chart_type": obj.get("chartType")})
                elif obj_type in ("text", "field"):
                    ctx.add_item("visuals", obj.get("name", ""), "free_cell")

                visual = MSpecVisual(
                    id=generate_id(),
                    type=obj_type if obj_type == "chart" else "field",
                    title=obj.get("name"),
                    document_id=doc_id,
                    page_name=sec_name,
                    position=block.position,
                    status="SUPPORTED" if obj_type != "subreport" else "UNSUPPORTED",
                    source=SourceTraceability(file=xml_path.name),
                )
                visuals.append(visual)

            pages.append(MSpecPage(
                id=generate_id(), name=sec_name, page_type="section", blocks=blocks,
                source=SourceTraceability(file=xml_path.name),
            ))

        for param in root.findall(".//parameter"):
            variables.append(MSpecVariable(
                id=generate_id(), name=param.get("name", ""),
                data_type=param.get("dataType"), prompt_text=param.get("prompt"),
                source=SourceTraceability(file=xml_path.name),
            ))
            ctx.add_item("variables", param.get("name", ""), "crystal_parameter")

        for formula in root.findall(".//formula"):
            measures.append(MSpecMeasure(
                id=generate_id(), name=formula.get("name", ""),
                expression=formula.findtext("expression"),
                source=SourceTraceability(file=xml_path.name),
            ))
            ctx.add_item("calculations", formula.get("name", ""), "crystal_formula")

        conn = root.find(".//connection")
        if conn is not None:
            ctx.add_item("data_connectivity", conn.get("name", ""), "connection",
                         {"conn_type": conn.get("type"), "database": conn.get("database")})

        ctx.add_item("report_document", doc_info.get("name", ""), "crystal_report")

        return MSpecDocument(
            id=doc_id, name=doc_info.get("name", xml_path.stem),
            product_type="crystal", description=doc_info.get("description"),
            folder_id=doc_info.get("folder_id"), pages=pages, visuals=visuals,
            measures=measures, variables=variables, sections=sections_meta,
            source=SourceTraceability(file=xml_path.name),
        )
