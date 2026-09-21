"""Context-aware mock chat responses for the migration assistant."""

import json
import re


def get_mock_chat_response(message: str, project_context: str, page_context: str) -> str:
    msg = message.lower().strip()
    try:
        ctx = json.loads(project_context)
    except json.JSONDecodeError:
        ctx = {}
    try:
        page = json.loads(page_context)
    except json.JSONDecodeError:
        page = {}

    page_label = page.get("label", "this page")
    workflow = ctx.get("workflow", {})
    summary = workflow.get("summary", {})
    next_action = workflow.get("next_action")
    phases = workflow.get("phases", [])
    project = ctx.get("project", {})

    # Global / no project
    if ctx.get("mode") == "global":
        if "workflow" in msg or "phase" in msg or "steps" in msg:
            return (
                "BI Loom follows 5 phases: **Ingest** (upload & parse BO) → **Target** (select Pluto model) "
                "→ **Map** (AI semantic mapping) → **Convert** (BO→PBI conversion) → **Deliver** (generate, validate, download). "
                "Create a project from **Projects**, then upload `sample-data/projects/fixed-telco-orders/artifacts/fixed-telco-orders.zip`."
            )
        if "sample" in msg or "demo" in msg:
            return (
                "Sample assets live under `sample-data/projects/`. Use **Fixed Telco Orders** for a full demo: "
                "upload the ZIP in Ingest, import `target/pluto-model.json` on Target, then run mapping."
            )
        return (
            "I'm your BI Loom assistant. Open a project to get contextual help, or ask about the workflow, "
            "sample-data, or how to start a migration."
        )

    # Next action / progress
    if any(k in msg for k in ("next", "should i do", "what now", "block", "progress", "status", "summarize")):
        lines = [f"**{project.get('name', 'Project')}** is in `{project.get('status', 'UNKNOWN')}` status."]
        for p in phases:
            icon = "✓" if p.get("status") == "complete" else "→" if p.get("status") == "in_progress" else "○"
            blockers = f" — {', '.join(p['blockers'])}" if p.get("blockers") else ""
            lines.append(f"{icon} **{p['label']}**: {p['status']}{blockers}")
        if next_action:
            lines.append(f"\n**Recommended:** {next_action['label']} (sidebar → {next_action['route']})")
        return "\n".join(lines)

    # Page-specific hints
    page_key = page.get("key", "")
    if "upload" in msg or "zip" in msg or "artifact" in msg or page_key.endswith("artifacts"):
        if not summary.get("artifacts"):
            return (
                "On **Upload Assets**, drag `fixed-telco-orders.zip` from sample-data or your BO export. "
                "The pre-parse checklist validates the manifest. When ready, click **Continue to Parsing**."
            )
        return (
            f"You have **{summary.get('artifacts', 0)} artifact(s)** uploaded. "
            "If the checklist is green, go to **Parsing** (step 2 under Ingest in the sidebar)."
        )

    if "parse" in msg or page_key.endswith("parsing"):
        return (
            "On **Parsing**, click **Start Parsing** for the full export, or use **Parse selected** to run case-by-case "
            "per document (WebI, Crystal, Dashboard, Analysis). When complete, open **View MSpec**."
        )

    if "mspec" in msg or page_key.endswith("mspec"):
        docs = ctx.get("mspec", {}).get("documents", 0)
        return (
            f"**MSpec** is the migration specification ({docs} documents). "
            "Use section tabs and search to inspect blocks, fields, and traceability before mapping."
        )

    if "map" in msg or "mapping" in msg or page_key == "map":
        total = summary.get("mappings_total", 0)
        pending = summary.get("mappings_pending", 0)
        if total == 0:
            return "Run **AI Mapping** first (Map phase). Select a target model on Target before mapping is enabled."
        return (
            f"You have **{total} mappings** ({pending} pending review). "
            "Use bulk approve for HIGH confidence, inspect LOW items in the inspector, then approve to unlock Convert."
        )

    if "convert" in msg or page_key == "convert":
        items = ctx.get("conversion_items", 0)
        return (
            f"**Conversion Studio** links source blocks → conversion items → PBI targets. "
            f"{'Run Conversion to create items.' if items == 0 else f'{items} conversion items exist — click blocks to inspect.'}"
        )

    if "generat" in msg or "deliver" in msg or "pbi" in msg:
        return (
            "**Deliver** has 3 steps: **Generate** (create .pbip package), **Validate** (migration score), "
            "**Results** (download). Complete pre-flight checklist before generating."
        )

    if "target" in msg or "pluto" in msg or "model" in msg or page_key == "target":
        if not summary.get("has_target_model"):
            return "Import or select a **Pluto semantic model** on the Target page before running AI mapping."
        model = ctx.get("target_model", {})
        return f"Active target model: **{model.get('name', 'Pluto model')}**. Review coverage and glossary before mapping."

    # Default contextual reply
    return (
        f"I'm here to help on **{page_label}**. "
        f"{page.get('help', '')} "
        f"Your project has {summary.get('artifacts', 0)} artifacts, "
        f"{'MSpec ✓' if summary.get('has_mspec') else 'no MSpec yet'}, "
        f"{'target model ✓' if summary.get('has_target_model') else 'no target model'}."
    )
