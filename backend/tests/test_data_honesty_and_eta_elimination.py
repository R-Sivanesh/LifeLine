import pytest
import time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models import Emergency, Ambulance, Hospital, RoadIncident, Driver, DriverAlert
from app.services.ambulance_service import (
    update_live_ambulance_telemetry,
    rank_live_ambulances,
    rank_ambulances,
    evaluate_telemetry_freshness,
    _LIVE_AMBULANCE_POOL,
    MAX_DISPATCH_RADIUS_KM
)
from app.services.optimization_service import run_golden_minute_optimization
from app.schemas import AmbulanceTelemetryRequest

TEST_DB_URL = "sqlite:///:memory:"

@pytest.fixture
def db_session():
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)

@pytest.mark.asyncio
async def test_unassigned_emergency_never_returns_fake_or_240min_eta(db_session):
    """
    DATA HONESTY TEST:
    When an emergency is in SEARCHING state and no driver has accepted:
    1. selected_ambulance must be None for real emergencies.
    2. ambulance_eta must be 0.0 (or None).
    3. no_ambulance_reason must clearly explain that the system is waiting for driver acceptance.
    4. Never returns a distant seed ambulance 140km away with ~240 min ETA.
    """
    # Create emergency in Pondicherry (11.9416, 79.8083)
    emg = Emergency(
        id="emg-pondy-001",
        code="EMG-PND01",
        title="Road Crash",
        description="Two bikes collided near Pondy Beach",
        incident_type="ROAD_ACCIDENT",
        latitude=11.9416,
        longitude=79.8083,
        severity="HIGH",
        status="SEARCHING",
        is_demo=False
    )
    db_session.add(emg)
    
    # Add seed ambulance in Chennai (13.0827, 80.2707) ~140 km away
    amb = Ambulance(
        id="amb-chennai-seed",
        vehicle_number="TN-01-AMB-9999",
        capability="ICU",
        status="AVAILABLE",
        latitude=13.0827,
        longitude=80.2707,
        is_demo=False
    )
    hosp = Hospital(
        id="hosp-pnd-01",
        name="Puducherry General Hospital",
        latitude=11.9350,
        longitude=79.8300,
        available_beds=15,
        emergency_available=True,
        trauma_capable=True,
        icu_available=True
    )
    db_session.add(amb)
    db_session.add(hosp)
    db_session.commit()
    
    # Run optimization on unassigned real emergency
    opt = await run_golden_minute_optimization(emg, [amb], [hosp], [])
    
    # Must NOT select the distant Chennai ambulance (140km / 240min)
    assert opt.selected_ambulance is None
    assert opt.ambulance_eta == 0.0
    assert opt.has_live_ambulance is False
    assert opt.no_ambulance_reason is not None
    assert "verify" in opt.no_ambulance_reason.lower() or "searching" in opt.no_ambulance_reason.lower()

@pytest.mark.asyncio
async def test_assigned_ambulance_with_fresh_gps_returns_live_telemetry_eta(db_session):
    """
    DATA HONESTY TEST:
    When an ambulance is assigned AND has fresh live GPS:
    - selected_ambulance is assigned ambulance.
    - freshness is LIVE.
    - eta is calculated from real coordinates.
    """
    emg = Emergency(
        id="emg-assigned-001",
        code="EMG-ASSN1",
        title="Cardiac Case",
        description="Chest pain patient",
        incident_type="CARDIAC_ARREST",
        latitude=13.0800,
        longitude=80.2700,
        severity="CRITICAL",
        status="ACCEPTED",
        assigned_ambulance_id="amb-live-assigned",
        assigned_driver_id="driver-001",
        is_demo=False
    )
    db_session.add(emg)
    
    hosp = Hospital(
        id="hosp-chn-01",
        name="Apollo Hospital",
        latitude=13.0600,
        longitude=80.2500,
        available_beds=20,
        emergency_available=True,
        trauma_capable=True,
        icu_available=True
    )
    db_session.add(hosp)
    db_session.commit()
    
    # Feed fresh live GPS telemetry for this assigned ambulance (2 km away)
    update_live_ambulance_telemetry(AmbulanceTelemetryRequest(
        id="amb-live-assigned",
        vehicle_number="TN-07-EMG-1001",
        capability="ICU",
        status="EN_ROUTE",
        latitude=13.0850,
        longitude=80.2750,
        speed=40.0,
        heading=180.0,
        accuracy=5.0,
        updated_at=time.time() * 1000.0
    ))
    
    opt = await run_golden_minute_optimization(emg, [], [hosp], [])
    
    assert opt.selected_ambulance is not None
    assert opt.selected_ambulance.ambulance_id == "amb-live-assigned"
    assert opt.selected_ambulance.freshness_status == "LIVE"
    assert opt.ambulance_eta > 0.0
    assert opt.ambulance_eta < 20.0  # Should be ~2-5 min, definitely not 240 min

@pytest.mark.asyncio
async def test_stale_telemetry_flagged_honestly():
    """
    DATA HONESTY TEST:
    GPS telemetry older than STALE_THRESHOLD_SECONDS (30s) must be evaluated as STALE.
    """
    now = time.time()
    fresh_ts = (now - 5.0) * 1000.0
    stale_ts = (now - 45.0) * 1000.0
    offline_ts = (now - 120.0) * 1000.0
    
    freshness_live, age_live = evaluate_telemetry_freshness(fresh_ts)
    freshness_stale, age_stale = evaluate_telemetry_freshness(stale_ts)
    freshness_offline, age_offline = evaluate_telemetry_freshness(offline_ts)
    
    assert freshness_live == "LIVE"
    assert freshness_stale == "STALE"
    assert freshness_offline == "OFFLINE"
