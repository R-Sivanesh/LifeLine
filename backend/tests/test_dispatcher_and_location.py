import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.gemini_service import fallback_dispatcher_rule_engine, process_dispatcher_chat
from app.schemas import ChatMessage, EmergencyDispatcherState

client = TestClient(app)

def test_greeting_intent_returns_false_sufficiency():
    """Verify typing 'hi' or 'hello' NEVER claims sufficient info or creates fake incident."""
    res = fallback_dispatcher_rule_engine("hi", [])
    assert res["intent"] == "GREETING"
    assert res["conversation_state"] == "GREETING"
    assert res["has_sufficient_information"] is False
    assert res["structured_state"]["incident_type"] is None
    assert "emergency" in res["reply_text"].lower()

    res_hello = fallback_dispatcher_rule_engine("hello there", [])
    assert res_hello["intent"] == "GREETING"
    assert res_hello["has_sufficient_information"] is False
    assert res_hello["structured_state"]["incident_type"] is None

def test_general_question_intent():
    """Verify general questions do not trigger emergency intake."""
    res = fallback_dispatcher_rule_engine("what is LifeLine?", [])
    assert res["intent"] == "GENERAL_QUESTION"
    assert res["has_sufficient_information"] is False
    assert res["structured_state"]["incident_type"] is None

def test_emergency_without_location_is_not_sufficient():
    """Emergency report without a confirmed or mentioned location must ask for location."""
    res = fallback_dispatcher_rule_engine("major car crash with 2 injured", [])
    assert res["intent"] == "EMERGENCY_REPORT"
    assert res["structured_state"]["incident_type"] == "ROAD_ACCIDENT"
    assert res["has_sufficient_information"] is False
    assert "location" in res["missing_information"]

def test_emergency_with_location_is_sufficient():
    """Emergency report with both incident type and location is marked sufficient."""
    res = fallback_dispatcher_rule_engine("bike accident near Guindy Station, 1 unconscious", [])
    assert res["intent"] == "EMERGENCY_REPORT"
    assert res["structured_state"]["incident_type"] == "ROAD_ACCIDENT"
    assert res["has_sufficient_information"] is True
    assert res["structured_state"]["critical_patient_count"] == 1
    assert res["structured_state"]["severity"] == "CRITICAL"

def test_ai_intake_complex_message_no_redundant_question():
    """
    PRIORITY 1 TEST:
    User: 'Car crash at Pondy Beach, 2 people injured and one is bleeding.'
    AI must extract all structured facts and NOT ask 'What type of emergency is occurring?'.
    """
    msg = "Car crash at Pondy Beach, 2 people injured and one is bleeding."
    res = fallback_dispatcher_rule_engine(msg, [])
    
    st = res["structured_state"]
    assert st["incident_type"] == "ROAD_ACCIDENT"
    assert st["location_mentioned"] == "Pondy Beach"
    assert st["patient_count"] == 2
    assert st["injury_reported"] is True
    assert st["bleeding_reported"] is True
    assert st["severity"] in ("HIGH", "CRITICAL")
    assert res["has_sufficient_information"] is True
    assert "What type of emergency is occurring" not in res["reply_text"]

def test_ai_intake_missing_people_count_asks_single_question():
    """
    PRIORITY 1 & 4 TEST:
    User: 'There was an accident near the bridge.'
    AI extracts incident type and location, notices patient_count is missing,
    and asks ONLY 'How many people are injured or affected?' with chips.
    """
    msg = "There was an accident near the bridge."
    res = fallback_dispatcher_rule_engine(msg, [])
    
    st = res["structured_state"]
    assert st["incident_type"] == "ROAD_ACCIDENT"
    assert st["location_mentioned"] is not None
    assert "patient_count" in res["missing_information"]
    assert "What type of emergency is occurring" not in res["reply_text"]
    assert "How many people are injured" in res["reply_text"]
    assert res["suggested_quick_replies"] == ["1", "2", "3", "4+", "Not Sure"]

@pytest.mark.asyncio
async def test_chat_api_hi_flow():
    """Test full async process_dispatcher_chat for 'hi'."""
    resp = await process_dispatcher_chat(message="hi", conversation_id="test-conv-1")
    assert resp.has_sufficient_information is False
    assert resp.state.intent == "GREETING"
    assert resp.state.incident_type is None

def test_location_search_api():
    """Test location search endpoint with local landmark."""
    response = client.get("/api/location/search?query=Tambaram")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert "Tambaram" in data[0]["formatted_address"]
    assert data[0]["latitude"] > 0
    assert data[0]["longitude"] > 0

def test_location_reverse_api():
    """Test location reverse geocode endpoint."""
    response = client.get("/api/location/reverse?lat=12.9249&lng=80.1478")
    assert response.status_code == 200
    data = response.json()
    assert "Tambaram" in data["formatted_address"] or "Chennai" in data["formatted_address"]

def test_location_nearby_api():
    """Test dynamic nearby landmarks endpoint."""
    response = client.get("/api/location/nearby?lat=12.9516&lon=80.1462&limit=4")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "place_name" in data[0]
    assert data[0]["latitude"] > 0
