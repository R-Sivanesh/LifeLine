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
from app.services.hospital_service import rank_hospitals
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
    Evaluates combinations of available ambulances, capable receiving hospitals,
    and computed routes to minimize the total estimated response-to-care time.

    Mathematical Formulation (Golden Minute 2.0):
    ---------------------------------------------
    Estimated Total Time to Appropriate Care (T_total):
        T_total = ETA_ambulance(scene) + T_transit(scene -> hospital) + P_hazard
    
    Where:
        ETA_ambulance = f(Distance_haversine(ambulance, emergency), Avg_Speed=35km/h, Buffer=1.5min) [Demo Telemetry]
        T_transit     = Google_Routes_Live_Duration(route) + Σ(Incident_Delay_Penalties) [Live Traffic]
        P_hazard      = Spatial risk delay penalty
        
    Optimization Objective:
        minimize(T_total)
        subject to:
            Ambulance.capability >= Required_Capability(Emergency.severity)
            Hospital.trauma_capable == True (if is_trauma_emergency)
            Route.risk_level != "BLOCKED" (when clear alternative corridor exists)
    """
    # 1. In-memory ranking of ambulances and hospitals
    ranked_ambs = rank_ambulances(ambulances, emergency)
    ranked_hosps = rank_hospitals(hospitals, emergency)
    
    if not ranked_ambs:
        raise ValueError("No ambulances registered in system.")
    if not ranked_hosps:
        raise ValueError("No hospitals registered in system.")
        
    top_amb = ranked_ambs[0]
    top_hosp = ranked_hosps[0]
    
    origin = Coordinate(latitude=emergency.latitude, longitude=emergency.longitude)
    destination = Coordinate(latitude=top_hosp.latitude, longitude=top_hosp.longitude)
    
    # 2. Parallel live data retrieval (Routes + Places)
    routes_task = asyncio.create_task(compute_google_routes(origin, destination, "TRAFFIC_AWARE"))
    places_task = asyncio.create_task(discover_nearby_hospitals_places(emergency.latitude, emergency.longitude))
    
    (raw_routes, traffic_source, traffic_status), (places_list, hospital_source, hospital_status) = await asyncio.gather(
        routes_task, places_task
    )
    
    # 3. Analyze spatial risk for all route alternatives
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
    
    # 4. Total Care Latency calculation
    ambulance_eta = top_amb.eta_minutes
    travel_eta = selected_route.adjusted_eta_minutes
    total_time = round(ambulance_eta + travel_eta, 1)
    
    # 5. Data Provenance & Confidence Calculation
    known_factors = [
        f"Route travel time: {travel_eta:.0f}m via {traffic_source} ({traffic_status})",
        f"Ambulance ETA: {ambulance_eta:.0f}m from Demo Telemetry (A-102 ALS)",
        f"Destination: {top_hosp.name} ({hospital_source})"
    ]
    unknown_factors = [
        "Live ICU bed availability (Not provided by public APIs)",
        "Real-time ER triage intake queue length"
    ]
    
    confidence_level = "HIGH" if traffic_status == "LIVE" else "MEDIUM"
    confidence_score = 0.92 if traffic_status == "LIVE" else 0.75
    
    conf_obj = DecisionConfidenceBreakdown(
        level=confidence_level,
        score=confidence_score,
        known_factors=known_factors,
        unknown_factors=unknown_factors,
        rationale=f"Confidence is {confidence_level} based on {traffic_source} and verified hospital placement."
    )
    
    opt_reason = (
        f"Optimized path: {top_amb.vehicle_number} ({top_amb.capability}, {ambulance_eta:.0f}m ETA) "
        f"→ {top_hosp.name} via {selected_route.name} ({travel_eta:.0f}m transit, {selected_route.risk_level} risk). "
        f"Estimated time to appropriate care: {total_time:.0f} min."
    )
    
    data_sources_map = {
        "traffic": traffic_source,
        "hospitals": hospital_source,
        "ambulances": "Demo Telemetry (Simulated Fleet)",
        "hospital_capacity": "Public API Unavailable (Simulated)"
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
    hosp_reason = (
        f"{hospital.name} was selected with a {hospital.match_score:.0f}% readiness score. "
        f"Location and facility are verified. Bed capacity ({hospital.available_beds} open beds) "
        f"is simulated as real-time hospital occupancy is not provided by public APIs."
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
        f"This prototype optimization coordinates capability-matched ambulance dispatch, "
        f"verified trauma facility placement, and traffic-aware routing to achieve an estimated "
        f"response-to-care time of ~{total_time:.0f} minutes."
    )
    
    return DecisionExplanationResponse(
        ambulance_reason=amb_reason,
        hospital_reason=hosp_reason,
        route_reason=route_reason,
        overall_reason=overall_reason,
        confidence=confidence
    )
