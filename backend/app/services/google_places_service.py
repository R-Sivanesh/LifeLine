import logging
from typing import List, Dict, Any, Optional, Tuple
import httpx
from app.config import settings
from app.models import Hospital
from app.services.ambulance_service import calculate_haversine_distance

logger = logging.getLogger(__name__)

_PLACES_CACHE: Dict[str, Any] = {}

async def discover_nearby_hospitals_places(
    latitude: float,
    longitude: float,
    radius_meters: int = 8000
) -> Tuple[List[Dict[str, Any]], str, str]:
    """
    Searches for real hospitals using Google Places API (New).
    Classifies public verified data vs unverified clinical fields.
    Returns (hospitals_list, data_source, status).
    """
    cache_key = f"{round(latitude, 3)}_{round(longitude, 3)}"
    if cache_key in _PLACES_CACHE:
        return _PLACES_CACHE[cache_key], "Google Places API (Cached)", "LIVE"

    key = settings.GOOGLE_PLACES_API_KEY.strip() or settings.GOOGLE_MAPS_API_KEY.strip()
    
    if key and key != "your_google_maps_api_key_here":
        url = "https://places.googleapis.com/v1/places:searchNearby"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.businessStatus"
        }
        payload = {
            "includedTypes": ["hospital"],
            "maxResultCount": 6,
            "locationRestriction": {
                "circle": {
                    "center": {
                        "latitude": latitude,
                        "longitude": longitude
                    },
                    "radius": float(radius_meters)
                }
            }
        }

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    places = data.get("places", [])
                    if places:
                        discovered: List[Dict[str, Any]] = []
                        for p in places:
                            loc = p.get("location", {})
                            h_lat = loc.get("latitude", latitude)
                            h_lon = loc.get("longitude", longitude)
                            dist = calculate_haversine_distance(latitude, longitude, h_lat, h_lon)
                            
                            name = p.get("displayName", {}).get("text", "Hospital Facility")
                            address = p.get("formattedAddress", "Chennai Metro Area")
                            phone = p.get("nationalPhoneNumber", "")
                            
                            # Real public data verified via Google Places
                            discovered.append({
                                "id": f"place-{p.get('id', 'hosp')[:12]}",
                                "name": name,
                                "latitude": h_lat,
                                "longitude": h_lon,
                                "address": address,
                                "phone": phone,
                                "distance_km": dist,
                                "source": "Google Places API (New)",
                                "verification_status": "PUBLICLY_VERIFIED",
                                # Explicitly declare unverified/simulated clinical fields
                                "trauma_capable": "Trauma" in name or "General" in name,
                                "icu_status": "UNKNOWN (Not provided by public API)",
                                "available_beds_status": "UNKNOWN (Not provided by public API)",
                                "simulated_open_beds": 12
                            })
                            
                        _PLACES_CACHE[cache_key] = discovered
                        return discovered, "Google Places API (New)", "LIVE"
                else:
                    logger.warning(f"Google Places API returned {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.warning(f"Google Places API error ({str(e)}). Using seeded database hospitals.")

    # Fallback to demo hospital dataset
    fallback_hospitals = [
        {
            "id": "hosp-001",
            "name": "City Trauma Center & Multi-Speciality",
            "latitude": 13.0352,
            "longitude": 80.2155,
            "address": "Anna Salai, Saidapet, Chennai",
            "phone": "+91 44 2435 0000",
            "distance_km": calculate_haversine_distance(latitude, longitude, 13.0352, 80.2155),
            "source": "Simulated Hospital Registry (Demo)",
            "verification_status": "DEMO_DATA",
            "trauma_capable": True,
            "icu_status": "Simulated Available",
            "available_beds_status": "Simulated (18 Beds Open)",
            "simulated_open_beds": 18
        },
        {
            "id": "hosp-002",
            "name": "Apollo Greams Medical Center",
            "latitude": 13.0588,
            "longitude": 80.2520,
            "address": "Greams Road, Thousand Lights, Chennai",
            "phone": "+91 44 2829 0200",
            "distance_km": calculate_haversine_distance(latitude, longitude, 13.0588, 80.2520),
            "source": "Simulated Hospital Registry (Demo)",
            "verification_status": "DEMO_DATA",
            "trauma_capable": True,
            "icu_status": "Simulated Available",
            "available_beds_status": "Simulated (24 Beds Open)",
            "simulated_open_beds": 24
        },
        {
            "id": "hosp-003",
            "name": "Rajiv Gandhi Govt General Hospital",
            "latitude": 13.0805,
            "longitude": 80.2785,
            "address": "EVR Periyar Salai, Park Town, Chennai",
            "phone": "+91 44 2530 5000",
            "distance_km": calculate_haversine_distance(latitude, longitude, 13.0805, 80.2785),
            "source": "Simulated Hospital Registry (Demo)",
            "verification_status": "DEMO_DATA",
            "trauma_capable": True,
            "icu_status": "Simulated Available",
            "available_beds_status": "Simulated (42 Beds Open)",
            "simulated_open_beds": 42
        }
    ]
    return fallback_hospitals, "Simulated Hospital Registry (Offline Fallback)", "SIMULATED"
