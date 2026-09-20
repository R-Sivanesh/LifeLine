import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import Emergency, Ambulance, Hospital, RoadIncident, Dispatch, RouteEvent
from app.services.ai_service import fallback_parse_emergency
from app.services.ambulance_service import rank_ambulances
from app.services.hospital_service import rank_hospitals
from app.services.risk_service import analyze_route_risk
from app.schemas import RouteOption, Coordinate, EmergencyCreate
from app.services.optimization_service import run_golden_minute_optimization, generate_decision_explanation
from app.services.rerouting_service import process_dynamic_reroute

client = TestClient(app)

# ==================== 1. AI & NLP EXTRACTION TESTS ====================

def test_ai_fallback_parser_exact_hero_prompt():
    """
    Verifies that the exact natural language prompt from the hackathon specification
    is correctly extracted into structured emergency metrics.
    """
    text = "There was a collision near the railway bridge. Three people are injured and one person is unconscious."
    res = fallback_parse_emergency(text)
    
    assert res.incident_type == "ROAD_ACCIDENT"
    assert res.patient_count == 3
    assert res.critical_patient_count == 1
    assert res.severity == "CRITICAL"
    assert "advanced_emergency_support" in res.special_requirements
    assert "trauma_care" in res.special_requirements


def test_ai_fallback_parser_various_conditions():
    # Cardiac arrest case
    cardiac_text = "Elderly patient collapsed, experiencing cardiac arrest and no pulse."
    cardiac_res = fallback_parse_emergency(cardiac_text)
    assert cardiac_res.incident_type == "CARDIAC_ARREST"
    assert cardiac_res.severity == "CRITICAL"
    assert "defibrillator" in cardiac_res.special_requirements

    # Minor accident case
    minor_text = "Minor bicycle slip, 1 person conscious with minor scratch on knee."
    minor_res = fallback_parse_emergency(minor_text)
    assert minor_res.severity == "LOW"


# ==================== 2. AMBULANCE MATCHING TESTS ====================

def test_ambulance_matching_prioritizes_capability_for_critical():
    """
    Verifies that for a critical trauma emergency, a slightly farther advanced
    ambulance is prioritized over a closer basic transport vehicle.
    """
    emg = Emergency(
        id="emg-test-01",
        latitude=13.038,
        longitude=80.230,
        patient_count=3,
        critical_patient_count=1,
        severity="CRITICAL",
        incident_type="ROAD_ACCIDENT"
    )
    
    # Ambulance A: closer, BASIC capability
    amb_a = Ambulance(
        id="amb-a",
        vehicle_number="A-101 (Basic Transport)",
        latitude=13.039,
        longitude=80.231,
        capability="BASIC",
        equipment=["oxygen"],
        status="AVAILABLE"
    )
    # Ambulance B: slightly farther, ADVANCED capability
    amb_b = Ambulance(
        id="amb-b",
        vehicle_number="A-102 (Advanced Life Support)",
        latitude=13.025,
        longitude=80.220,
        capability="ADVANCED",
        equipment=["ventilator", "defibrillator", "trauma_kit"],
        status="AVAILABLE"
    )
    
    ranked = rank_ambulances([amb_a, amb_b], emg)
    assert len(ranked) == 2
    assert ranked[0].ambulance_id == "amb-b"
    assert ranked[0].capability == "ADVANCED"
    assert ranked[0].match_score > ranked[1].match_score
    assert any("Selected because it is available and has the required emergency capability" in r for r in ranked[0].reasons)


# ==================== 3. HOSPITAL MATCHING TESTS ====================

def test_hospital_matching_prioritizes_trauma_for_critical_accident():
    """
    Verifies that for a critical trauma accident, a trauma capable hospital with ICU
    is prioritized over a closer clinic without trauma support.
    """
    emg = Emergency(
        id="emg-test-02",
        latitude=13.038,
        longitude=80.230,
        patient_count=3,
        critical_patient_count=1,
        severity="CRITICAL",
        incident_type="ROAD_ACCIDENT"
    )
    
    # Hospital A: closer, no trauma capability
    hosp_a = Hospital(
        id="hosp-a",
        name="Small Community Clinic",
        latitude=13.037,
        longitude=80.229,
        emergency_available=True,
        trauma_capable=False,
        icu_available=False,
        available_beds=5,
        status="OPEN"
    )
    # Hospital B: farther, trauma capable + ICU available
    hosp_b = Hospital(
        id="hosp-b",
        name="City Trauma Center & Multi-Speciality",
        latitude=13.020,
        longitude=80.210,
        emergency_available=True,
        trauma_capable=True,
        icu_available=True,
        available_beds=18,
        status="OPEN"
    )
    
    ranked = rank_hospitals([hosp_a, hosp_b], emg)
    assert len(ranked) == 2
    assert ranked[0].hospital_id == "hosp-b"
    assert ranked[0].trauma_capable is True
    assert ranked[0].icu_available is True
    assert ranked[0].match_score > ranked[1].match_score


# ==================== 4. ROUTE RISK & BLOCKAGE TESTS ====================

def test_route_risk_detection_and_blockage():
    route_a = RouteOption(
        id="route_a",
        name="Route A (Direct)",
        distance_km=4.5,
        duration_minutes=8.0,
        geometry=[[80.230, 13.038], [80.233, 13.035], [80.235, 13.033]]
    )
    
    # Critical Road blockage on Route A
    blockage = RoadIncident(
        id="inc-block-01",
        type="ROAD_BLOCK",
        latitude=13.035,
        longitude=80.233,
        severity="CRITICAL",
        radius_meters=300,
        active=True
    )
    
    assessed = analyze_route_risk(route_a, [blockage])
    assert assessed.risk_level == "BLOCKED"
    assert assessed.adjusted_eta_minutes > route_a.duration_minutes
    assert len(assessed.incidents) == 1


# ==================== 5. GOLDEN MINUTE OPTIMIZATION TESTS ====================

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
        vehicle_number="A-102 (ALS)",
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
    assert res.selected_hospital is not None
    assert res.selected_hospital.hospital_id in ("hosp-001", res.selected_hospital.hospital_id)
    assert res.total_estimated_time > 0
    assert "Optimal care corridor" in res.optimization_reason or "Estimated time" in res.optimization_reason

    explanation = generate_decision_explanation(emg, res.selected_ambulance, res.selected_hospital, res.selected_route)
    assert "was selected because it is available and has the required emergency capability" in explanation.ambulance_reason
    assert "Location verified via" in explanation.hospital_reason
    assert "UNKNOWN" in explanation.hospital_reason


# ==================== 6. DYNAMIC REROUTING TESTS ====================

@pytest.mark.asyncio
async def test_dynamic_reroute_flow():
    db = SessionLocal()
    try:
        # Create emergency and hospital
        emg = Emergency(
            id="emg-reroute-test",
            description="Test emergency for dynamic reroute",
            latitude=13.038,
            longitude=80.230,
            severity="CRITICAL",
            incident_type="ROAD_ACCIDENT"
        )
        hosp = Hospital(
            id="hosp-reroute-test",
            name="Test Trauma Hospital",
            latitude=13.020,
            longitude=80.210,
            emergency_available=True,
            trauma_capable=True,
            icu_available=True,
            available_beds=10,
            status="OPEN"
        )
        dispatch = Dispatch(
            id="disp-test",
            emergency_id="emg-reroute-test",
            ambulance_id="amb-102",
            hospital_id="hosp-reroute-test",
            estimated_ambulance_eta=6.0,
            estimated_hospital_eta=8.0,
            total_response_time=14.0
        )
        db.add(emg)
        db.add(hosp)
        db.add(dispatch)
        db.commit()

        # Inject blockage
        blockage = RoadIncident(
            id="inc-test-block",
            type="ROAD_BLOCK",
            latitude=13.030,
            longitude=80.220,
            severity="CRITICAL",
            radius_meters=350,
            active=True
        )
        db.add(blockage)
        db.commit()

        # Run dynamic reroute
        reroute_res = await process_dynamic_reroute(
            emergency_id="emg-reroute-test",
            db=db,
            active_incidents=[blockage]
        )

        assert reroute_res.rerouted is True
        assert "Previous route was blocked" in reroute_res.reason
        assert reroute_res.new_route is not None
        assert reroute_res.new_eta_minutes > 0

        # Verify route event logged in DB
        event = db.query(RouteEvent).filter(RouteEvent.emergency_id == "emg-reroute-test").first()
        assert event is not None
        assert event.event_type == "DYNAMIC_REROUTE"
    finally:
        # Clean up
        db.query(RouteEvent).filter(RouteEvent.emergency_id == "emg-reroute-test").delete()
        db.query(Dispatch).filter(Dispatch.emergency_id == "emg-reroute-test").delete()
        db.query(RoadIncident).filter(RoadIncident.id == "inc-test-block").delete()
        db.query(Emergency).filter(Emergency.id == "emg-reroute-test").delete()
        db.query(Hospital).filter(Hospital.id == "hosp-reroute-test").delete()
        db.commit()
        db.close()


# ==================== 7. FASTAPI API ENDPOINTS INTEGRATION ====================

def test_api_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "LifeLine" in data["service"]


def test_api_emergencies_crud_and_analysis():
    # 1. POST /api/emergencies
    payload = {
        "description": "There was a collision near the railway bridge. Three people are injured and one person is unconscious.",
        "latitude": 13.0380,
        "longitude": 80.2300
    }
    res = client.post("/api/emergencies", json=payload)
    assert res.status_code == 201
    emg_data = res.json()
    emg_id = emg_data["id"]
    assert emg_data["severity"] == "CRITICAL"
    assert emg_data["patient_count"] == 3
    assert emg_data["critical_patient_count"] == 1

    # 2. GET /api/emergencies
    list_res = client.get("/api/emergencies")
    assert list_res.status_code == 200
    assert len(list_res.json()) > 0

    # 3. GET /api/emergencies/{id}
    get_res = client.get(f"/api/emergencies/{emg_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == emg_id

    # 4. POST /api/emergencies/{id}/analyze
    ana_res = client.post(f"/api/emergencies/{emg_id}/analyze")
    assert ana_res.status_code == 200
    assert ana_res.json()["incident_type"] == "ROAD_ACCIDENT"

    # 5. GET /api/emergencies/{id}/ambulance-recommendations
    amb_res = client.get(f"/api/emergencies/{emg_id}/ambulance-recommendations")
    assert amb_res.status_code == 200
    assert len(amb_res.json()) > 0

    # 6. GET /api/emergencies/{id}/hospital-recommendations
    hosp_res = client.get(f"/api/emergencies/{emg_id}/hospital-recommendations")
    assert hosp_res.status_code == 200
    assert len(hosp_res.json()) > 0

    # 7. POST /api/emergencies/{id}/optimize
    opt_res = client.post(f"/api/emergencies/{emg_id}/optimize")
    assert opt_res.status_code == 200
    opt_data = opt_res.json()
    assert "selected_ambulance" in opt_data
    assert "selected_hospital" in opt_data
    assert "selected_route" in opt_data
    assert opt_data["total_estimated_time"] > 0

    # 8. GET /api/emergencies/{id}/decision
    dec_res = client.get(f"/api/emergencies/{emg_id}/decision")
    assert dec_res.status_code == 200
    dec_data = dec_res.json()
    assert "ambulance_reason" in dec_data
    assert "hospital_reason" in dec_data
    assert "overall_reason" in dec_data

    # 9. POST /api/emergencies/{id}/reroute
    reroute_res = client.post(f"/api/emergencies/{emg_id}/reroute")
    assert reroute_res.status_code == 200
    assert reroute_res.json()["rerouted"] is True


def test_api_routes_calculate():
    payload = {
        "origin": {"latitude": 13.0380, "longitude": 80.2300},
        "destination": {"latitude": 13.0352, "longitude": 80.2155}
    }
    res = client.post("/api/routes/calculate", json=payload)
    assert res.status_code == 200
    routes = res.json()["routes"]
    assert len(routes) >= 1
    assert "geometry" in routes[0]


def test_api_demo_endpoints():
    # 1. POST /api/demo/reset
    res_reset = client.post("/api/demo/reset")
    assert res_reset.status_code == 200
    assert res_reset.json()["status"] == "success"

    # 2. POST /api/demo/create-emergency
    res_emg = client.post("/api/demo/create-emergency")
    assert res_emg.status_code == 200
    assert res_emg.json()["id"] == "emg-hero-001"

    # 3. POST /api/demo/block-route
    res_block = client.post("/api/demo/block-route")
    assert res_block.status_code == 200
    assert res_block.json()["status"] == "blockage_created"

    # 4. GET /api/demo/incidents
    res_inc = client.get("/api/demo/incidents")
    assert res_inc.status_code == 200
    assert len(res_inc.json()) > 0


# ==================== 8. GEMINI DISPATCHER & DATA PROVENANCE TESTS ====================

def test_tanglish_dispatcher_intake():
    """
    Verifies that conversational Tanglish emergency input is correctly understood
    and translated into structured parameters.
    """
    res = client.post("/api/ai/chat", json={
        "message": "Anna accident aachu bridge pakkam. 3 per injured, oru aal unconscious. Road block aagiduchu.",
        "conversation_id": "test-tanglish-conv"
    })
    assert res.status_code == 200
    data = res.json()
    assert "reply" in data
    state = data["state"]
    assert state["incident_type"] == "ROAD_ACCIDENT"
    assert state["severity"] == "CRITICAL"
    assert state["patient_count"] == 3
    assert state["critical_patient_count"] >= 1
    assert state["road_passability"] == "BLOCKED"
    assert data["has_sufficient_information"] is True


def test_data_status_provenance_endpoint():
    """
    Verifies that the /api/data/status endpoint clearly separates
    live external data sources from demo telemetry and unverified data.
    """
    res = client.get("/api/data/status")
    assert res.status_code == 200
    data = res.json()
    assert "traffic" in data
    assert "hospitals" in data
    assert "ambulances" in data
    assert "hospital_capacity" in data
    assert data["ambulances"]["status"] == "SIMULATED"
    assert data["hospital_capacity"]["status"] == "UNKNOWN"

