import pytest
import asyncio
from app.models import Emergency, Ambulance, Hospital, RoadIncident
from app.services.ai_service import fallback_parse_emergency
from app.services.ambulance_service import rank_ambulances
from app.services.hospital_service import rank_hospitals
from app.services.risk_service import analyze_route_risk
from app.schemas import RouteOption, Coordinate
from app.services.optimization_service import run_golden_minute_optimization

def test_ai_fallback_parser():
    text = "Three people injured in a road accident near the railway bridge. One person is unconscious."
    res = fallback_parse_emergency(text)
    
    assert res.incident_type == "ROAD_ACCIDENT"
    assert res.patient_count == 3
    assert res.critical_patient_count == 1
    assert res.severity == "CRITICAL"
    assert "advanced_emergency_support" in res.special_requirements

def test_ambulance_matching_prioritizes_capability_for_critical():
    emg = Emergency(
        id="emg-test-01",
        latitude=13.038,
        longitude=80.230,
        patient_count=3,
        critical_patient_count=1,
        severity="CRITICAL",
        incident_type="ROAD_ACCIDENT"
    )
    
    # A-101: Basic, closer (1.0 km)
    amb1 = Ambulance(
        id="amb-1",
        vehicle_number="A-101 (Basic)",
        latitude=13.039,
        longitude=80.231,
        capability="BASIC",
        equipment=["oxygen"],
        status="AVAILABLE"
    )
    # A-102: Advanced, slightly further (2.5 km)
    amb2 = Ambulance(
        id="amb-2",
        vehicle_number="A-102 (Advanced)",
        latitude=13.025,
        longitude=80.220,
        capability="ADVANCED",
        equipment=["ventilator", "defibrillator", "trauma_kit"],
        status="AVAILABLE"
    )
    
    ranked = rank_ambulances([amb1, amb2], emg)
    assert len(ranked) == 2
    # Advanced ambulance should rank above Basic ambulance for critical emergency
    assert ranked[0].ambulance_id == "amb-2"
    assert ranked[0].capability == "ADVANCED"
    assert ranked[0].match_score > ranked[1].match_score

def test_hospital_matching_prioritizes_trauma_for_critical_accident():
    emg = Emergency(
        id="emg-test-02",
        latitude=13.038,
        longitude=80.230,
        patient_count=3,
        critical_patient_count=1,
        severity="CRITICAL",
        incident_type="ROAD_ACCIDENT"
    )
    
    # Clinic: Closer, no trauma
    hosp_clinic = Hospital(
        id="hosp-clinic",
        name="Small General Clinic",
        latitude=13.037,
        longitude=80.229,
        emergency_available=True,
        trauma_capable=False,
        icu_available=False,
        available_beds=5,
        status="OPEN"
    )
    # Trauma Center: Farther, trauma capable + ICU
    hosp_trauma = Hospital(
        id="hosp-trauma",
        name="City Trauma Center",
        latitude=13.020,
        longitude=80.210,
        emergency_available=True,
        trauma_capable=True,
        icu_available=True,
        available_beds=20,
        status="OPEN"
    )
    
    ranked = rank_hospitals([hosp_clinic, hosp_trauma], emg)
    assert len(ranked) == 2
    assert ranked[0].hospital_id == "hosp-trauma"
    assert ranked[0].trauma_capable is True
    assert ranked[0].match_score > ranked[1].match_score

def test_route_risk_detection():
    # Route passing near (13.040, 80.235)
    route = RouteOption(
        id="route_1",
        name="Route A",
        distance_km=5.0,
        duration_minutes=10.0,
        geometry=[[80.230, 13.038], [80.235, 13.040], [80.240, 13.045]]
    )
    
    incident = RoadIncident(
        id="inc-test",
        type="ACCIDENT",
        latitude=13.040,
        longitude=80.235,
        severity="HIGH",
        radius_meters=300,
        active=True
    )
    
    assessed = analyze_route_risk(route, [incident])
    assert assessed.risk_level in ("HIGH", "MEDIUM")
    assert len(assessed.incidents) > 0
    assert assessed.adjusted_eta_minutes > route.duration_minutes

@pytest.mark.asyncio
async def test_golden_minute_optimization_flow():
    emg = Emergency(
        id="emg-hero-001",
        latitude=13.038,
        longitude=80.230,
        patient_count=3,
        critical_patient_count=1,
        severity="CRITICAL",
        incident_type="ROAD_ACCIDENT"
    )
    
    amb = Ambulance(
        id="amb-102",
        vehicle_number="A-102",
        latitude=13.030,
        longitude=80.225,
        capability="ADVANCED",
        equipment=["ventilator", "defibrillator"],
        status="AVAILABLE"
    )
    
    hosp = Hospital(
        id="hosp-001",
        name="City Trauma Center",
        latitude=13.035,
        longitude=80.215,
        emergency_available=True,
        trauma_capable=True,
        icu_available=True,
        available_beds=18,
        status="OPEN"
    )
    
    res = await run_golden_minute_optimization(emg, [amb], [hosp], [])
    assert res.selected_ambulance.ambulance_id == "amb-102"
    assert res.selected_hospital.hospital_id == "hosp-001"
    assert res.total_estimated_time > 0
    assert "Optimized path" in res.optimization_reason
