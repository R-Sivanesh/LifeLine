import httpx
import logging
import math
from typing import List, Dict, Any, Tuple
from app.config import settings
from app.schemas import RouteOption, RouteStep, Coordinate
from app.services.ambulance_service import calculate_haversine_distance

logger = logging.getLogger(__name__)

def generate_interpolated_fallback_routes(origin: Coordinate, destination: Coordinate) -> List[RouteOption]:
    """
    Generates 3 realistic, differentiated simulated routes when Mapbox API is offline or token is invalid.
    Produces smooth GeoJSON LineString coordinates.
    """
    base_dist = calculate_haversine_distance(origin.latitude, origin.longitude, destination.latitude, destination.longitude)
    base_mins = (base_dist / 35.0) * 60.0  # ~35 km/h
    
    num_points = 12
    
    routes: List[RouteOption] = []
    
    # Offsets in lat/lon to create 3 distinct visual geometries
    variations = [
        {"id": "route_a", "name": "Route A (Direct Arterial / Anna Salai)", "dist_mult": 1.0, "time_mult": 1.0, "lat_dev": 0.002, "lon_dev": 0.001},
        {"id": "route_b", "name": "Route B (Express Bypass / Inner Ring)", "dist_mult": 1.15, "time_mult": 1.18, "lat_dev": -0.005, "lon_dev": 0.006},
        {"id": "route_c", "name": "Route C (Flyover Corridor / OMR Link)", "dist_mult": 1.30, "time_mult": 1.35, "lat_dev": 0.008, "lon_dev": -0.007},
    ]
    
    for v in variations:
        coords: List[List[float]] = []
        for i in range(num_points + 1):
            t = i / float(num_points)
            # Quadratic curve offset
            curve_factor = 4.0 * t * (1.0 - t)
            lat = origin.latitude + t * (destination.latitude - origin.latitude) + curve_factor * v["lat_dev"]
            lon = origin.longitude + t * (destination.longitude - origin.longitude) + curve_factor * v["lon_dev"]
            coords.append([round(lon, 6), round(lat, 6)])  # [lon, lat] for GeoJSON
            
        r_dist = round(base_dist * v["dist_mult"], 2)
        r_time = round(max(3.0, base_mins * v["time_mult"]), 1)
        
        routes.append(
            RouteOption(
                id=v["id"],
                name=v["name"],
                distance_km=r_dist,
                duration_minutes=r_time,
                geometry=coords,
                risk_level="LOW",
                incidents=[],
                adjusted_eta_minutes=r_time,
                steps=[
                    RouteStep(instruction=f"Depart on {v['name']}", distance_meters=round(r_dist * 500, 0), duration_seconds=round(r_time * 30, 0)),
                    RouteStep(instruction="Proceed through emergency corridor", distance_meters=round(r_dist * 500, 0), duration_seconds=round(r_time * 30, 0))
                ]
            )
        )
        
    return routes

async def fetch_mapbox_routes(origin: Coordinate, destination: Coordinate) -> List[RouteOption]:
    """
    Fetches actual driving routes and geometries from Mapbox Directions API.
    Gracefully falls back to realistic synthesized routes on error.
    """
    token = settings.MAPBOX_ACCESS_TOKEN.strip()
    if not token or token == "your_mapbox_token_here":
        logger.info("Mapbox token missing; utilizing simulated route generator.")
        return generate_interpolated_fallback_routes(origin, destination)
    
    url = f"https://api.mapbox.com/directions/v5/mapbox/driving-traffic/{origin.longitude},{origin.latitude};{destination.longitude},{destination.latitude}"
    params = {
        "alternatives": "true",
        "geometries": "geojson",
        "steps": "true",
        "overview": "full",
        "access_token": token
    }
    
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                # Try standard driving profile if driving-traffic fails
                url_driving = f"https://api.mapbox.com/directions/v5/mapbox/driving/{origin.longitude},{origin.latitude};{destination.longitude},{destination.latitude}"
                resp = await client.get(url_driving, params=params)
                
            if resp.status_code == 200:
                data = resp.json()
                routes_data = data.get("routes", [])
                if routes_data:
                    parsed_routes: List[RouteOption] = []
                    names = ["Route A (Primary)", "Route B (Alternative)", "Route C (Secondary)"]
                    
                    for idx, r in enumerate(routes_data[:3]):
                        coords = r.get("geometry", {}).get("coordinates", [])
                        dist_km = round(r.get("distance", 0.0) / 1000.0, 2)
                        dur_mins = round(r.get("duration", 0.0) / 60.0, 1)
                        r_name = names[idx] if idx < len(names) else f"Route Option {idx+1}"
                        
                        steps_list: List[RouteStep] = []
                        for leg in r.get("legs", []):
                            for step in leg.get("steps", []):
                                steps_list.append(
                                    RouteStep(
                                        instruction=step.get("maneuver", {}).get("instruction", "Continue along path"),
                                        distance_meters=round(step.get("distance", 0.0), 1),
                                        duration_seconds=round(step.get("duration", 0.0), 1)
                                    )
                                )
                        
                        parsed_routes.append(
                            RouteOption(
                                id=f"route_{chr(97 + idx)}",
                                name=r_name,
                                distance_km=dist_km,
                                duration_minutes=dur_mins,
                                geometry=coords,
                                risk_level="LOW",
                                incidents=[],
                                adjusted_eta_minutes=dur_mins,
                                steps=steps_list
                            )
                        )
                    return parsed_routes
    except Exception as e:
        logger.warning(f"Mapbox Directions API failed ({str(e)}). Using synthesized route fallback.")
        
    return generate_interpolated_fallback_routes(origin, destination)
