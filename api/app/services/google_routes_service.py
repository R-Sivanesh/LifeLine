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
    straight_dist_km = round(calculate_haversine_distance(
        origin.latitude, origin.longitude, destination.latitude, destination.longitude
    ), 2)
    
    logger.info(
        f"[Google Routes] Requesting Route: "
        f"Origin=({origin.latitude:.6f}, {origin.longitude:.6f}) -> "
        f"Destination=({destination.latitude:.6f}, {destination.longitude:.6f}), "
        f"Straight-line Distance={straight_dist_km:.2f} km"
    )

    key = settings.GOOGLE_ROUTES_API_KEY.strip() or settings.GOOGLE_MAPS_API_KEY.strip()
    
    if key and key != "your_google_maps_api_key_here" and not key.startswith("your_"):
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
            async with httpx.AsyncClient(timeout=6.0) as client:
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
                            
                            logger.info(
                                f"[Google Routes] Route {idx+1} result: distance={dist_km} km, "
                                f"duration={dur_mins} min ({dur_secs}s), straight_dist={straight_dist_km} km"
                            )
                            
                            # Distance Sanity Check: If straight line is physically nearby (< 15km) but Google Routes returns > 90min,
                            # or if implied speed is absurdly distorted (< 3 km/h over long distance), flag risk level.
                            is_suspicious = (straight_dist_km < 15.0 and dur_mins > 90.0) or (straight_dist_km < 30.0 and dur_mins > 180.0)
                            risk_level = "BLOCKED" if is_suspicious else "LOW"

                            # Static vs Live Traffic Duration for congestion delay analysis
                            static_dur_str = r.get("staticDuration", dur_str).replace("s", "")
                            static_secs = float(static_dur_str) if static_dur_str else dur_secs
                            traffic_delay_mins = max(0.0, round((dur_secs - static_secs) / 60.0, 1))
                            
                            # Congestion level classification
                            if traffic_delay_mins > 8.0 or (dur_secs / max(1.0, static_secs) >= 1.6):
                                congestion_lvl = "SEVERE"
                            elif traffic_delay_mins > 3.0 or (dur_secs / max(1.0, static_secs) >= 1.25):
                                congestion_lvl = "HEAVY"
                            else:
                                congestion_lvl = "NORMAL"

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
                                    risk_level=risk_level,
                                    incidents=[],
                                    adjusted_eta_minutes=dur_mins,
                                    steps=steps_list,
                                    traffic_delay_minutes=traffic_delay_mins,
                                    congestion_level=congestion_lvl
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


def analyze_emergency_priority_corridor(
    routes: List[RouteOption]
) -> Dict[str, Any]:
    """
    Emergency Priority Corridor Intelligence:
    Compares primary traffic-aware route against alternate corridors.
    Detects congestion delays and calculates potential time savings from rerouting.
    Data Honesty Guarantee: Does NOT pretend to manipulate public municipal traffic signals.
    """
    from app.schemas import EmergencyPriorityCorridorResponse
    
    if not routes:
        return {
            "status": "OPTIMAL_CORRIDOR_ACTIVE",
            "current_corridor_name": "Standard Route",
            "current_eta_minutes": 0.0,
            "traffic_delay_minutes": 0.0,
            "congestion_severity": "NORMAL",
            "recommended_corridor": None,
            "alternate_corridors": [],
            "time_saved_minutes": 0.0,
            "reason": "Single clear corridor active.",
            "traffic_control_integration": "INFORMATIONAL_ROUTING_ONLY (No public municipal signal override)"
        }
        
    primary_route = routes[0]
    alternates = routes[1:] if len(routes) > 1 else []
    
    current_delay = primary_route.traffic_delay_minutes
    congestion_sev = primary_route.congestion_level
    
    # Check if an alternate corridor saves time
    fastest_alternate = None
    time_saved = 0.0
    
    if alternates:
        fastest_alternate = min(alternates, key=lambda r: r.adjusted_eta_minutes)
        if fastest_alternate.adjusted_eta_minutes < primary_route.adjusted_eta_minutes:
            time_saved = round(primary_route.adjusted_eta_minutes - fastest_alternate.adjusted_eta_minutes, 1)
            
    if time_saved > 2.0 and congestion_sev in ("HEAVY", "SEVERE"):
        status = "REROUTE_RECOMMENDED"
        recommended = fastest_alternate
        reason = f"{congestion_sev} congestion on {primary_route.name} (+{current_delay:.1f}m delay). Recommended alternate corridor {recommended.name} saves ~{time_saved:.0f} minutes."
    elif congestion_sev in ("HEAVY", "SEVERE"):
        status = "CONGESTION_DETECTED"
        recommended = primary_route
        reason = f"Heavy traffic detected on {primary_route.name} (+{current_delay:.1f}m delay). Monitoring alternate corridors."
    else:
        status = "OPTIMAL_CORRIDOR_ACTIVE"
        recommended = primary_route
        reason = f"Clear priority corridor via {primary_route.name}. Traffic flow normal."
        
    return {
        "status": status,
        "current_corridor_name": primary_route.name,
        "current_eta_minutes": primary_route.adjusted_eta_minutes,
        "traffic_delay_minutes": current_delay,
        "congestion_severity": congestion_sev,
        "recommended_corridor": recommended or primary_route,
        "alternate_corridors": alternates,
        "time_saved_minutes": time_saved,
        "reason": reason,
        "traffic_control_integration": "INFORMATIONAL_ROUTING_ONLY (No public municipal signal override)"
    }

