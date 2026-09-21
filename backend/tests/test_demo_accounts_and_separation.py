import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from app.database import SessionLocal, Base, engine
from app.models import Emergency, Driver, Ambulance, Hospital, DriverAlert
from app.seed.demo_data import seed_database
from app.services.ambulance_service import rank_ambulances

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_demo_fixtures():
    """Ensure database schema and baseline demo seed data exist before each test."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()


def test_demo_status_endpoint():
    """Verifies that the demo status endpoint returns the configured DEMO_MODE flag."""
    resp = client.get("/api/auth/demo-status")
    assert resp.status_code == 200
    data = resp.json()
    assert "demo_mode" in data
    assert data["demo_mode"] == settings.DEMO_MODE


def test_demo_login_driver_a():
    """Verifies instant demo login for Demo Driver A with isolated metadata."""
    resp = client.post("/api/auth/demo-login", json={
        "role": "DRIVER",
        "demo_id": "drv-demo-001"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["token"].startswith("ll_demo_")
    driver = data["driver"]
    assert driver["id"] == "drv-demo-001"
    assert driver["name"] == "Demo Driver A"
    assert driver["is_demo"] is True
    assert "DRIVER_A" in driver["demo_type"]
    assert driver["assigned_ambulance_id"] == "amb-demo-001"


def test_demo_login_driver_b():
    """Verifies instant demo login for Demo Driver B with isolated metadata."""
    resp = client.post("/api/auth/demo-login", json={
        "role": "DRIVER",
        "demo_id": "drv-demo-002"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["token"].startswith("ll_demo_")
    driver = data["driver"]
    assert driver["id"] == "drv-demo-002"
    assert driver["name"] == "Demo Driver B"
    assert driver["is_demo"] is True
    assert "DRIVER_B" in driver["demo_type"]
    assert driver["assigned_ambulance_id"] == "amb-demo-002"


def test_demo_login_hospital_staff():
    """Verifies instant demo login for Demo ER Staff."""
    resp = client.post("/api/auth/demo-login", json={
        "role": "HOSPITAL_STAFF",
        "demo_id": "staff-demo-001"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["token"].startswith("ll_demo_")
    staff = data["driver"]
    assert staff["id"] == "staff-demo-001"
    assert staff["name"] == "Demo ER Staff"
    assert staff["is_demo"] is True
    assert staff["role"] == "HOSPITAL_STAFF"


def test_demo_login_rejected_when_demo_mode_disabled():
    """Verifies that demo login fails with 403 Forbidden when DEMO_MODE is disabled."""
    original_setting = settings.DEMO_MODE
    try:
        settings.DEMO_MODE = False
        resp = client.post("/api/auth/demo-login", json={
            "role": "DRIVER",
            "demo_id": "drv-demo-001"
        })
        assert resp.status_code == 403
        assert "disabled" in resp.json()["detail"].lower()
    finally:
        settings.DEMO_MODE = original_setting


def test_multi_driver_atomic_acceptance_concurrency():
    """
    Verifies that when a demo emergency is created:
    1. Driver A accepts -> 200 ACCEPTED.
    2. Driver B subsequently tries to accept -> ALREADY_ASSIGNED / conflict.
    """
    # 1. Create a demo emergency
    resp_emg = client.post("/api/emergencies", json={
        "description": "Demo trauma incident near Anna University.",
        "latitude": 13.0100,
        "longitude": 80.2350,
        "patient_count": 1,
        "critical_patient_count": 1,
        "severity": "CRITICAL",
        "incident_type": "TRAUMA_INJURY",
        "is_demo": True,
        "demo_type": "HERO_DEMO"
    })
    assert resp_emg.status_code == 201
    emg_id = resp_emg.json()["id"]

    # 2. Driver A accepts the dispatch
    resp_accept_a = client.post("/api/dispatch/accept", json={
        "emergency_id": emg_id,
        "driver_id": "drv-demo-001",
        "ambulance_id": "amb-demo-001",
        "latitude": 13.0080,
        "longitude": 80.2015
    })
    assert resp_accept_a.status_code == 200
    data_a = resp_accept_a.json()
    assert data_a["success"] is True
    assert data_a["status"] == "ACCEPTED"
    assert data_a["emergency_id"] == emg_id

    # 3. Driver B tries to accept the already assigned emergency
    resp_accept_b = client.post("/api/dispatch/accept", json={
        "emergency_id": emg_id,
        "driver_id": "drv-demo-002",
        "ambulance_id": "amb-demo-002",
        "latitude": 13.0120,
        "longitude": 80.2150
    })
    data_b = resp_accept_b.json()
    assert data_b["success"] is False
    assert data_b["status"] == "ALREADY_ASSIGNED"


def test_safe_demo_reset_preserves_real_records():
    """
    Verifies that POST /api/demo/reset purges only is_demo=True data,
    leaving real operational data 100% intact.
    """
    db = SessionLocal()
    try:
        # 1. Create a real emergency
        real_emg = Emergency(
            id="emg-real-safe-test-999",
            code="EMG-REAL-999",
            description="Real live medical emergency - must never be deleted",
            latitude=13.0500,
            longitude=80.2500,
            patient_count=1,
            critical_patient_count=0,
            severity="MEDIUM",
            incident_type="GENERAL_MEDICAL",
            status="PENDING",
            is_demo=False
        )
        db.merge(real_emg)

        # 2. Create a demo emergency
        demo_emg = Emergency(
            id="emg-demo-to-purge-888",
            code="EMG-DEMO-888",
            description="Temporary demo emergency",
            latitude=13.0100,
            longitude=80.2350,
            patient_count=1,
            critical_patient_count=1,
            severity="CRITICAL",
            incident_type="TRAUMA_INJURY",
            status="ACCEPTED",
            is_demo=True,
            demo_type="TEST_DEMO"
        )
        db.merge(demo_emg)
        db.commit()
    finally:
        db.close()

    # 3. Call Demo Safe Reset
    resp_reset = client.post("/api/demo/reset")
    assert resp_reset.status_code == 200
    data = resp_reset.json()
    assert data["status"] == "success"
    assert "Real operational records remain untouched" in data["message"]

    # 4. Verify in DB: real emergency is still present, purged demo is gone
    db = SessionLocal()
    try:
        check_real = db.query(Emergency).filter(Emergency.id == "emg-real-safe-test-999").first()
        assert check_real is not None
        assert check_real.is_demo is False
        assert check_real.code == "EMG-REAL-999"

        check_demo = db.query(Emergency).filter(Emergency.id == "emg-demo-to-purge-888").first()
        assert check_demo is None

        # Clean up real test record
        db.delete(check_real)
        db.commit()
    finally:
        db.close()


def test_ambulance_ranking_excludes_demo_ambulances_for_real_emergencies():
    """
    Verifies that real emergencies (is_demo=False) NEVER recommend demo ambulances.
    """
    db = SessionLocal()
    try:
        ambulances = db.query(Ambulance).filter(Ambulance.status == "AVAILABLE").all()
        real_emg = Emergency(
            id="emg-real-rank-test-111",
            code="EMG-REAL-111",
            description="Real live medical emergency for ranking",
            latitude=13.0100,
            longitude=80.2200,
            patient_count=1,
            critical_patient_count=0,
            severity="MEDIUM",
            incident_type="GENERAL_MEDICAL",
            status="PENDING",
            is_demo=False
        )
        recs = rank_ambulances(ambulances=ambulances, emergency=real_emg)
        for rec in recs:
            assert rec.is_demo is not True
            assert rec.ambulance_id not in ("amb-demo-001", "amb-demo-002")
    finally:
        db.close()
