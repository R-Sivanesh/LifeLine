from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from app.schemas import LocationSearchResult, LocationReverseResult
from app.services.geocoding_service import search_locations, reverse_geocode

router = APIRouter(prefix="/location", tags=["Location & Geocoding"])

@router.get("/search", response_model=List[LocationSearchResult], summary="Search real-world landmarks and addresses")
async def search_places(query: str = Query(..., min_length=2, description="Place, landmark, address, or station")):
    """
    Real-world geocoding search for emergency locations.
    Uses Google Places / Geocoding if configured, or OpenStreetMap Nominatim.
    """
    return await search_locations(query)

@router.get("/reverse", response_model=LocationReverseResult, summary="Reverse geocode coordinates into a human-readable address")
async def reverse_coords(
    lat: float = Query(..., description="Latitude"),
    lon: Optional[float] = Query(None, description="Longitude"),
    lng: Optional[float] = Query(None, description="Longitude alias")
):
    """
    Reverse geocoding for GPS or map pin drops.
    """
    target_lng = lon if lon is not None else lng
    if target_lng is None:
        raise HTTPException(status_code=422, detail="Either 'lon' or 'lng' parameter is required")
    return await reverse_geocode(lat, target_lng)
