import math
import time
import logging
from typing import List, Dict, Any, Optional, Tuple
from app.models import Ambulance, Emergency
from app.schemas import AmbulanceRecommendation, LiveAmbulanceGPSItem, AmbulanceTelemetryRequest

logger = logging.getLogger(__name__)

# In-memory storage for real-time live GPS telemetry from ambulance trackers / Firebase
_LIVE_AMBULANCE_POOL: Dict[str, Dict[str, Any]] = {}

STALE_THRESHOLD_SECONDS = 30.0
OFFLINE_THRESHOLD_SECONDS = 60.0

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

def evaluate_telemetry_freshness(updated_at_timestamp: float) -> Tuple[str, float]:
    """
    Evaluates whether GPS telemetry is LIVE, STALE, or OFFLINE.
    Accepts timestamps in both seconds and milliseconds.
    """
    now = time.time()
    # Normalize milliseconds to seconds if needed
    ts = updated_at_timestamp / 1000.0 if updated_at_timestamp > 1e11 else updated_at_timestamp
    age_seconds = max(0.0, now - ts)
    
    if age_seconds <= STALE_THRESHOLD_SECONDS:
        return "LIVE", age_seconds
    elif age_seconds <= OFFLINE_THRESHOLD_SECONDS:
        return "STALE", age_seconds
    else:
        return "OFFLINE", age_seconds

def update_live_ambulance_telemetry(req: AmbulanceTelemetryRequest) -> LiveAmbulanceGPSItem:
    """Updates in-memory live GPS telemetry for an ambulance device."""
    now_ts = req.updated_at if req.updated_at else (time.time() * 1000.0)
    
    # Evaluate freshness
    freshness, age = evaluate_telemetry_freshness(now_ts)
    vehicle_num = req.vehicle_number or f"{req.id} (Live GPS)"
    
    record = {
        "id": req.id,
        "vehicle_number": vehicle_num,
        "capability": req.capability or "ADVANCED",
        "status": req.status,
        "latitude": req.latitude,
        "longitude": req.longitude,
        "speed": req.speed,
        "heading": req.heading,
        "accuracy": req.accuracy,
        "updated_at": now_ts,
        "source": "LIVE_GPS",
        "freshness_status": freshness
    }
    
    _LIVE_AMBULANCE_POOL[req.id] = record
    return LiveAmbulanceGPSItem(**record)

def get_live_ambulances_list() -> List[LiveAmbulanceGPSItem]:
    """Returns all active live GPS ambulances with recalculated freshness status."""
    result: List[LiveAmbulanceGPSItem] = []
    for amb_id, data in _LIVE_AMBULANCE_POOL.items():
        freshness, _ = evaluate_telemetry_freshness(data["updated_at"])
        item_dict = dict(data)
        item_dict["freshness_status"] = freshness
        result.append(LiveAmbulanceGPSItem(**item_dict))
    return result

def rank_live_ambulances(
    live_ambulances: List[Dict[str, Any]],
    emergency: Emergency
) -> List[AmbulanceRecommendation]:
    """
    Ranks real GPS-tracked ambulances for dispatch.
    
    CRITICAL PRODUCT RULES:
    1. Only AVAILABLE ambulances with fresh GPS telemetry (<= 30s) are selected for dispatch.
    2. Stale (> 30s) and Offline (> 60s) ambulances are marked but NOT selected for response plan.
    3. Status is checked (must be AVAILABLE, not EN_ROUTE or ON_SCENE).
    """
    recommendations: List[AmbulanceRecommendation] = []
    is_critical = emergency.severity in ("CRITICAL", "HIGH") or emergency.critical_patient_count > 0
    
    for amb in live_ambulances:
        lat = amb.get("latitude")
        lon = amb.get("longitude")
        if lat is None or lon is None or (lat == 0.0 and lon == 0.0):
            continue
            
        updated_at = amb.get("updated_at", time.time() * 1000.0)
        freshness, age_sec = evaluate_telemetry_freshness(updated_at)
        status = amb.get("status", "AVAILABLE")
        capability = amb.get("capability", "ADVANCED")
        v_num = amb.get("vehicle_number", f"{amb.get('id', 'AMB')} (Live GPS)")
        amb_id = amb.get("id", "amb-live")
        
        dist_km = calculate_haversine_distance(emergency.latitude, emergency.longitude, lat, lon)
        eta = estimate_ambulance_eta(dist_km)
        
        reasons: List[str] = []
        score = 0.0
        
        # 1. Freshness & Live Telemetry Verification (0 - 30 points)
        if freshness == "LIVE" and status == "AVAILABLE":
            score += 30.0
            reasons.append(f"Verified live GPS stream (Updated ~{age_sec:.0f}s ago)")
        elif freshness == "STALE":
            score += 0.0
            reasons.append(f"Telemetry stale ({age_sec:.0f}s old) — excluded from primary response")
        elif status != "AVAILABLE":
            score += 0.0
            reasons.append(f"Vehicle status is {status} (not available for new dispatch)")
        else:
            score += 0.0
            reasons.append(f"Vehicle offline ({age_sec:.0f}s old)")
            
        # 2. Capability Score (0 - 40 points)
        if is_critical:
            if capability == "ICU":
                score += 40.0
                reasons.append("Equipped as Mobile ICU with critical life support")
            elif capability == "ADVANCED":
                score += 38.0
                reasons.append("Advanced Life Support (ALS) emergency capability")
            else:
                score += 15.0
                reasons.append("Basic Life Support (BLS)")
        else:
            score += 35.0
            reasons.append(f"Capability: {capability}")
            
        # 3. Proximity & ETA Score (0 - 30 points)
        proximity_score = max(0.0, 30.0 - (eta * 2.0))
        score += proximity_score
        reasons.append(f"Estimated scene arrival: ~{eta:.0f} min ({dist_km:.1f} km away)")
        
        match_score = round(min(100.0, max(0.0, score)), 1)
        
        recommendations.append(
            AmbulanceRecommendation(
                ambulance_id=amb_id,
                vehicle_number=v_num,
                capability=capability,
                distance_km=dist_km,
                eta_minutes=eta,
                match_score=match_score,
                reasons=reasons,
                latitude=lat,
                longitude=lon,
                source="LIVE_GPS",
                status=status,
                updated_at=updated_at,
                freshness_status=freshness
            )
        )
        
    # Sort descending by match_score, then ascending by eta_minutes
    recommendations.sort(key=lambda r: (-r.match_score, r.eta_minutes))
    return recommendations

def rank_ambulances(ambulances: List[Ambulance], emergency: Emergency) -> List[AmbulanceRecommendation]:
    """
    Deterministically ranks database/seeded ambulances (used primarily in DEMO/SIMULATION mode).
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
                longitude=amb.longitude,
                source="DEMO_TELEMETRY",
                status=amb.status,
                updated_at=time.time() * 1000.0,
                freshness_status="DEMO"
            )
        )
    
    recommendations.sort(key=lambda r: (-r.match_score, r.eta_minutes))
    return recommendations
