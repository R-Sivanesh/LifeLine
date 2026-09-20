import pytest
import time
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app
from app.models import Emergency, Ambulance, Hospital
from app.schemas import AmbulanceTelemetryRequest
from app.services.ambulance_service import (
    _LIVE_AMBULANCE_POOL,
    update_live_ambulance_telemetry,
    evaluate_telemetry_freshness,
    rank_live_ambulances,
    get_live_ambulances_list
)
from app.services.optimization_service import run_golden_minute_optimization

client = TestClient(app)

@pytest.fixture(autouse=True)
def clear_ambulance_pool():
    """Reset live telemetry before each test."""
    _LIVE_AMBULANCE_POOL.clear()
    yield
    _LIVE_AMBULANCE_POOL.clear()

def test_telemetry_ingest_and_get_live():
    """Test GPS telemetry ingestion and retrieval endpoint."""
    payload = {
        "id": "A-103",
        "vehicle_number": "A-103 (Mobile ICU)",
        "capability": "ICU",
        "status": "AVAILABLE",
        "latitude": 12.9250,
        "longitude": 80.1280,
        "speed": 35.0,
        "heading": 90.0,
        "accuracy": 4.5
    }
    
    # Ingest
    res = client.post("/api/ambulances/telemetry", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "A-103"
    assert data["status"] == "AVAILABLE"
    assert data["freshness_status"] == "LIVE"
    assert data["source"] == "LIVE_GPS"
    
    # Retrieve live list
    list_res = client.get("/api/ambulances/live")
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["source"] == "LIVE_GPS"
    assert list_data["count"] == 1
    assert list_data["ambulances"][0]["id"] == "A-103"
    assert list_data["ambulances"][0]["freshness_status"] == "LIVE"

def test_freshness_evaluation():
    """Test stale and offline detection logic."""
    now = time.time()
    
    # Fresh (< 30s)
    fresh_status, age = evaluate_telemetry_freshness(now - 5)
    assert fresh_status == "LIVE"
    assert 4.0 <= age <= 6.5
    
    # Stale (30 - 60s)
    stale_status, age = evaluate_telemetry_freshness(now - 45)
    assert stale_status == "STALE"
    assert 44.0 <= age <= 46.5
    
    # Offline (> 60s)
    offline_status, age = evaluate_telemetry_freshness(now - 90)
    assert offline_status == "OFFLINE"
    assert 89.0 <= age <= 91.5

def test_live_ambulance_ranking_filters_stale_and_busy():
    """Verify that only AVAILABLE and fresh LIVE ambulances are scored high."""
    emg = Emergency(
        id="emg-test-gps",
        latitude=12.9249,
        longitude=80.1275,
        severity="CRITICAL",
        patient_count=1,
        critical_patient_count=1,
        incident_type="ROAD_ACCIDENT"
    )
    
    now_ms = time.time() * 1000.0
    
    # Amb 1: Live & Available
    amb1 = {
        "id": "A-101",
        "vehicle_number": "A-101 (Live ALS)",
        "capability": "ADVANCED",
        "status": "AVAILABLE",
        "latitude": 12.9300,
        "longitude": 80.1300,
        "updated_at": now_ms - 2000, # 2s old
    }
    
    # Amb 2: Stale (>30s old)
    amb2 = {
        "id": "A-102",
        "vehicle_number": "A-102 (Stale ICU)",
        "capability": "ICU",
        "status": "AVAILABLE",
        "latitude": 12.9260,
        "longitude": 80.1280,
        "updated_at": now_ms - 40000, # 40s old
    }
    
    # Amb 3: Busy / En Route
    amb3 = {
        "id": "A-103",
        "vehicle_number": "A-103 (En Route ICU)",
        "capability": "ICU",
        "status": "EN_ROUTE",
        "latitude": 12.9255,
        "longitude": 80.1278,
        "updated_at": now_ms - 1000,
    }
    
    ranked = rank_live_ambulances([amb1, amb2, amb3], emg)
    assert len(ranked) == 3
    # Top ranked must be the available live ambulance
    assert ranked[0].ambulance_id == "A-101"
    assert ranked[0].freshness_status == "LIVE"
    assert ranked[0].match_score > ranked[1].match_score

@pytest.mark.asyncio
async def test_golden_minute_with_live_gps_ambulance():
    """Test Golden Minute optimization selects connected live GPS ambulance."""
    emg = Emergency(
        id="emg-live-gps",
        latitude=12.9249,
        longitude=80.1275,
        severity="CRITICAL",
        patient_count=1,
        critical_patient_count=1,
        incident_type="ROAD_ACCIDENT"
    )
    
    # Ingest live ambulance
    update_live_ambulance_telemetry(AmbulanceTelemetryRequest(
        id="A-103",
        vehicle_number="A-103 (Live Mobile ICU)",
        capability="ICU",
        status="AVAILABLE",
        latitude=12.9350,
        longitude=80.1350,
        speed=40.0,
        updated_at=time.time() * 1000.0
    ))
    
    hosp = Hospital(
        id="hosp-001",
        name="Tambaram General Care Center",
        latitude=12.9236,
        longitude=80.1141,
        emergency_available=True,
        trauma_capable=True,
        icu_available=True,
        available_beds=6,
        status="OPEN"
    )
    
    res = await run_golden_minute_optimization(emg, [], [hosp], [])
    assert res.has_live_ambulance is True
    assert res.selected_ambulance is not None
    assert res.selected_ambulance.ambulance_id == "A-103"
    assert res.selected_ambulance.source == "LIVE_GPS"
    assert res.selected_ambulance.freshness_status == "LIVE"
    assert res.selected_ambulance.distance_km > 0
    assert res.ambulance_eta > 0
