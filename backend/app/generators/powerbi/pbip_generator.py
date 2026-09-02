import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.generators.powerbi.semantic_model_generator import SemanticModelGenerator

BLOCK_TYPE_TO_VISUAL: dict[str, str] = {
    "table": "tableEx",
    "crosstab": "matrix",
    "chart": "clusteredBarChart",
    "bar": "clusteredBarChart",
    "line": "lineChart",
    "pie": "pieChart",
    "kpi": "card",
    "text": "textbox",
    "gauge": "gauge",
    "map": "map",
}


class PBIPGenerator:
    def __init__(
        self,
        mapped_mspec: dict[str, Any],
        pluto_model: dict[str, Any],
        output_dir: Path,
        conversion_items: list[dict[str, Any]] | None = None,
    ):
        self.mspec = mapped_mspec
        self.pluto_model = pluto_model
        self.output_dir = output_dir
        self.conversion_items = conversion_items or []

    def generate(self) -> dict[str, Any]:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        project_name = self._safe_name(self.mspec.get("project", {}).get("name", "Migration"))

        semantic = SemanticModelGenerator(self.pluto_model, self.output_dir)
        semantic_result = semantic.generate()
        model_name = semantic_result["name"]

        report_artifacts: list[dict[str, Any]] = []
        documents = self._iter_documents()

        for doc in documents:
            report_name = self._safe_name(doc.get("name", "Report"))
            report_dir = self.output_dir / f"{report_name}.Report"
            report_dir.mkdir(exist_ok=True)

            definition = self._build_report_definition(doc, model_name)
            def_path = report_dir / "definition.pbir"
            def_path.write_text(json.dumps(definition, indent=2))
            report_artifacts.append({
                "id": doc.get("id"),
                "name": report_name,
                "path": str(report_dir),
                "pages": definition.get("pages", []),
            })

        pbip = {
            "version": "1.0",
            "artifacts": [
                {"report": {"path": f"{a['name']}.Report"}} for a in report_artifacts
            ] + [{"dataset": {"path": f"{model_name}.SemanticModel"}}],
        }
        pbip_path = self.output_dir / f"{project_name}.pbip"
        pbip_path.write_text(json.dumps(pbip, indent=2))

        unsupported = self._collect_unsupported(documents)
        unsupported_path = self.output_dir / "unsupported-items.json"
        unsupported_path.write_text(json.dumps(unsupported, indent=2))

        report_md = self._build_migration_report(documents, unsupported, report_artifacts, semantic_result)
        report_path = self.output_dir / "migration-report.md"
        report_path.write_text(report_md)

        readme = self._build_readme(unsupported)
        readme_path = self.output_dir / "MIGRATION_README.md"
        readme_path.write_text(readme)

        artifact_tree = {
            "semantic_model": semantic_result["definition"],
            "reports": [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "pages": [
                        {
                            "id": p.get("id", p.get("name")),
                            "name": p.get("name"),
                            "visuals": p.get("visuals", []),
                        }
                        for p in r.get("pages", [])
                    ],
                }
                for r in report_artifacts
            ],
            "files": [
                {"name": pbip_path.name, "type": "pbip"},
                {"name": "unsupported-items.json", "type": "json"},
                {"name": "migration-report.md", "type": "markdown"},
                {"name": "MIGRATION_README.md", "type": "markdown"},
            ],
        }
        tree_path = self.output_dir / "artifact-tree.json"
        tree_path.write_text(json.dumps(artifact_tree, indent=2))

        return {
            "artifacts": {
                "pbip": str(pbip_path),
                "unsupported": str(unsupported_path),
                "readme": str(readme_path),
                "migration_report": str(report_path),
                "artifact_tree": str(tree_path),
            },
            "artifact_tree": artifact_tree,
            "report_count": len(report_artifacts),
            "unsupported_count": len(unsupported),
        }

    def _iter_documents(self) -> list[dict[str, Any]]:
        documents = self.mspec.get("documents") or []
        if documents:
            return documents
        # Legacy flat reports[] fallback
        return [
            {
                "id": r.get("id", f"report-{i}"),
                "name": r.get("name", "Report"),
                "product_type": "webi",
                "pages": [
                    {
                        "id": f"page-{j}",
                        "name": p.get("name", f"Page {j + 1}"),
                        "blocks": [
                            {
                                "id": v.get("id", f"block-{k}"),
                                "type": v.get("type", "table"),
                                "title": v.get("title"),
                                "field_names": [f.get("name") for f in v.get("fields", []) if f.get("name")],
                                "status": v.get("status", "SUPPORTED"),
                            }
                            for k, v in enumerate(p.get("visuals", []))
                        ],
                    }
                    for j, p in enumerate(r.get("pages", [{"name": "Page 1", "visuals": r.get("visuals", [])}]))
                ],
            }
            for i, r in enumerate(self.mspec.get("reports", []))
        ]

    def _build_report_definition(self, document: dict[str, Any], model_name: str) -> dict[str, Any]:
        pages = []
        for page in document.get("pages", []):
            visuals = []
            for block in page.get("blocks", []):
                if block.get("status") == "UNSUPPORTED":
                    continue
                bindings = self._resolve_block_bindings(block)
                visuals.append({
                    "id": block.get("id"),
                    "type": self._map_block_type(block.get("type", "table")),
                    "title": block.get("title") or block.get("name") or block.get("type"),
                    "bindings": bindings,
                    "source_block_type": block.get("type"),
                })
            pages.append({
                "id": page.get("id"),
                "name": page.get("name", "Page"),
                "visuals": visuals,
            })

        return {
            "version": "1.0",
            "document_id": document.get("id"),
            "document_name": document.get("name"),
            "product_type": document.get("product_type", "webi"),
            "datasetReference": {"byPath": {"path": f"../{model_name}.SemanticModel"}},
            "pages": pages,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    def _resolve_block_bindings(self, block: dict[str, Any]) -> list[dict[str, Any]]:
        block_id = block.get("id")
        bindings: list[dict[str, Any]] = []

        block_items = [i for i in self.conversion_items if i.get("source_type") == "block" and i.get("source_id") == block_id]
        for item in block_items:
            target = item.get("target_path") or {}
            if target:
                bindings.append({
                    "source": item.get("source_name"),
                    "table": target.get("table"),
                    "column": target.get("column"),
                    "measure": target.get("measure"),
                    "status": item.get("status"),
                })

        if bindings:
            return bindings

        for field_name in block.get("field_names", []):
            resolved = self._resolve_field(field_name)
            bindings.append({"source": field_name, **resolved})
        return bindings

    def _resolve_field(self, source_name: str) -> dict[str, Any]:
        for item in self.conversion_items:
            if item.get("source_name", "").upper() == source_name.upper():
                target = item.get("target_path") or {}
                return {
                    "table": target.get("table"),
                    "column": target.get("column"),
                    "measure": target.get("measure"),
                    "status": item.get("status", "mapped"),
                }
        for mapping in self.mspec.get("mappings", []):
            if mapping.get("source_name", "").upper() == source_name.upper():
                return {
                    "table": mapping.get("target_table"),
                    "column": mapping.get("target_column"),
                    "measure": mapping.get("target_measure"),
                    "status": "mapped",
                }
        return {"status": "unmapped"}

    def _map_block_type(self, block_type: str) -> str:
        key = (block_type or "table").lower()
        return BLOCK_TYPE_TO_VISUAL.get(key, "tableEx")

    def _collect_unsupported(self, documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
        unsupported = []
        for doc in documents:
            for page in doc.get("pages", []):
                for block in page.get("blocks", []):
                    if block.get("status") != "UNSUPPORTED":
                        continue
                    unsupported.append({
                        "document": doc.get("name"),
                        "document_id": doc.get("id"),
                        "page": page.get("name"),
                        "block": block.get("title") or block.get("name") or block.get("type"),
                        "block_id": block.get("id"),
                        "type": block.get("type"),
                        "remediation": self._remediation_hint(block.get("type", "")),
                    })
        return unsupported

    def _remediation_hint(self, block_type: str) -> str:
        hints = {
            "olap": "Recreate as matrix visual with imported semantic model",
            "input_control": "Use slicer or parameter in Power BI",
            "section": "Use bookmark navigation or drill-through",
            "subreport": "Use drill-through to a separate report page",
        }
        return hints.get((block_type or "").lower(), "Manual recreation required in Power BI Desktop")

    def _build_migration_report(
        self,
        documents: list[dict[str, Any]],
        unsupported: list[dict[str, Any]],
        reports: list[dict[str, Any]],
        semantic: dict[str, Any],
    ) -> str:
        total_blocks = sum(len(p.get("blocks", [])) for d in documents for p in d.get("pages", []))
        supported = total_blocks - len(unsupported)
        return f"""# Migration Report

Generated: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}

## Summary
- **Documents:** {len(documents)}
- **Reports generated:** {len(reports)}
- **Semantic model tables:** {semantic.get("table_count", 0)}
- **Blocks converted:** {supported}/{total_blocks}
- **Unsupported blocks:** {len(unsupported)}

## Documents
{chr(10).join(f'- **{d.get("name")}** ({d.get("product_type", "webi")}) — {len(d.get("pages", []))} pages' for d in documents)}

## Unsupported Items
{chr(10).join(f'- {u["document"]} / {u["page"]}: {u["block"]} ({u["type"]}) — {u["remediation"]}' for u in unsupported) or "None"}

## Next Steps
1. Open the `.pbip` file in Power BI Desktop
2. Review unsupported items in `unsupported-items.json`
3. Validate field bindings against your semantic model
"""

    def _build_readme(self, unsupported: list[dict[str, Any]]) -> str:
        return f"""# Migration Package

Generated from Business Objects export to Power BI.

## Contents
- `.pbip` project file with semantic model and report(s)
- `migration-report.md` — human-readable summary
- `unsupported-items.json` — items requiring manual migration
- `artifact-tree.json` — generated structure metadata

## Unsupported Items: {len(unsupported)}
{chr(10).join(f'- {u["document"]}: {u["block"]} ({u["type"]})' for u in unsupported)}

## Manual Actions Required
Review unmapped fields and unsupported visuals before deploying to production.
"""

    def _safe_name(self, name: str) -> str:
        cleaned = re.sub(r"[^\w\s-]", "", name).strip().replace(" ", "_")
        return cleaned or "Migration"


def create_download_zip(output_dir: Path, zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in output_dir.rglob("*"):
            if file_path.is_file():
                zf.write(file_path, file_path.relative_to(output_dir))
