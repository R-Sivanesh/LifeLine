from typing import List, Dict, Any, Tuple
from app.models import Emergency, Ambulance, Hospital, RoadIncident
from app.schemas import (
    OptimizationResponse,
    DecisionExplanationResponse,
    AmbulanceRecommendation,
    HospitalRecommendation,
    RouteOption,
    Coordinate
)
from app.services.ambulance_service import rank_ambulances
from app.services.hospital_service import rank_hospitals
from app.services.routing_service import fetch_mapbox_routes
from app.services.risk_service import analyze_route_risk

async def run_golden_minute_optimization(
    emergency: Emergency,
    ambulances: List[Ambulance],
    hospitals: List[Hospital],
    active_incidents: List[RoadIncident]
) -> OptimizationResponse:
    """
    Evaluates combinations of available ambulances, capable receiving hospitals,
    and computed routes to minimize the total estimated response-to-care time.
    """
    ranked_ambs = rank_ambulances(ambulances, emergency)
    ranked_hosps = rank_hospitals(hospitals, emergency)
    
    if not ranked_ambs:
        raise ValueError("No ambulances registered in system.")
    if not ranked_hosps:
        raise ValueError("No hospitals registered in system.")
        
    top_amb = ranked_ambs[0]
    top_hosp = ranked_hosps[0]
    
    # Calculate routes from emergency scene to selected destination hospital
    origin = Coordinate(latitude=emergency.latitude, longitude=emergency.longitude)
    destination = Coordinate(latitude=top_hosp.latitude, longitude=top_hosp.longitude)
    
    raw_routes = await fetch_mapbox_routes(origin, destination)
    
    # Analyze risk for all route alternatives
    assessed_routes: List[RouteOption] = [
        analyze_route_risk(r, active_incidents) for r in raw_routes
    ]
    
    # Scoring routes: prefer clear routes over blocked ones
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
    
    # Calculate total estimated care timeline
    ambulance_eta = top_amb.eta_minutes
    travel_eta = selected_route.adjusted_eta_minutes
    total_time = round(ambulance_eta + travel_eta, 1)
    
    opt_reason = (
        f"Optimized path: {top_amb.vehicle_number} ({top_amb.capability}, {ambulance_eta:.0f}m ETA) "
        f"→ {top_hosp.name} via {selected_route.name} ({travel_eta:.0f}m transit, {selected_route.risk_level} risk). "
        f"Estimated time to appropriate care: {total_time:.0f} min."
    )
    
    return OptimizationResponse(
        emergency_id=emergency.id,
        selected_ambulance=top_amb,
        selected_hospital=top_hosp,
        selected_route=selected_route,
        alternative_routes=alternative_routes,
        ambulance_eta=ambulance_eta,
        travel_eta=travel_eta,
        total_estimated_time=total_time,
        optimization_reason=opt_reason
    )


def generate_decision_explanation(
    emergency: Emergency,
    ambulance: AmbulanceRecommendation,
    hospital: HospitalRecommendation,
    route: RouteOption
) -> DecisionExplanationResponse:
    """
    Generates transparent, human-readable explanations for all AI and algorithmic decisions.
    """
    # Ambulance explanation
    amb_reason = (
        f"{ambulance.vehicle_number} was selected with a {ambulance.match_score:.0f}% match score "
        f"because it provides {ambulance.capability} life-support capability, is currently available, "
        f"and has an estimated arrival time of {ambulance.eta_minutes:.0f} min ({ambulance.distance_km:.1f} km away)."
    )
    
    # Hospital explanation
    hosp_reason = (
        f"{hospital.name} was selected with a {hospital.match_score:.0f}% readiness score. "
        f"It is {'trauma capable and ' if hospital.trauma_capable else ''}"
        f"{'has active ICU beds' if hospital.icu_available else 'has emergency capacity'}, "
        f"with {hospital.available_beds} simulated open beds, matching the patient's {emergency.severity.lower()} condition."
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
        
    # Overall explanation
    total_time = round(ambulance_eta := ambulance.eta_minutes + route.adjusted_eta_minutes, 1)
    overall_reason = (
        f"This end-to-end plan minimizes total emergency-to-care latency to ~{total_time:.0f} minutes "
        f"while ensuring the critical patient is directed to a facility with appropriate trauma and ICU readiness."
    )
    
    return DecisionExplanationResponse(
        ambulance_reason=amb_reason,
        hospital_reason=hosp_reason,
        route_reason=route_reason,
        overall_reason=overall_reason
    )
