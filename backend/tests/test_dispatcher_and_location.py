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

@pytest.mark.asyncio
async def test_chat_api_hi_flow():
    """Test full async process_dispatcher_chat for 'hi'."""
    resp = await process_dispatcher_chat(message="hi", conversation_id="test-conv-1")
    assert resp.has_sufficient_information is False
    assert resp.state.intent == "GREETING"
    assert resp.state.incident_type is None

def test_location_search_api():
    """Test location search endpoint with local Chennai landmark."""
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
