import json

from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.target_model_catalog import list_catalog_models
from app.core.database import get_db
from app.core.middleware import get_request_id, success_response
from app.services.project_service import PlutoService

router = APIRouter(prefix="/projects/{project_id}", tags=["pluto"])


@router.get("/target-models/catalog")
async def list_target_model_catalog(project_id: str, request: Request):
    return success_response(list_catalog_models(), get_request_id(request))


@router.post("/pluto-model/select")
async def select_catalog_model(
    project_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Select one catalog model (legacy) or a multi-model / table coverage selection.

    Body (single model):
      { "catalog_id": "...", "name"?: "...", "tables"?: ["FactOrder", ...] }

    Body (multi-model coverage):
      { "selections": [{ "catalog_id": "...", "tables"?: [...] }, ...], "name"?: "..." }
    """
    body = await request.json()
    service = PlutoService(db)
    selections = body.get("selections")
    name = body.get("name")

    if selections is not None:
        if not isinstance(selections, list) or not selections:
            from app.core.exceptions import ValidationError
            raise ValidationError("selections must be a non-empty list")
        pluto = await service.apply_coverage_selection(project_id, selections, name=name)
    else:
        catalog_id = body.get("catalog_id")
        if not catalog_id:
            from app.core.exceptions import ValidationError
            raise ValidationError("catalog_id or selections is required")
        tables = body.get("tables")
        pluto = await service.apply_coverage_selection(
            project_id,
            [{"catalog_id": catalog_id, "tables": tables}],
            name=name,
        )

    meta = (pluto.model_data or {}).get("_meta") or {}
    return success_response({
        "id": pluto.id,
        "name": pluto.name or meta.get("name"),
        "catalog_id": pluto.catalog_id or meta.get("catalog_id"),
        "tables": len((pluto.model_data or {}).get("tables", [])),
        "selected_catalog_ids": meta.get("selected_catalog_ids") or [],
        "selected_tables": meta.get("selected_tables") or {},
    }, get_request_id(request))


@router.get("/pluto-models")
async def list_pluto_models(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = PlutoService(db)
    models = await service.ensure_single_active(project_id)
    return success_response([
        {
            "id": m.id,
            "name": getattr(m, "name", None) or m.model_data.get("_meta", {}).get("name", "Imported Model"),
            "catalog_id": getattr(m, "catalog_id", None) or m.model_data.get("_meta", {}).get("catalog_id"),
            "is_active": bool(getattr(m, "is_active", False)),
            "table_count": len(m.model_data.get("tables", [])),
            "column_count": len(m.model_data.get("columns", [])),
            "measure_count": len(m.model_data.get("measures", [])),
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "selected_catalog_ids": (m.model_data or {}).get("_meta", {}).get("selected_catalog_ids") or (
                [getattr(m, "catalog_id")] if getattr(m, "catalog_id", None) else []
            ),
            "selected_tables": (m.model_data or {}).get("_meta", {}).get("selected_tables") or {},
        }
        for m in models
    ], get_request_id(request))


@router.post("/pluto-models/{model_id}/activate")
async def activate_pluto_model(
    project_id: str, model_id: str, request: Request, db: AsyncSession = Depends(get_db),
):
    service = PlutoService(db)
    pluto = await service.set_active(project_id, model_id)
    return success_response({"id": pluto.id, "active": True}, get_request_id(request))


@router.delete("/pluto-models/{model_id}")
async def delete_pluto_model(
    project_id: str, model_id: str, request: Request, db: AsyncSession = Depends(get_db),
):
    service = PlutoService(db)
    result = await service.delete_model(project_id, model_id)
    return success_response(result, get_request_id(request))


@router.get("/pluto-model/tree")
async def get_pluto_model_tree(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = PlutoService(db)
    pluto = await service.get_active(project_id)
    if not pluto:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("No target semantic model selected")
    from app.generators.powerbi.pbi_preview import build_target_tree
    tree = build_target_tree({}, pluto.model_data, [])
    return success_response(tree.get("semantic_model"), get_request_id(request))


@router.get("/pluto-model/graph")
async def get_pluto_model_graph(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = PlutoService(db)
    pluto = await service.get_active(project_id)
    if not pluto:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("No target semantic model selected")
    graph = service.get_graph(pluto.model_data)
    return success_response(graph, get_request_id(request))


@router.get("/pluto-model/coverage")
async def get_model_coverage(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = PlutoService(db)
    coverage = await service.compute_coverage(project_id)
    return success_response(coverage, get_request_id(request))


@router.get("/target-models/catalog/{catalog_id}/preview")
async def get_catalog_preview(project_id: str, catalog_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = PlutoService(db)
    preview = service.get_catalog_preview(catalog_id)
    if not preview:
        from app.core.exceptions import NotFoundError
        raise NotFoundError(f"Catalog model '{catalog_id}' not found")
    return success_response(preview, get_request_id(request))


@router.post("/pluto-model")
async def import_pluto_model(
    project_id: str,
    request: Request,
    file: UploadFile = File(None),
    db: AsyncSession = Depends(get_db),
):
    service = PlutoService(db)
    if file:
        content = await file.read()
        model_data = json.loads(content)
    else:
        body = await request.json()
        model_data = body.get("model_data", body)
    pluto = await service.import_model(project_id, model_data)
    return success_response({"id": pluto.id, "tables": len(model_data.get("tables", []))}, get_request_id(request))


@router.get("/pluto-model")
async def get_pluto_model(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = PlutoService(db)
    pluto = await service.get_latest(project_id)
    if not pluto:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("No Pluto model found")
    return success_response(pluto.model_data, get_request_id(request))


@router.post("/glossary")
async def import_glossary(
    project_id: str,
    request: Request,
    file: UploadFile = File(None),
    db: AsyncSession = Depends(get_db),
):
    service = PlutoService(db)
    if file:
        content = await file.read()
        terms = json.loads(content)
        if isinstance(terms, dict):
            terms = terms.get("terms", [terms])
    else:
        body = await request.json()
        terms = body.get("terms", body if isinstance(body, list) else [body])
    result = await service.import_glossary(project_id, terms)
    return success_response({"imported": len(result)}, get_request_id(request))


@router.get("/glossary")
async def get_glossary(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    service = PlutoService(db)
    terms = await service.get_glossary(project_id)
    return success_response(
        [{"term": t.term, "synonyms": t.synonyms, "definition": t.definition} for t in terms],
        get_request_id(request),
    )
