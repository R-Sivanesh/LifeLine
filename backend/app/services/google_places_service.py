import logging
from typing import List, Dict, Any, Optional, Tuple
import httpx
from app.config import settings
from app.services.ambulance_service import calculate_haversine_distance

logger = logging.getLogger(__name__)

_PLACES_CACHE: Dict[str, Tuple[List[Dict[str, Any]], str, str]] = {}

async def discover_nearby_hospitals_places(
    latitude: float,
    longitude: float,
    radius_meters: float = 8000.0,
    is_demo_mode: bool = False
) -> Tuple[List[Dict[str, Any]], str, str, Optional[str]]:
    """
    Searches for real hospitals using Google Places API (New) Nearby Search.
    
    Data Honesty Rules:
    - Location is LIVE from Google Places API (New).
    - Clinical capacity (ICU, Trauma, Beds) is UNKNOWN (Not published by public municipal APIs).
    - No fake hospitals are injected into LIVE results.
    
    Returns: (hospitals_list, data_source, status_level, error_message)
    """
    if latitude is None or longitude is None or (latitude == 0.0 and longitude == 0.0):
        return [], "UNAVAILABLE", "MISSING", "Location required before searching nearby hospitals."

    cache_key = f"{round(latitude, 3)}_{round(longitude, 3)}_{int(radius_meters)}"
    if cache_key in _PLACES_CACHE:
        cached_list, cached_source, cached_status = _PLACES_CACHE[cache_key]
        return cached_list, cached_source, cached_status, None

    key = settings.GOOGLE_PLACES_API_KEY.strip() or settings.GOOGLE_MAPS_API_KEY.strip()
    
    if key and key != "your_google_maps_api_key_here" and not key.startswith("your_"):
        url = "https://places.googleapis.com/v1/places:searchNearby"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.formattedAddress,places.businessStatus,places.types,places.rating,places.userRatingCount,places.nationalPhoneNumber"
        }
        payload = {
            "includedTypes": ["hospital"],
            "maxResultCount": 10,
            "locationRestriction": {
                "circle": {
                    "center": {
                        "latitude": latitude,
                        "longitude": longitude
                    },
                    "radius": min(max(float(radius_meters), 1000.0), 50000.0)
                }
            }
        }

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    places = data.get("places", [])
                    discovered: List[Dict[str, Any]] = []
                    
                    for p in places:
                        loc = p.get("location", {})
                        h_lat = loc.get("latitude")
                        h_lon = loc.get("longitude")
                        if h_lat is None or h_lon is None:
                            continue
                            
                        dist = calculate_haversine_distance(latitude, longitude, h_lat, h_lon)
                        p_id = p.get("id", "")
                        name = p.get("displayName", {}).get("text", "Hospital Facility")
                        address = p.get("formattedAddress", "")
                        phone = p.get("nationalPhoneNumber", "")
                        b_status = p.get("businessStatus", "OPERATIONAL")
                        rating = p.get("rating")
                        
                        discovered.append({
                            "id": f"places/{p_id}" if not p_id.startswith("places/") else p_id,
                            "place_id": p_id,
                            "name": name,
                            "latitude": h_lat,
                            "longitude": h_lon,
                            "address": address,
                            "phone": phone,
                            "business_status": b_status,
                            "rating": rating,
                            "distance_km": round(dist, 2),
                            "distance_meters": round(dist * 1000, 0),
                            "source": "GOOGLE_PLACES",
                            "status": "LIVE",
                            # Data Honesty: Clinical parameters are unknown in public search
                            "capacity_status": "UNKNOWN",
                            "trauma_capable": None,
                            "icu_available": None,
                            "available_beds": None
                        })
                    
                    # Sort by distance
                    discovered.sort(key=lambda h: h["distance_km"])
                    
                    _PLACES_CACHE[cache_key] = (discovered, "GOOGLE_PLACES", "LIVE")
                    return discovered, "GOOGLE_PLACES", "LIVE", None
                else:
                    logger.warning(f"Google Places API (New) returned HTTP {resp.status_code}: {resp.text[:150]}")
                    return [], "GOOGLE_PLACES", "DEGRADED", f"Google Places API request failed with status {resp.status_code}"
        except Exception as e:
            logger.warning(f"Google Places API connection failed ({str(e)}).")
            return [], "GOOGLE_PLACES", "DEGRADED", f"Google Places connection error: {str(e)}"

    # If demo mode is explicitly active and key is missing, return demo labeled fallback
    if is_demo_mode:
        demo_hospitals = [
            {
                "id": "demo-hosp-001",
                "place_id": "demo-001",
                "name": "Chromepet Multi-Speciality Hospital (Demo)",
                "latitude": 12.9550,
                "longitude": 80.1386,
                "address": "Chromepet, Chennai, Tamil Nadu",
                "phone": "+91 44 2241 0000",
                "business_status": "OPERATIONAL",
                "rating": 4.5,
                "distance_km": round(calculate_haversine_distance(latitude, longitude, 12.9550, 80.1386), 2),
                "distance_meters": round(calculate_haversine_distance(latitude, longitude, 12.9550, 80.1386) * 1000, 0),
                "source": "DEMO_TELEMETRY",
                "status": "DEMO",
                "capacity_status": "DEMO_SIMULATED",
                "trauma_capable": True,
                "icu_available": True,
                "available_beds": 12
            },
            {
                "id": "demo-hosp-002",
                "place_id": "demo-002",
                "name": "Tambaram General Care Center (Demo)",
                "latitude": 12.9236,
                "longitude": 80.1141,
                "address": "GST Road, Tambaram, Chennai",
                "phone": "+91 44 2226 0000",
                "business_status": "OPERATIONAL",
                "rating": 4.2,
                "distance_km": round(calculate_haversine_distance(latitude, longitude, 12.9236, 80.1141), 2),
                "distance_meters": round(calculate_haversine_distance(latitude, longitude, 12.9236, 80.1141) * 1000, 0),
                "source": "DEMO_TELEMETRY",
                "status": "DEMO",
                "capacity_status": "DEMO_SIMULATED",
                "trauma_capable": False,
                "icu_available": True,
                "available_beds": 6
            }
        ]
        return demo_hospitals, "DEMO_TELEMETRY", "DEMO", None

    return [], "UNAVAILABLE", "MISSING", "Live hospital locations unavailable (Google Places API key not configured)."
