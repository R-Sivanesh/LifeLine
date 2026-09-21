import pytest
import concurrent.futures
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import Emergency, EmergencySession, Driver, Ambulance, DriverAlert, EmergencyEvent
from app.services.google_routes_service import analyze_emergency_priority_corridor
from app.schemas import RouteOption, RouteStep

client = TestClient(app)

def test_emergency_creation_creates_secure_session():
    """
    Verifies that emergency creation returns a secure temporary session token and EMG- code.
    """
    resp = client.post("/api/emergencies", json={
        "description": "Pedestrian hit by vehicle near Guindy, severe bleeding.",
        "latitude": 13.0067,
        "longitude": 80.2025,
        "patient_count": 1,
        "critical_patient_count": 1,
        "severity": "CRITICAL",
        "incident_type": "TRAUMA_INJURY"
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert "code" in data
    assert data["code"].startswith("EMG-")
    assert "session" in data
    assert data["session"]["session_token"].startswith("ll_sess_")
    assert data["session"]["is_active"] is True

    # Verify audit event was persisted
    db = SessionLocal()
    try:
        event = db.query(EmergencyEvent).filter(
            EmergencyEvent.emergency_id == data["id"],
            EmergencyEvent.event_type == "CREATED"
        ).first()
        assert event is not None
        assert "CREATED" in event.event_type
    finally:
        db.close()


def test_driver_google_auth_and_status():
    """
    Verifies driver authentication and operational status update.
    """
    resp = client.post("/api/auth/google-login", json={
        "email": "driver.test@lifeline.org",
        "name": "Test Driver 99",
        "google_id": "goog_test_99",
        "ambulance_id": "amb-103",
        "role": "DRIVER"
    })
    assert resp.status_code == 200
    data = resp.json()
    driver_id = data["driver"]["id"]
    assert data["token"].startswith("ll_drv_")
    assert data["driver"]["status"] == "AVAILABLE"

    # Update driver status to EN_ROUTE
    stat_resp = client.post(f"/api/auth/driver-status?driver_id={driver_id}", json={
        "status": "EN_ROUTE",
        "latitude": 13.0100,
        "longitude": 80.2050
    })
    assert stat_resp.status_code == 200
    assert stat_resp.json()["status"] == "EN_ROUTE"


def test_atomic_driver_acceptance_concurrency_race():
    """
    CRITICAL DISPATCH CONCURRENCY TEST:
    Simulates two drivers (Driver A and Driver B) receiving alerts for the same emergency
    and attempting to ACCEPT simultaneously. Exactly ONE driver must win the assignment,
    and the other must be rejected with status ALREADY_ASSIGNED.
    """
    # 1. Create a test emergency
    emg_resp = client.post("/api/emergencies", json={
        "description": "Cardiac arrest at Tambaram, immediate life support required.",
        "latitude": 12.9249,
        "longitude": 80.1000,
        "severity": "CRITICAL",
        "incident_type": "CARDIAC_ARREST"
    })
    emg_id = emg_resp.json()["id"]

    # 2. Transmit alerts to 2 ambulances
    alert_resp = client.post(f"/api/dispatch/alert?emergency_id={emg_id}", json=["amb-102", "amb-103"])
    assert alert_resp.status_code == 200
    alerts = alert_resp.json()
    assert len(alerts) >= 2

    # 3. Simulate simultaneous driver acceptances
    driver_a = "drv-101"
    driver_b = "drv-102"

    def attempt_accept(driver_id, amb_id):
        return client.post("/api/dispatch/accept", json={
            "emergency_id": emg_id,
            "driver_id": driver_id,
            "ambulance_id": amb_id,
            "latitude": 12.9300,
            "longitude": 80.1050
        })

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_a = executor.submit(attempt_accept, driver_a, "amb-103")
        f_b = executor.submit(attempt_accept, driver_b, "amb-102")

        res_a = f_a.result()
        res_b = f_b.result()

    data_a = res_a.json()
    data_b = res_b.json()

    statuses = [data_a["status"], data_b["status"]]
    assert "ACCEPTED" in statuses
    assert "ALREADY_ASSIGNED" in statuses

    # Exactly one winner
    winners = [d for d in [data_a, data_b] if d["success"] is True and d["status"] == "ACCEPTED"]
    losers = [d for d in [data_a, data_b] if d["success"] is False and d["status"] == "ALREADY_ASSIGNED"]
    assert len(winners) == 1
    assert len(losers) == 1

    # Verify competing alert was cancelled in database
    db = SessionLocal()
    try:
        emg = db.query(Emergency).filter(Emergency.id == emg_id).first()
        assert emg.status == "ACCEPTED"
        assert emg.assigned_driver_id == winners[0]["assigned_driver_id"]

        cancelled_alerts = db.query(DriverAlert).filter(
            DriverAlert.emergency_id == emg_id,
            DriverAlert.status == "CANCELLED"
        ).count()
        assert cancelled_alerts >= 1
    finally:
        db.close()


def test_emergency_state_machine_progression():
    """
    Verifies valid progression through the emergency state machine:
    ACCEPTED -> EN_ROUTE -> ARRIVED -> PATIENT_ONBOARD -> TRANSPORTING -> COMPLETED
    """
    emg_resp = client.post("/api/emergencies", json={
        "description": "Patient breathing difficulty.",
        "latitude": 13.0400,
        "longitude": 80.2400
    })
    emg_id = emg_resp.json()["id"]

    # Accept emergency
    client.post("/api/dispatch/accept", json={
        "emergency_id": emg_id,
        "driver_id": "drv-101",
        "ambulance_id": "amb-103"
    })

    # Step 1: EN_ROUTE
    r1 = client.post("/api/dispatch/transition", json={
        "emergency_id": emg_id,
        "target_status": "EN_ROUTE",
        "driver_id": "drv-101"
    })
    assert r1.status_code == 200
    assert r1.json()["status"] == "EN_ROUTE"

    # Step 2: ARRIVED
    r2 = client.post("/api/dispatch/transition", json={
        "emergency_id": emg_id,
        "target_status": "ARRIVED",
        "driver_id": "drv-101"
    })
    assert r2.status_code == 200
    assert r2.json()["status"] == "ARRIVED"

    # Step 3: PATIENT_ONBOARD
    r3 = client.post("/api/dispatch/transition", json={
        "emergency_id": emg_id,
        "target_status": "PATIENT_ONBOARD",
        "driver_id": "drv-101"
    })
    assert r3.status_code == 200
    assert r3.json()["status"] == "PATIENT_ONBOARD"

    # Step 4: TRANSPORTING
    r4 = client.post("/api/dispatch/transition", json={
        "emergency_id": emg_id,
        "target_status": "TRANSPORTING",
        "driver_id": "drv-101"
    })
    assert r4.status_code == 200
    assert r4.json()["status"] == "TRANSPORTING"

    # Step 5: COMPLETED
    r5 = client.post("/api/dispatch/transition", json={
        "emergency_id": emg_id,
        "target_status": "COMPLETED",
        "driver_id": "drv-101"
    })
    assert r5.status_code == 200
    assert r5.json()["status"] == "COMPLETED"


def test_operational_analytics_and_audit_log():
    """
    Verifies analytics KPI calculation and audit log retrieval.
    """
    metrics_resp = client.get("/api/analytics/metrics")
    assert metrics_resp.status_code == 200
    m = metrics_resp.json()
    assert "total_emergencies" in m
    assert m["total_emergencies"] >= 1
    assert "avg_dispatch_time_seconds" in m
    assert "driver_acceptance_rate_percent" in m

    audit_resp = client.get("/api/analytics/audit-log")
    assert audit_resp.status_code == 200
    logs = audit_resp.json()
    assert isinstance(logs, list)
    assert len(logs) >= 1
    assert "event_type" in logs[0]
    assert "created_at" in logs[0]


def test_emergency_priority_corridor_analysis():
    """
    Verifies emergency priority corridor delay calculation and alternate corridor time savings.
    """
    routes = [
        RouteOption(
            id="route_a",
            name="Primary Arterial",
            distance_km=12.0,
            duration_minutes=24.0,
            geometry=[],
            risk_level="HIGH",
            incidents=[],
            adjusted_eta_minutes=24.0,
            steps=[],
            traffic_delay_minutes=9.5,
            congestion_level="SEVERE"
        ),
        RouteOption(
            id="route_b",
            name="Express Alternate Corridor",
            distance_km=14.0,
            duration_minutes=16.0,
            geometry=[],
            risk_level="LOW",
            incidents=[],
            adjusted_eta_minutes=16.0,
            steps=[],
            traffic_delay_minutes=1.0,
            congestion_level="NORMAL"
        )
    ]

    analysis = analyze_emergency_priority_corridor(routes)
    assert analysis["status"] == "REROUTE_RECOMMENDED"
    assert analysis["time_saved_minutes"] == 8.0
    assert analysis["recommended_corridor"].name == "Express Alternate Corridor"
    assert "No public municipal signal override" in analysis["traffic_control_integration"]
