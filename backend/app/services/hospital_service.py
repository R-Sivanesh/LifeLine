import math
from typing import List
from app.models import Hospital, Emergency
from app.schemas import HospitalRecommendation
from app.services.ambulance_service import calculate_haversine_distance

def estimate_hospital_eta(distance_km: float) -> float:
    """Estimated transport time in minutes from incident location to hospital."""
    avg_speed_kmh = 32.0  # Urban emergency transit speed
    transit_mins = (distance_km / avg_speed_kmh) * 60.0
    return round(transit_mins + 2.0, 1)

def rank_hospitals(hospitals: List[Hospital], emergency: Emergency) -> List[HospitalRecommendation]:
    """
    Ranks hospitals based on medical capabilities, trauma readiness, ICU availability,
    simulated bed capacity, distance, and transit ETA.
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
                reasons.append("Level-1 trauma capable with active ICU facilities for critical trauma")
            elif hosp.trauma_capable:
                score += 35
                reasons.append("Trauma capable with dedicated emergency surgery suite")
            elif hosp.icu_available:
                score += 20
                reasons.append("ICU available but lacks designated multi-speciality trauma unit")
            else:
                score += 8
                reasons.append("Limited specialized trauma support")
        elif is_critical:
            if hosp.icu_available:
                score += 40
                reasons.append("ICU beds available for critical patient stabilization")
            else:
                score += 15
                reasons.append("General emergency care; ICU beds restricted")
        else:
            score += 35
            reasons.append("Emergency department available for standard patient care")

        # 2. Bed & Emergency Availability (0 - 20 points)
        if hosp.emergency_available and hosp.available_beds > 0:
            bed_score = min(20.0, 10.0 + hosp.available_beds * 0.8)
            score += bed_score
            reasons.append(f"Simulated ER capacity: {hosp.available_beds} beds currently open")
        else:
            score += 0
            reasons.append("Emergency intake at capacity or restricted")

        # 3. Distance & Transit ETA (0 - 25 points)
        proximity_score = max(0.0, 25.0 - (eta * 1.5))
        score += proximity_score
        reasons.append(f"Estimated transit time: ~{eta:.0f} min ({dist_km:.1f} km)")

        # 4. Hospital Operational Status (0 - 10 points)
        if hosp.status == "OPEN":
            score += 10
            reasons.append("Facility status: Normal 24/7 emergency operations")
        elif hosp.status == "LIMITED":
            score += 4
            reasons.append("Facility status: Elevated load (limited emergency admission)")
        else:
            score += 0
            reasons.append("Facility status: Closed/Diverting non-urgent traffic")

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
                available_beds=hosp.available_beds
            )
        )
        
    # Sort descending by match_score, then ascending by eta
    recommendations.sort(key=lambda r: (-r.match_score, r.eta_minutes))
    return recommendations
