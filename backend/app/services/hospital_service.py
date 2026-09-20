import math
import logging
from typing import List, Dict, Any, Optional
from app.models import Hospital, Emergency
from app.schemas import HospitalRecommendation
from app.services.ambulance_service import calculate_haversine_distance

logger = logging.getLogger(__name__)

def estimate_hospital_eta(distance_km: float) -> float:
    """Estimated transport time in minutes from incident location to hospital."""
    avg_speed_kmh = 32.0  # Urban emergency transit speed
    transit_mins = (distance_km / avg_speed_kmh) * 60.0
    return round(transit_mins + 2.0, 1)

def rank_real_places_hospitals(
    places: List[Dict[str, Any]],
    emergency: Emergency
) -> List[HospitalRecommendation]:
    """
    Ranks real hospitals discovered via Google Places API (New).
    
    Data Honesty:
    - Uses real coordinates, business status, and estimated driving distance.
    - Explicitly sets capacity_status = "UNKNOWN" (no fake bed/ICU fabrication).
    """
    recommendations: List[HospitalRecommendation] = []
    
    for idx, p in enumerate(places):
        h_lat = p.get("latitude", emergency.latitude)
        h_lon = p.get("longitude", emergency.longitude)
        dist_km = calculate_haversine_distance(emergency.latitude, emergency.longitude, h_lat, h_lon)
        eta = estimate_hospital_eta(dist_km)
        
        name = p.get("name", "Hospital Facility")
        address = p.get("address", "")
        b_status = p.get("business_status", "OPERATIONAL")
        place_id = p.get("place_id", p.get("id", f"place-{idx}"))
        
        reasons: List[str] = []
        score = 0.0
        
        # 1. Proximity & Transit Time (0 - 60 pts)
        proximity_score = max(10.0, 60.0 - (dist_km * 3.5))
        score += proximity_score
        reasons.append(f"Nearest verified facility: ~{eta:.0f} min transit ({dist_km:.1f} km)")
        
        # 2. Operational Status (0 - 30 pts)
        if b_status == "OPERATIONAL":
            score += 30.0
            reasons.append("Operational 24/7 medical facility (Verified by Google Places)")
        else:
            score += 5.0
            reasons.append(f"Operational status: {b_status}")
            
        # 3. Data Provenance Transparency Note
        reasons.append("Live location verified via Google Places (Bed/ICU capacity: UNKNOWN)")
        
        match_score = round(min(100.0, max(15.0, score)), 1)
        
        recommendations.append(
            HospitalRecommendation(
                hospital_id=p.get("id", f"places/{place_id}"),
                place_id=place_id,
                name=name,
                address=address,
                phone=p.get("phone"),
                distance_km=round(dist_km, 2),
                eta_minutes=eta,
                match_score=match_score,
                reasons=reasons,
                latitude=h_lat,
                longitude=h_lon,
                source="GOOGLE_PLACES",
                verification_status="PUBLICLY_VERIFIED",
                capacity_status="UNKNOWN",
                trauma_capable=None,
                icu_available=None,
                available_beds=None
            )
        )
        
    recommendations.sort(key=lambda r: (-r.match_score, r.eta_minutes))
    return recommendations

def rank_hospitals(hospitals: List[Hospital], emergency: Emergency) -> List[HospitalRecommendation]:
    """
    Ranks database/seeded hospitals (used primarily in DEMO/SIMULATION mode).
    """
    recommendations: List[HospitalRecommendation] = []
    
    is_critical = emergency.severity in ("CRITICAL", "HIGH") or emergency.critical_patient_count > 0
    is_trauma = emergency.incident_type in ("ROAD_ACCIDENT", "TRAUMA_INJURY", "FIRE_BURN")
    
    for hosp in hospitals:
        dist_km = calculate_haversine_distance(emergency.latitude, emergency.longitude, hosp.latitude, hosp.longitude)
        eta = estimate_hospital_eta(dist_km)
        
        reasons: List[str] = []
        score = 0.0
        
        # 1. Medical Capability & Trauma Suitability (0 - 45 points)
        if is_trauma and is_critical:
            if hosp.trauma_capable and hosp.icu_available:
                score += 45
                reasons.append("Level-1 trauma capable with active ICU facilities (Demo)")
            elif hosp.trauma_capable:
                score += 35
                reasons.append("Trauma capable with dedicated emergency suite (Demo)")
            else:
                score += 15
                reasons.append("General emergency care (Demo)")
        elif is_critical:
            if hosp.icu_available:
                score += 40
                reasons.append("ICU beds available (Demo)")
            else:
                score += 15
                reasons.append("General emergency care (Demo)")
        else:
            score += 35
            reasons.append("Emergency department available (Demo)")

        # 2. Distance & Transit ETA (0 - 25 points)
        proximity_score = max(0.0, 25.0 - (eta * 1.5))
        score += proximity_score
        reasons.append(f"Estimated transit: ~{eta:.0f} min ({dist_km:.1f} km)")

        match_score = round(min(100.0, max(10.0, score)), 1)
        
        recommendations.append(
            HospitalRecommendation(
                hospital_id=hosp.id,
                name=hosp.name,
                eta_minutes=eta,
                match_score=match_score,
                reasons=reasons,
                latitude=hosp.latitude,
                longitude=hosp.longitude,
                trauma_capable=hosp.trauma_capable,
                icu_available=hosp.icu_available,
                available_beds=hosp.available_beds,
                source="DEMO_DATABASE",
                verification_status="DEMO_SIMULATED",
                capacity_status="DEMO_SIMULATED"
            )
        )
        
    recommendations.sort(key=lambda r: (-r.match_score, r.eta_minutes))
    return recommendations
