import math
from typing import List
from app.models import Ambulance, Emergency
from app.schemas import AmbulanceRecommendation

def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two points in kilometers."""
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)

def estimate_ambulance_eta(distance_km: float) -> float:
    """Estimated urban ambulance driving time in minutes assuming 35 km/h avg emergency speed."""
    avg_speed_kmh = 35.0
    transit_mins = (distance_km / avg_speed_kmh) * 60.0
    # Add 1.5 min dispatch readiness buffer
    return round(transit_mins + 1.5, 1)

def rank_ambulances(ambulances: List[Ambulance], emergency: Emergency) -> List[AmbulanceRecommendation]:
    """
    Deterministically ranks ambulances based on suitability, capability match,
    equipment, distance, and ETA for a specific emergency.
    """
    recommendations: List[AmbulanceRecommendation] = []
    
    is_critical = emergency.severity in ("CRITICAL", "HIGH") or emergency.critical_patient_count > 0
    
    for amb in ambulances:
        dist_km = calculate_haversine_distance(emergency.latitude, emergency.longitude, amb.latitude, amb.longitude)
        eta = estimate_ambulance_eta(dist_km)
        
        reasons: List[str] = []
        score = 0.0
        
        # 1. Capability Score (0 - 40 points)
        if is_critical:
            if amb.capability == "ICU":
                score += 40
                reasons.append("Selected because it is available and has the required emergency capability (Mobile ICU)")
            elif amb.capability == "ADVANCED":
                score += 38
                reasons.append("Selected because it is available and has the required emergency capability (Advanced ALS)")
            else: # BASIC
                score += 12
                reasons.append("Basic capability (lower support for critical trauma/injury)")
        else:
            if amb.capability in ("BASIC", "ADVANCED", "ICU"):
                score += 35
                reasons.append(f"Selected because it is available and has the required emergency capability ({amb.capability.capitalize()})")
        
        # 2. Proximity & ETA Score (0 - 35 points)
        proximity_score = max(0.0, 35.0 - (eta * 2.2))
        score += proximity_score
        if eta <= 8.0:
            reasons.append(f"Fast arrival time: ~{eta:.0f} min ({dist_km:.1f} km away)")
        else:
            reasons.append(f"Transit distance: {dist_km:.1f} km (ETA ~{eta:.0f} min)")

        # 3. Availability Score (0 - 15 points)
        if amb.status == "AVAILABLE":
            score += 15
            reasons.append("Currently active and available for immediate dispatch")
        elif amb.status == "BUSY":
            score += 2
            reasons.append("Currently assigned to non-critical standby")
        else:
            score += 0
            reasons.append("Vehicle currently offline/maintenance")

        # 4. Equipment Score (0 - 10 points)
        equipment_list = amb.equipment if isinstance(amb.equipment, list) else []
        matched_equip = 0
        if is_critical:
            for item in ["ventilator", "defibrillator", "oxygen", "trauma_kit", "cardiac_monitor"]:
                if any(item in e.lower() for e in equipment_list):
                    matched_equip += 1
            eq_pts = min(10.0, matched_equip * 3.0)
            score += eq_pts
            if matched_equip > 0:
                reasons.append(f"Equipped with {matched_equip} vital life-support tools")
        else:
            score += 8.0

        match_score = round(min(100.0, max(10.0, score)), 1)
        
        recommendations.append(
            AmbulanceRecommendation(
                ambulance_id=amb.id,
                vehicle_number=amb.vehicle_number,
                capability=amb.capability,
                distance_km=dist_km,
                eta_minutes=eta,
                match_score=match_score,
                reasons=reasons,
                latitude=amb.latitude,
                longitude=amb.longitude
            )
        )
    
    # Sort descending by match_score, then ascending by eta_minutes
    recommendations.sort(key=lambda r: (-r.match_score, r.eta_minutes))
    return recommendations
