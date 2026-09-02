import json
from pathlib import Path
from typing import Any


class SemanticModelGenerator:
    """Generate a minimal semantic model definition from Pluto model data."""

    def __init__(self, pluto_model: dict[str, Any], output_dir: Path, model_name: str = "PlutoSemanticModel"):
        self.pluto_model = pluto_model
        self.output_dir = output_dir
        self.model_name = model_name

    def generate(self) -> dict[str, Any]:
        model_dir = self.output_dir / f"{self.model_name}.SemanticModel"
        model_dir.mkdir(parents=True, exist_ok=True)

        tables = []
        for table in self.pluto_model.get("tables", []):
            columns = [
                {"name": c.get("name"), "dataType": c.get("data_type", "string")}
                for c in table.get("columns", [])
            ]
            measures = [
                {"name": m.get("name"), "expression": m.get("expression", f"[{m.get('name')}]")}
                for m in table.get("measures", [])
            ]
            tables.append({
                "name": table.get("name"),
                "columns": columns,
                "measures": measures,
            })

        definition = {
            "version": "1.0",
            "name": self.model_name,
            "tables": tables,
            "relationships": self.pluto_model.get("relationships", []),
        }

        def_path = model_dir / "model.json"
        def_path.write_text(json.dumps(definition, indent=2))

        return {
            "path": str(model_dir),
            "definition": definition,
            "name": self.model_name,
            "table_count": len(tables),
        }
