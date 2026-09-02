"""Unit tests for workflow phase logic (no database)."""
import pytest

from app.services.workflow_service import WorkflowService


class _FakeDb:
    pass


def test_ingest_phase_no_artifacts():
    svc = WorkflowService(_FakeDb())  # type: ignore
    status, blockers = svc._ingest_phase([], None, __import__('app.models', fromlist=['ProjectStatus']).ProjectStatus.CREATED)
    assert status == "pending"
    assert "Upload" in blockers[0]


def test_ingest_phase_complete():
    from app.models import ProjectStatus
    svc = WorkflowService(_FakeDb())  # type: ignore
    mspec = type("MSpec", (), {})()
    status, blockers = svc._ingest_phase([object()], mspec, ProjectStatus.PARSED)
    assert status == "complete"
    assert blockers == []


def test_target_phase_blocked_without_ingest():
    svc = WorkflowService(_FakeDb())  # type: ignore
    status, blockers = svc._target_phase(None, "pending")
    assert status == "blocked"


def test_map_phase_pending_no_mappings():
    svc = WorkflowService(_FakeDb())  # type: ignore
    status, blockers = svc._map_phase([], "complete", object())
    assert status == "pending"
    assert "Run AI" in blockers[0]


def test_map_phase_blocks_approved_without_target():
    from app.models import MappingStatus

    svc = WorkflowService(_FakeDb())  # type: ignore
    mapping = type(
        "Mapping",
        (),
        {
            "status": MappingStatus.APPROVED,
            "target_table": None,
            "target_column": None,
            "target_measure": None,
        },
    )()
    status, blockers = svc._map_phase([mapping], "complete", object())
    assert status == "in_progress"
    assert "lack a target" in blockers[0]


def test_deliver_next_action_after_generation():
    svc = WorkflowService(_FakeDb())  # type: ignore
    gen = type("Gen", (), {"status": "COMPLETED"})()
    phases = [
        {"id": "ingest", "status": "complete"},
        {"id": "target", "status": "complete"},
        {"id": "map", "status": "complete"},
        {"id": "convert", "status": "complete"},
        {"id": "deliver", "status": "in_progress"},
    ]
    action = svc._next_action(
        "p1", phases, [], object(), object(), [object()], set(),
        gen_run=gen, val_run=None,
    )
    assert action is not None
    assert action["label"] == "Run validation"
    assert "/deliver/validate" in action["route"]


def test_deliver_phase_blocked_without_convert():
    svc = WorkflowService(_FakeDb())  # type: ignore
    status, blockers = svc._deliver_phase(None, None, "pending")
    assert status == "blocked"


def test_current_phase_returns_first_incomplete():
    svc = WorkflowService(_FakeDb())  # type: ignore
    phases = [
        {"id": "ingest", "status": "complete"},
        {"id": "target", "status": "pending"},
        {"id": "map", "status": "blocked"},
    ]
    assert svc._current_phase(phases) == "target"
