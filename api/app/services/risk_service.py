import math
from typing import List, Dict, Any, Tuple
from app.models import RoadIncident
from app.schemas import RouteOption, RouteRiskResponse
from app.services.ambulance_service import calculate_haversine_distance

def point_to_point_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates distance between two coordinates in meters."""
    return calculate_haversine_distance(lat1, lon1, lat2, lon2) * 1000.0

def analyze_route_risk(route: RouteOption, active_incidents: List[RoadIncident]) -> RouteOption:
    """
    Evaluates spatial intersection of active road incidents with the route path.
    Assigns risk level (LOW, MEDIUM, HIGH, BLOCKED) and computes adjusted ETA.
    """
    matched_incidents: List[Dict[str, Any]] = []
    max_severity_weight = 0
    total_delay_minutes = 0.0
    is_blocked = False
    
    # Extract coordinates from geometry (list of [lon, lat])
    coords = route.geometry if isinstance(route.geometry, list) else []
    
    for inc in active_incidents:
        if not inc.active:
            continue
            
        incident_radius = inc.radius_meters or 250
        # Check if any waypoint on the route is within the incident's impact radius
        intersected = False
        min_dist_to_route = 999999.0
        
        for pt in coords:
            if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                pt_lon, pt_lat = pt[0], pt[1]
                dist_m = point_to_point_distance_meters(inc.latitude, inc.longitude, pt_lat, pt_lon)
                if dist_m < min_dist_to_route:
                    min_dist_to_route = dist_m
                if dist_m <= (incident_radius + 150):  # Proximity threshold
                    intersected = True
                    break
        
        if intersected:
            inc_info = {
                "id": inc.id,
                "type": inc.type,
                "severity": inc.severity,
                "description": inc.description or f"Active {inc.type}",
                "latitude": inc.latitude,
                "longitude": inc.longitude,
                "distance_to_route_m": round(min_dist_to_route, 1)
            }
            matched_incidents.append(inc_info)
            
            # Evaluate impact
            if inc.type in ("ROAD_BLOCK", "FLOOD") or inc.severity == "CRITICAL":
                is_blocked = True
                max_severity_weight = max(max_severity_weight, 4)
                total_delay_minutes += 12.0
            elif inc.type == "ACCIDENT" or inc.severity == "HIGH":
                max_severity_weight = max(max_severity_weight, 3)
                total_delay_minutes += 6.0
            elif inc.type in ("CONGESTION", "CONSTRUCTION", "HAZARD"):
                max_severity_weight = max(max_severity_weight, 2)
                total_delay_minutes += 3.0
                
    # Determine risk level
    if is_blocked:
        risk_level = "BLOCKED"
    elif max_severity_weight >= 3:
        risk_level = "HIGH"
    elif max_severity_weight == 2:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"
        
    adjusted_eta = round(route.duration_minutes + total_delay_minutes, 1)
    
    # Return updated route
    return RouteOption(
        id=route.id,
        name=route.name,
        distance_km=route.distance_km,
        duration_minutes=route.duration_minutes,
        geometry=route.geometry,
        risk_level=risk_level,
        incidents=matched_incidents,
        adjusted_eta_minutes=adjusted_eta,
        steps=route.steps
    )
