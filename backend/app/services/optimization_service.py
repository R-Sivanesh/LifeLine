import asyncio
import logging
from typing import List, Dict, Any, Tuple, Optional
from app.models import Emergency, Ambulance, Hospital, RoadIncident
from app.schemas import (
    OptimizationResponse,
    DecisionExplanationResponse,
    DecisionConfidenceBreakdown,
    AmbulanceRecommendation,
    HospitalRecommendation,
    RouteOption,
    Coordinate
)
from app.services.ambulance_service import rank_ambulances
from app.services.hospital_service import rank_hospitals, rank_real_places_hospitals
from app.services.google_routes_service import compute_google_routes
from app.services.google_places_service import discover_nearby_hospitals_places
from app.services.risk_service import analyze_route_risk

logger = logging.getLogger(__name__)

async def run_golden_minute_optimization(
    emergency: Emergency,
    ambulances: List[Ambulance],
    hospitals: List[Hospital],
    active_incidents: List[RoadIncident]
) -> OptimizationResponse:
    """
    Evaluates combinations of available ambulances, real receiving hospitals from Google Places,
    and computed routes to minimize the total estimated response-to-care time.
    """
    # 1. Rank available ambulances
    ranked_ambs = rank_ambulances(ambulances, emergency)
    if not ranked_ambs:
        raise ValueError("No ambulances available in system.")
        
    top_amb = ranked_ambs[0]

    # 2. Parallel live data retrieval (Google Places Hospitals + Initial Route Probe)
    places_list, hospital_source, hospital_status, _ = await discover_nearby_hospitals_places(
        emergency.latitude, emergency.longitude, radius_meters=8000.0
    )

    if places_list and hospital_status == "LIVE":
        ranked_hosps = rank_real_places_hospitals(places_list, emergency)
    else:
        # Fallback to registered database hospitals (demo/simulation mode)
        ranked_hosps = rank_hospitals(hospitals, emergency)

    if not ranked_hosps:
        raise ValueError("No hospital facilities found near the emergency location.")

    top_hosp = ranked_hosps[0]
    
    # 3. Compute live traffic-aware route from Emergency Scene -> Destination Hospital
    origin = Coordinate(latitude=emergency.latitude, longitude=emergency.longitude)
    destination = Coordinate(latitude=top_hosp.latitude, longitude=top_hosp.longitude)
    
    raw_routes, traffic_source, traffic_status = await compute_google_routes(origin, destination, "TRAFFIC_AWARE")
    
    # 4. Analyze spatial risk for all route alternatives
    assessed_routes: List[RouteOption] = [
        analyze_route_risk(r, active_incidents) for r in raw_routes
    ]
    
    # Route scoring: prefer clear corridors over blocked routes
    def score_route(r: RouteOption) -> float:
        risk_penalty = 0.0
        if r.risk_level == "BLOCKED":
            risk_penalty = 500.0
        elif r.risk_level == "HIGH":
            risk_penalty = 8.0
        elif r.risk_level == "MEDIUM":
            risk_penalty = 3.0
        return r.adjusted_eta_minutes + risk_penalty

    assessed_routes.sort(key=score_route)
    selected_route = assessed_routes[0]
    alternative_routes = assessed_routes[1:] if len(assessed_routes) > 1 else []
    
    # 5. Total Care Latency calculation
    ambulance_eta = top_amb.eta_minutes
    travel_eta = selected_route.adjusted_eta_minutes
    total_time = round(ambulance_eta + travel_eta, 1)
    
    # 6. Data Provenance & Confidence Calculation
    known_factors = [
        f"Hospital Destination: {top_hosp.name} ({hospital_source} • {hospital_status})",
        f"Route travel time: ~{travel_eta:.0f}m via {traffic_source} ({traffic_status})",
        f"Ambulance ETA: ~{ambulance_eta:.0f}m from Demo Telemetry ({top_amb.vehicle_number} {top_amb.capability})"
    ]
    unknown_factors = [
        "Live hospital bed/ICU occupancy (UNKNOWN • Not provided by public municipal APIs)",
        "Real-time emergency department triage wait queue"
    ]
    
    confidence_level = "HIGH" if (traffic_status == "LIVE" and hospital_status == "LIVE") else "MEDIUM"
    confidence_score = 0.94 if confidence_level == "HIGH" else 0.75
    
    conf_obj = DecisionConfidenceBreakdown(
        level=confidence_level,
        score=confidence_score,
        known_factors=known_factors,
        unknown_factors=unknown_factors,
        rationale=f"Confidence is {confidence_level} based on {hospital_source} verified location and {traffic_source} traffic data."
    )
    
    opt_reason = (
        f"Optimal care corridor: {top_amb.vehicle_number} ({top_amb.capability}, {ambulance_eta:.0f}m scene ETA) "
        f"→ {top_hosp.name} ({hospital_status} via {hospital_source}) via {selected_route.name} ({travel_eta:.0f}m transit). "
        f"Estimated time to critical care: {total_time:.0f} min."
    )
    
    data_sources_map = {
        "traffic": traffic_source,
        "hospitals": hospital_source,
        "ambulances": "Demo Telemetry (Simulated Fleet)",
        "hospital_capacity": "UNKNOWN (Not provided by public municipal APIs)"
    }
    
    return OptimizationResponse(
        emergency_id=emergency.id,
        selected_ambulance=top_amb,
        selected_hospital=top_hosp,
        selected_route=selected_route,
        alternative_routes=alternative_routes,
        ambulance_eta=ambulance_eta,
        travel_eta=travel_eta,
        total_estimated_time=total_time,
        optimization_reason=opt_reason,
        confidence=conf_obj,
        data_sources=data_sources_map
    )


def generate_decision_explanation(
    emergency: Emergency,
    ambulance: AmbulanceRecommendation,
    hospital: HospitalRecommendation,
    route: RouteOption,
    confidence: Optional[DecisionConfidenceBreakdown] = None
) -> DecisionExplanationResponse:
    """
    Generates transparent, human-readable explanations detailing known vs unknown factors.
    """
    # Ambulance explanation
    amb_reason = (
        f"{ambulance.vehicle_number} was selected because it is available and has the required "
        f"emergency capability ({ambulance.capability}), with an estimated arrival time of "
        f"{ambulance.eta_minutes:.0f} min ({ambulance.distance_km:.1f} km away) [Demo Telemetry]."
    )
    
    # Hospital explanation
    hosp_source = hospital.source or "GOOGLE_PLACES"
    hosp_reason = (
        f"{hospital.name} was selected as the nearest verified facility (~{hospital.distance_km or 0:.1f} km away). "
        f"Location verified via {hosp_source}. Clinical capacity (bed and ICU availability) is UNKNOWN as real-time occupancy "
        f"is not published by public municipal APIs."
    )
    
    # Route explanation
    if route.risk_level == "LOW":
        route_reason = (
            f"{route.name} was selected as the fastest safe corridor (~{route.duration_minutes:.0f} min, "
            f"{route.distance_km:.1f} km) with zero detected road hazards or blockages."
        )
    elif route.risk_level == "MEDIUM":
        route_reason = (
            f"{route.name} was selected (~{route.adjusted_eta_minutes:.0f} min) as it has minor congestion "
            f"but avoids severe blockages present on alternative routes."
        )
    else:
        route_reason = (
            f"{route.name} was selected with active risk monitoring ({route.risk_level} risk, "
            f"adjusted ETA ~{route.adjusted_eta_minutes:.0f} min)."
        )
        
    total_time = round(ambulance.eta_minutes + route.adjusted_eta_minutes, 1)
    overall_reason = (
        f"LifeLine coordinates capability-matched ambulance dispatch, real Google Places hospital location, "
        f"and live traffic routing to achieve an estimated response-to-care time of ~{total_time:.0f} minutes."
    )
    
    return DecisionExplanationResponse(
        ambulance_reason=amb_reason,
        hospital_reason=hosp_reason,
        route_reason=route_reason,
        overall_reason=overall_reason,
        confidence=confidence
    )
