import logging
import math
from typing import List, Dict, Any, Tuple, Optional
import httpx
from app.config import settings
from app.schemas import RouteOption, RouteStep, Coordinate
from app.services.ambulance_service import calculate_haversine_distance

logger = logging.getLogger(__name__)

def decode_polyline(polyline_str: str) -> List[List[float]]:
    """
    Decodes an encoded polyline string into a list of [lon, lat] coordinates (GeoJSON order).
    """
    index = 0
    lat = 0
    lng = 0
    coordinates = []
    
    while index < len(polyline_str):
        shift = 0
        result = 0
        while True:
            byte = ord(polyline_str[index]) - 63
            index += 1
            result |= (byte & 0x1f) << shift
            shift += 5
            if not byte >= 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        shift = 0
        result = 0
        while True:
            byte = ord(polyline_str[index]) - 63
            index += 1
            result |= (byte & 0x1f) << shift
            shift += 5
            if not byte >= 0x20:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        coordinates.append([round(lng / 1e5, 6), round(lat / 1e5, 6)])

    return coordinates


def generate_synthesized_routes(origin: Coordinate, destination: Coordinate) -> List[RouteOption]:
    """
    Generates realistic multi-option fallback routes with smooth coordinates
    when live traffic routing APIs are unavailable.
    """
    base_dist = calculate_haversine_distance(origin.latitude, origin.longitude, destination.latitude, destination.longitude)
    base_mins = max(3.0, round((base_dist / 32.0) * 60.0, 1))  # ~32 km/h city average
    
    num_points = 12
    variations = [
        {"id": "route_a", "name": "Route A (Direct Arterial / Anna Salai)", "dist_mult": 1.0, "time_mult": 1.0, "lat_dev": 0.002, "lon_dev": 0.001},
        {"id": "route_b", "name": "Route B (Express Bypass / Inner Ring)", "dist_mult": 1.15, "time_mult": 1.15, "lat_dev": -0.004, "lon_dev": 0.005},
        {"id": "route_c", "name": "Route C (Flyover Link / OMR Corridor)", "dist_mult": 1.28, "time_mult": 1.30, "lat_dev": 0.007, "lon_dev": -0.006},
    ]
    
    routes: List[RouteOption] = []
    for v in variations:
        coords: List[List[float]] = []
        for i in range(num_points + 1):
            t = i / float(num_points)
            curve = 4.0 * t * (1.0 - t)
            lat = origin.latitude + t * (destination.latitude - origin.latitude) + curve * v["lat_dev"]
            lon = origin.longitude + t * (destination.longitude - origin.longitude) + curve * v["lon_dev"]
            coords.append([round(lon, 6), round(lat, 6)])
            
        r_dist = round(base_dist * v["dist_mult"], 2)
        r_time = round(base_mins * v["time_mult"], 1)
        
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
                    RouteStep(instruction=f"Proceed via {v['name']}", distance_meters=round(r_dist * 500, 0), duration_seconds=round(r_time * 30, 0)),
                    RouteStep(instruction="Follow designated emergency transit lane", distance_meters=round(r_dist * 500, 0), duration_seconds=round(r_time * 30, 0))
                ]
            )
        )
    return routes


async def compute_google_routes(
    origin: Coordinate,
    destination: Coordinate,
    routing_preference: str = "TRAFFIC_AWARE"
) -> Tuple[List[RouteOption], str, str]:
    """
    Queries Google Routes API for live traffic-aware routing between incident and hospital.
    Returns (routes, data_source, traffic_status).
    """
    key = settings.GOOGLE_ROUTES_API_KEY.strip() or settings.GOOGLE_MAPS_API_KEY.strip()
    
    if key and key != "your_google_maps_api_key_here":
        url = "https://routes.googleapis.com/directions/v2:computeRoutes"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs,routes.description"
        }
        payload = {
            "origin": {
                "location": {
                    "latLng": {
                        "latitude": origin.latitude,
                        "longitude": origin.longitude
                    }
                }
            },
            "destination": {
                "location": {
                    "latLng": {
                        "latitude": destination.latitude,
                        "longitude": destination.longitude
                    }
                }
            },
            "travelMode": "DRIVE",
            "routingPreference": routing_preference,
            "computeAlternativeRoutes": True
        }

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    routes_list = data.get("routes", [])
                    if routes_list:
                        parsed_routes: List[RouteOption] = []
                        names = ["Route A (Live Traffic Primary)", "Route B (Alternative Bypass)", "Route C (Secondary Corridor)"]
                        
                        for idx, r in enumerate(routes_list[:3]):
                            dist_m = r.get("distanceMeters", 0)
                            dist_km = round(dist_m / 1000.0, 2)
                            
                            # Duration string format: "360s"
                            dur_str = r.get("duration", "0s").replace("s", "")
                            dur_secs = float(dur_str) if dur_str else 0.0
                            dur_mins = round(dur_secs / 60.0, 1)
                            
                            polyline_str = r.get("polyline", {}).get("encodedPolyline", "")
                            coords = decode_polyline(polyline_str) if polyline_str else []
                            
                            steps_list: List[RouteStep] = []
                            for leg in r.get("legs", []):
                                for step in leg.get("steps", []):
                                    nav = step.get("navigationInstruction", {})
                                    steps_list.append(
                                        RouteStep(
                                            instruction=nav.get("instructions", "Continue forward"),
                                            distance_meters=float(step.get("distanceMeters", 0)),
                                            duration_seconds=float(step.get("staticDuration", "0s").replace("s", "") or 0)
                                        )
                                    )
                                    
                            route_name = r.get("description") or (names[idx] if idx < len(names) else f"Route Option {idx+1}")
                            
                            parsed_routes.append(
                                RouteOption(
                                    id=f"route_{chr(97 + idx)}",
                                    name=route_name,
                                    distance_km=dist_km,
                                    duration_minutes=dur_mins,
                                    geometry=coords,
                                    risk_level="LOW",
                                    incidents=[],
                                    adjusted_eta_minutes=dur_mins,
                                    steps=steps_list
                                )
                            )
                            
                        # Ensure at least 2 routes for alternative comparisons
                        if len(parsed_routes) == 1:
                            synth = generate_synthesized_routes(origin, destination)
                            parsed_routes.append(synth[1])
                            
                        return parsed_routes, "Google Routes API (Live Traffic)", "LIVE"
                else:
                    logger.warning(f"Google Routes API returned {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.warning(f"Google Routes API error ({str(e)}). Falling back to synthesized routes.")

    # Fallback when Google key is absent or fails
    fallback_routes = generate_synthesized_routes(origin, destination)
    return fallback_routes, "Synthesized Corridor Model (Offline Fallback)", "UNAVAILABLE"
