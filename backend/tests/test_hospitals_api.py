import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
import httpx
from app.main import app
from app.services.google_places_service import _PLACES_CACHE

client = TestClient(app)

@pytest.fixture(autouse=True)
def clear_places_cache():
    """Clear in-memory Places cache before each test."""
    _PLACES_CACHE.clear()
    yield
    _PLACES_CACHE.clear()

def test_missing_user_location_returns_400():
    """Testing case 7: No user location provided raises 400."""
    response = client.get("/api/hospitals/nearby")
    assert response.status_code == 400
    assert "Location required before searching nearby hospitals" in response.json()["detail"]

def test_zero_coordinates_returns_400():
    """Testing case 6: 0,0 invalid coordinates returns 400."""
    response = client.get("/api/hospitals/nearby?lat=0.0&lng=0.0")
    assert response.status_code == 400
    assert "Location required before searching nearby hospitals" in response.json()["detail"]

def test_valid_coordinates_live_places_mock_success():
    """Testing case 1, 2, 8: Valid coordinates & Google Places success returns normalized structure."""
    fake_google_places_response = {
        "places": [
            {
                "id": "ChIJ12345ExampleId",
                "displayName": {"text": "Apollo Speciality Hospital"},
                "location": {"latitude": 12.9250, "longitude": 80.1300},
                "formattedAddress": "GST Road, Chennai, Tamil Nadu",
                "nationalPhoneNumber": "+91 44 2200 0000",
                "businessStatus": "OPERATIONAL",
                "rating": 4.6,
                "types": ["hospital", "health", "point_of_interest"]
            }
        ]
    }

    mock_resp = httpx.Response(200, json=fake_google_places_response)

    with patch("httpx.AsyncClient.post", return_value=mock_resp):
        response = client.get("/api/hospitals/nearby?lat=12.9249&lng=80.1275&radius=5000")
        assert response.status_code == 200
        data = response.json()

        # Normalized structure checks
        assert data["source"] == "GOOGLE_PLACES"
        assert data["status"] == "LIVE"
        assert len(data["hospitals"]) == 1

        hosp = data["hospitals"][0]
        assert hosp["id"] == "places/ChIJ12345ExampleId"
        assert hosp["place_id"] == "ChIJ12345ExampleId"
        assert hosp["name"] == "Apollo Speciality Hospital"
        assert hosp["latitude"] == 12.9250
        assert hosp["longitude"] == 80.1300
        assert hosp["address"] == "GST Road, Chennai, Tamil Nadu"
        assert hosp["business_status"] == "OPERATIONAL"
        assert hosp["source"] == "GOOGLE_PLACES"
        assert hosp["status"] == "LIVE"

        # Data Honesty checks: capacity must be UNKNOWN, not fabricated
        assert hosp["capacity_status"] == "UNKNOWN"
        assert hosp["trauma_capable"] is None
        assert hosp["icu_available"] is None
        assert hosp["available_beds"] is None

def test_empty_hospital_result():
    """Testing case 3: Google Places returns zero hospitals nearby."""
    mock_resp = httpx.Response(200, json={"places": []})

    with patch("httpx.AsyncClient.post", return_value=mock_resp):
        response = client.get("/api/hospitals/nearby?lat=12.0000&lng=80.0000&radius=1000")
        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "GOOGLE_PLACES"
        assert data["status"] == "LIVE"
        assert len(data["hospitals"]) == 0

def test_google_places_api_failure():
    """Testing case 5: Google API returns error (e.g. 500 or 403)."""
    mock_resp = httpx.Response(403, text="Forbidden")

    with patch("httpx.AsyncClient.post", return_value=mock_resp):
        response = client.get("/api/hospitals/nearby?lat=12.9249&lng=80.1275")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "DEGRADED"
        assert len(data["hospitals"]) == 0
        assert "failed" in data["error"].lower()

def test_missing_api_key_handling_live_mode():
    """Testing case 4: Missing Google Places API key in live mode."""
    with patch("app.services.google_places_service.settings.GOOGLE_PLACES_API_KEY", ""), \
         patch("app.services.google_places_service.settings.GOOGLE_MAPS_API_KEY", ""), \
         patch("app.config.settings.DEMO_MODE", False):
        response = client.get("/api/hospitals/nearby?lat=12.9249&lng=80.1275")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "MISSING"
        assert data["source"] == "UNAVAILABLE"
        assert len(data["hospitals"]) == 0
        assert "unavailable" in data["error"].lower()
