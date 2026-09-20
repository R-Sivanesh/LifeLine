from fastapi import APIRouter
from app.config import settings
from app.schemas import DataSourceStatusResponse, DataSourceItem

router = APIRouter(prefix="/data", tags=["Data Provenance & Status"])

@router.get("/status", response_model=DataSourceStatusResponse, summary="Audit data sources and real-time status")
async def get_data_sources_status():
    """
    Returns an audited breakdown of all data sources, clearly distinguishing
    live real-time external APIs from demo telemetry and unverified data.
    """
    has_google_routes = bool(settings.GOOGLE_ROUTES_API_KEY and settings.GOOGLE_ROUTES_API_KEY != "your_google_maps_api_key_here")
    has_google_places = bool(settings.GOOGLE_PLACES_API_KEY and settings.GOOGLE_PLACES_API_KEY != "your_google_maps_api_key_here")
    has_gemini = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip() and not settings.GEMINI_API_KEY.startswith("your_"))
    has_mapbox = bool(settings.MAPBOX_ACCESS_TOKEN and settings.MAPBOX_ACCESS_TOKEN.strip() and not settings.MAPBOX_ACCESS_TOKEN.startswith("your_"))
    has_google_maps = bool(settings.GOOGLE_MAPS_API_KEY and settings.GOOGLE_MAPS_API_KEY.strip() and not settings.GOOGLE_MAPS_API_KEY.startswith("your_"))
    
    map_provider_name = "Google Maps Platform" if has_google_maps else ("Mapbox GL" if has_mapbox else "Chennai Vector Grid")
    map_status = "CONFIGURED" if (has_google_maps or has_mapbox) else "MISSING"

    return DataSourceStatusResponse(
        map=DataSourceItem(
            name="Tactical Map Engine",
            source=map_provider_name,
            status=map_status,
            description="Official Google Maps JS or Mapbox with dark tactical styling." if (has_google_maps or has_mapbox) else "Tactical radar vector canvas (Local fallback grid)."
        ),
        traffic=DataSourceItem(
            name="Road Traffic & Driving Corridors",
            source="Google Routes API (Traffic Aware)" if has_google_routes else ("Mapbox Directions" if has_mapbox else "Synthesized Corridor Model"),
            status="LIVE" if has_google_routes else "SIMULATED",
            description="Live traffic-aware driving duration, distance, and multi-corridor geometry." if has_google_routes else "Offline synthesized traffic corridor calculations."
        ),
        hospitals=DataSourceItem(
            name="Hospital Facilities Discovery",
            source="Google Places API (New)" if has_google_places else "Verified Chennai Registry",
            status="LIVE" if has_google_places else "PUBLIC_DATA",
            description="Verified hospital locations, addresses, and facility types."
        ),
        ambulances=DataSourceItem(
            name="Ambulance Telemetry & Dispatch",
            source="Demo Telemetry Fleet",
            status="SIMULATED",
            description="Simulated emergency response vehicle GPS positions and ALS/ICU capabilities."
        ),
        hospital_capacity=DataSourceItem(
            name="ICU & ER Bed Capacity",
            source="Public API Unavailable (Simulated)",
            status="UNKNOWN",
            description="Live hospital occupancy and bed availability are not published by public municipal APIs."
        ),
        road_incidents=DataSourceItem(
            name="Active Road Hazards & Blockages",
            source="Simulated Incident Network & Spatial Intersection",
            status="SIMULATED",
            description="Simulated road accidents, waterlogging, and flash corridor blockages."
        ),
        ai_dispatcher=DataSourceItem(
            name="Conversational AI Dispatcher",
            source=f"Google Gemini ({settings.GEMINI_MODEL})" if has_gemini else "Deterministic Rule Engine (Offline Fallback)",
            status="LIVE" if has_gemini else "SIMULATED",
            description="Conversational intake and minimum-question extraction." if has_gemini else "Local regex rule engine for offline triage."
        ),
        database=DataSourceItem(
            name="Emergency State Database",
            source="Local SQLite / PostgreSQL",
            status="CONFIGURED",
            description="ACID persistence for active emergencies, dispatches, and audit trail."
        )
    )
