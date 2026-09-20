import logging
from typing import List, Dict, Any, Optional
import httpx
from app.config import settings
from app.schemas import LocationSearchResult, LocationReverseResult

logger = logging.getLogger(__name__)

# In-memory cache for fast search responses
_GEOCODE_CACHE: Dict[str, List[LocationSearchResult]] = {}

async def search_locations(query: str, limit: int = 5) -> List[LocationSearchResult]:
    """
    Performs real-world location & landmark geocoding.
    Queries Google Places / Geocoding if configured, or OpenStreetMap Nominatim API.
    """
    clean_query = query.strip()
    if not clean_query:
        return []

    cache_key = clean_query.lower()
    if cache_key in _GEOCODE_CACHE:
        return _GEOCODE_CACHE[cache_key]

    results: List[LocationSearchResult] = []

    # 1. Try Google Places / Geocoding API if configured
    google_key = settings.GOOGLE_PLACES_API_KEY.strip() or settings.GOOGLE_MAPS_API_KEY.strip()
    if google_key and not google_key.startswith("your_"):
        try:
            url = "https://places.googleapis.com/v1/places:searchText"
            headers = {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": google_key,
                "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location"
            }
            payload = {
                "textQuery": clean_query,
                "maxResultCount": limit
            }
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    for p in data.get("places", []):
                        name = p.get("displayName", {}).get("text", "")
                        addr = p.get("formattedAddress", name)
                        loc = p.get("location", {})
                        if "latitude" in loc and "longitude" in loc:
                            results.append(
                                LocationSearchResult(
                                    formatted_address=addr,
                                    place_name=name,
                                    latitude=float(loc["latitude"]),
                                    longitude=float(loc["longitude"]),
                                    source="GOOGLE_PLACES"
                                )
                            )
                    if results:
                        _GEOCODE_CACHE[cache_key] = results
                        return results
        except Exception as e:
            logger.warning(f"Google Places text search failed ({str(e)}). Engaging OpenStreetMap Nominatim fallback.")

    # 2. Public OpenStreetMap Nominatim Geocoding (with polite user-agent)
    try:
        nom_url = "https://nominatim.openstreetmap.org/search"
        headers = {
            "User-Agent": "LifeLine-Emergency-Intelligence/2.0 (emergency-dispatch-research)"
        }
        params = {
            "q": clean_query,
            "format": "json",
            "addressdetails": "1",
            "limit": limit
        }
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(nom_url, params=params, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                for item in data:
                    display_name = item.get("display_name", "")
                    lat = float(item.get("lat", 0.0))
                    lon = float(item.get("lon", 0.0))
                    place_name = item.get("name") or display_name.split(",")[0]
                    if lat != 0.0 and lon != 0.0:
                        results.append(
                            LocationSearchResult(
                                formatted_address=display_name,
                                place_name=place_name,
                                latitude=lat,
                                longitude=lon,
                                source="OSM_NOMINATIM"
                            )
                        )
                if results:
                    _GEOCODE_CACHE[cache_key] = results
                    return results
    except Exception as e:
        logger.warning(f"Nominatim geocoding failed ({str(e)}). Using local landmark resolver.")

    # 3. Local landmark fallback for standard testing locations
    local_landmarks = [
        {"q": "tambaram", "name": "Tambaram Railway Station", "addr": "Tambaram Railway Station, GST Road, Chennai, Tamil Nadu", "lat": 12.9249, "lon": 80.1472},
        {"q": "chromepet", "name": "Chromepet Bus Stand", "addr": "Chromepet Bus Stand, Grand Southern Trunk Rd, Chennai, Tamil Nadu", "lat": 12.9516, "lon": 80.1462},
        {"q": "guindy", "name": "Guindy Industrial Estate", "addr": "Guindy Industrial Estate, Guindy, Chennai, Tamil Nadu", "lat": 13.0090, "lon": 80.2080},
        {"q": "t nagar", "name": "T. Nagar Ranganathan Street", "addr": "Ranganathan Street, T. Nagar, Chennai, Tamil Nadu", "lat": 13.0415, "lon": 80.2335},
        {"q": "central", "name": "Chennai Central Railway Station", "addr": "Puratchi Thalaivar Dr. M.G. Ramachandran Central, Park Town, Chennai", "lat": 13.0827, "lon": 80.2707},
        {"q": "railway bridge", "name": "Saidapet Railway Bridge", "addr": "Anna Salai Railway Overbridge, Saidapet, Chennai", "lat": 13.0210, "lon": 80.2230}
    ]

    for lm in local_landmarks:
        if lm["q"] in cache_key or cache_key in lm["q"]:
            results.append(
                LocationSearchResult(
                    formatted_address=lm["addr"],
                    place_name=lm["name"],
                    latitude=lm["lat"],
                    longitude=lm["lon"],
                    source="LOCAL_REGISTRY"
                )
            )

    _GEOCODE_CACHE[cache_key] = results
    return results


async def reverse_geocode(latitude: float, longitude: float) -> LocationReverseResult:
    """
    Converts GPS / Pin coordinates into a human-readable address.
    """
    try:
        nom_url = "https://nominatim.openstreetmap.org/reverse"
        headers = {
            "User-Agent": "LifeLine-Emergency-Intelligence/2.0 (emergency-dispatch-research)"
        }
        params = {
            "lat": latitude,
            "lon": longitude,
            "format": "json"
        }
        async with httpx.AsyncClient(timeout=3.5) as client:
            resp = await client.get(nom_url, params=params, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                display_name = data.get("display_name", f"Coordinates: {latitude:.4f}, {longitude:.4f}")
                name = data.get("name") or display_name.split(",")[0]
                return LocationReverseResult(
                    formatted_address=display_name,
                    place_name=name,
                    latitude=latitude,
                    longitude=longitude,
                    source="OSM_REVERSE"
                )
    except Exception as e:
        logger.warning(f"Reverse geocode lookup failed ({str(e)})")

    return LocationReverseResult(
        formatted_address=f"Location at {latitude:.4f}, {longitude:.4f}",
        place_name=f"Lat: {latitude:.4f}, Lon: {longitude:.4f}",
        latitude=latitude,
        longitude=longitude,
        source="COORDINATE_FALLBACK"
    )
