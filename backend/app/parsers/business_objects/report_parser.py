"""SAP Business Objects multi-product parser orchestrator."""

import json
from pathlib import Path
from typing import Any

from app.core.database import generate_id
from app.parsers.business_objects.analysis_parser import AnalysisParser
from app.parsers.business_objects.base_parser import ParseContext
from app.parsers.business_objects.crystal_parser import CrystalParser
from app.parsers.business_objects.dashboard_parser import DashboardParser
from app.parsers.business_objects.product_types import PRODUCT_LABELS, detect_product_type
from app.parsers.business_objects.webi_parser import WebiParser
from app.schemas.mspec import (
    MSpec,
    MSpecDocument,
    MSpecFolder,
    MSpecQuery,
    MSpecReport,
    SourceTraceability,
)


PARSERS = {
    "webi": WebiParser(),
    "crystal": CrystalParser(),
    "dashboard": DashboardParser(),
    "analysis": AnalysisParser(),
}


def document_to_report(doc: MSpecDocument) -> MSpecReport:
    """Flatten document into legacy MSpecReport for mapping compatibility."""
    return MSpecReport(
        id=doc.id, name=doc.name, description=doc.description,
        pages=[{"id": p.id, "name": p.name, "type": p.page_type, "blocks": len(p.blocks)} for p in doc.pages],
        queries=doc.queries, filters=doc.filters, variables=doc.variables,
        visuals=doc.visuals, measures=doc.measures, dependencies=doc.dependencies,
        source=doc.source,
    )


class BusinessObjectsParser:
    def __init__(
        self,
        extract_dir: Path,
        document_ids: list[str] | None = None,
        on_progress=None,
    ):
        self.extract_dir = extract_dir
        self.document_ids = set(document_ids) if document_ids else None
        self.ctx = ParseContext(on_progress=on_progress)

    def parse(self) -> tuple[MSpec, dict[str, list[str]], dict[str, Any]]:
        manifest_path = self.extract_dir / "manifest.json"
        if manifest_path.exists():
            mspec, cap = self._parse_manifest(manifest_path)
        else:
            mspec, cap = self._parse_xml_discovery()
        return mspec, cap, self.ctx.asset_inventory

    def _resolve_xml_path(self, doc_info: dict) -> Path | None:
        if doc_info.get("file"):
            path = self.extract_dir / doc_info["file"]
            if path.exists():
                return path
        doc_id = doc_info.get("id", "")
        for candidate in [
            self.extract_dir / "reports" / doc_id / "report.xml",
            self.extract_dir / "reports" / doc_id / "dashboard.xml",
            self.extract_dir / "reports" / doc_id / "workbook.xml",
            self.extract_dir / f"reports/{doc_id}/report.xml",
        ]:
            if candidate.exists():
                return candidate
        return None

    def _parse_manifest(self, manifest_path: Path) -> tuple[MSpec, dict[str, list[str]]]:
        manifest = json.loads(manifest_path.read_text())
        folders: list[MSpecFolder] = []
        documents: list[MSpecDocument] = []
        reports: list[MSpecReport] = []
        queries: list[MSpecQuery] = []
        all_measures, all_variables, all_filters, all_visuals = [], [], [], []

        for folder_info in manifest.get("folders", []):
            folders.append(MSpecFolder(
                id=folder_info["id"], name=folder_info["name"],
                path=folder_info.get("path"), parent_id=folder_info.get("parent_id"),
            ))
            self.ctx.add_item("platform_organization", folder_info["name"], "folder",
                              {"path": folder_info.get("path")})

        doc_entries = manifest.get("documents", manifest.get("reports", []))
        hierarchy_docs: list[dict] = []

        # Pre-count documents we will actually attempt
        planned = [
            d for d in doc_entries
            if not self.document_ids or d.get("id") in self.document_ids
        ]
        self.ctx.set_document_total(len(planned))

        for index, doc_info in enumerate(planned, start=1):
            xml_path = self._resolve_xml_path(doc_info)
            if xml_path is None:
                self.ctx.capability_report["warnings"].append(f"File not found for document {doc_info.get('id')}")
                continue

            product_type = doc_info.get("product_type") or detect_product_type(xml_path)
            doc_name = doc_info.get("name", doc_info.get("id", "document"))
            self.ctx.mark_document_started(doc_name, product_type, index)
            self.ctx.add_item("platform_organization", doc_name, "document",
                              {"product_type": product_type, "product_label": PRODUCT_LABELS.get(product_type, product_type)})

            parser = PARSERS.get(product_type, PARSERS["webi"])
            doc = parser.parse(xml_path, doc_info, self.ctx)
            documents.append(doc)
            reports.append(document_to_report(doc))

            # WebI SQL sidecar
            if product_type == "webi":
                query_sql = xml_path.parent / "query.sql"
                if query_sql.exists():
                    from app.parsers.business_objects.webi_parser import WebiParser as WP
                    sql_content = query_sql.read_text()
                    query = MSpecQuery(
                        id=generate_id(), name=f"{doc_info['name']}_query", sql=sql_content,
                        tables=WP.extract_tables_from_sql(sql_content),
                        source=SourceTraceability(file=query_sql.name, path="query.sql"),
                    )
                    queries.append(query)
                    doc.queries.append(query.id)
                    self.ctx.add_item("queries", query.name, "query", {"tables": query.tables})

            all_measures.extend(doc.measures)
            all_variables.extend(doc.variables)
            all_filters.extend(doc.filters)
            all_visuals.extend(doc.visuals)

            hierarchy_docs.append(self._build_hierarchy_entry(doc, folders))
            self.ctx.mark_document_finished(doc_name, product_type, index)

        self.ctx.compute_totals()
        self.ctx.set_hierarchy(
            [{"id": f.id, "name": f.name, "path": f.path} for f in folders],
            hierarchy_docs,
        )
        self.ctx.capability_report["supported"].extend([
            "webi", "crystal", "dashboard", "analysis",
            "folders", "documents", "pages", "blocks",
        ])

        product_counts: dict[str, int] = {}
        for d in documents:
            product_counts[d.product_type] = product_counts.get(d.product_type, 0) + 1

        mspec = MSpec(
            version="1.0",
            project={"name": manifest.get("name", "BO Export")},
            source={"technology": "SAP Business Objects", "format": "synthetic"},
            folders=folders,
            documents=documents,
            reports=reports,
            queries=queries,
            measures=all_measures,
            variables=all_variables,
            filters=all_filters,
            visuals=all_visuals,
            hierarchy_summary={
                "folders": len(folders),
                "documents": len(documents),
                "pages": sum(len(d.pages) for d in documents),
                "blocks": sum(sum(len(p.blocks) for p in d.pages) for d in documents),
                "product_types": product_counts,
            },
        )
        return mspec, self.ctx.capability_report

    def _build_hierarchy_entry(self, doc: MSpecDocument, folders: list[MSpecFolder]) -> dict:
        folder_name = next((f.name for f in folders if f.id == doc.folder_id), None)
        return {
            "id": doc.id,
            "name": doc.name,
            "product_type": doc.product_type,
            "product_label": PRODUCT_LABELS.get(doc.product_type, doc.product_type),
            "folder": folder_name,
            "pages": [
                {
                    "id": p.id, "name": p.name, "type": p.page_type,
                    "blocks": [{"id": b.id, "type": b.type, "title": b.title, "status": b.status} for b in p.blocks],
                }
                for p in doc.pages
            ],
            "page_count": len(doc.pages),
            "block_count": sum(len(p.blocks) for p in doc.pages),
            "visual_count": len(doc.visuals),
        }

    def _parse_xml_discovery(self) -> tuple[MSpec, dict[str, list[str]]]:
        documents: list[MSpecDocument] = []
        reports: list[MSpecReport] = []
        xml_files = list(self.extract_dir.rglob("*.xml"))
        self.ctx.set_document_total(len(xml_files))
        for index, xml_file in enumerate(xml_files, start=1):
            product_type = detect_product_type(xml_file)
            doc_info = {"id": generate_id(), "name": xml_file.stem, "product_type": product_type}
            self.ctx.mark_document_started(xml_file.stem, product_type, index)
            parser = PARSERS.get(product_type, PARSERS["webi"])
            doc = parser.parse(xml_file, doc_info, self.ctx)
            documents.append(doc)
            reports.append(document_to_report(doc))
            self.ctx.mark_document_finished(xml_file.stem, product_type, index)

        self.ctx.compute_totals()
        self.ctx.capability_report["warnings"].append("Parsed generic XML without manifest")
        mspec = MSpec(
            version="1.0",
            source={"technology": "SAP Business Objects", "format": "xml"},
            documents=documents,
            reports=reports,
            hierarchy_summary={"documents": len(documents)},
        )
        return mspec, self.ctx.capability_report
