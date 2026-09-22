import asyncio
import time
import logging
from typing import List, Dict, Any, Tuple, Optional
from app.models import Emergency, Ambulance, Hospital, RoadIncident
from app.config import settings
from app.schemas import (
    OptimizationResponse,
    DecisionExplanationResponse,
    DecisionConfidenceBreakdown,
    AmbulanceRecommendation,
    HospitalRecommendation,
    RouteOption,
    Coordinate
)
from app.services.ambulance_service import (
    rank_ambulances,
    rank_live_ambulances,
    get_live_ambulances_list,
    _LIVE_AMBULANCE_POOL,
    evaluate_telemetry_freshness,
    calculate_haversine_distance,
    estimate_ambulance_eta,
    MAX_DISPATCH_RADIUS_KM
)
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
    Evaluates combinations of available real GPS-tracked ambulances (or demo ambulances in demo mode),
    real receiving hospitals from Google Places, and computed routes to minimize the total estimated response-to-care time.
    """
    # 1. Determine Assigned or Available Ambulance
    from app.services.ambulance_service import (
        _LIVE_AMBULANCE_POOL,
        evaluate_telemetry_freshness,
        calculate_haversine_distance,
        estimate_ambulance_eta
    )
    
    top_amb: Optional[AmbulanceRecommendation] = None
    has_live_amb = False
    no_amb_reason: Optional[str] = None
    ambulance_source = "NONE"
    ambulance_status_str = "UNKNOWN"
    is_demo_emergency = bool(getattr(emergency, "is_demo", False))
    assigned_amb_id = getattr(emergency, "assigned_ambulance_id", None)

    if assigned_amb_id:
        # Case A: Emergency has an authoritative assigned ambulance
        if assigned_amb_id in _LIVE_AMBULANCE_POOL:
            amb_data = _LIVE_AMBULANCE_POOL[assigned_amb_id]
            freshness, age_sec = evaluate_telemetry_freshness(amb_data.get("updated_at", 0))
            lat = amb_data.get("latitude", 0.0)
            lon = amb_data.get("longitude", 0.0)
            dist_km = calculate_haversine_distance(emergency.latitude, emergency.longitude, lat, lon)
            
            eta = estimate_ambulance_eta(dist_km)
            # Compute live route if GPS is fresh
            if freshness == "LIVE":
                try:
                    amb_origin = Coordinate(latitude=lat, longitude=lon)
                    emg_dest = Coordinate(latitude=emergency.latitude, longitude=emergency.longitude)
                    amb_routes, _, _ = await compute_google_routes(amb_origin, emg_dest, "TRAFFIC_AWARE")
                    if amb_routes and len(amb_routes) > 0:
                        eta = amb_routes[0].adjusted_eta_minutes
                        dist_km = amb_routes[0].distance_km
                except Exception as e:
                    logger.warning(f"Failed to calculate exact route for assigned ambulance: {e}")
            
            ambulance_source = "LIVE_GPS" if freshness == "LIVE" else "STALE_GPS"
            ambulance_status_str = freshness
            has_live_amb = (freshness in ("LIVE", "STALE"))
            
            top_amb = AmbulanceRecommendation(
                ambulance_id=assigned_amb_id,
                vehicle_number=amb_data.get("vehicle_number", assigned_amb_id),
                capability=amb_data.get("capability", "ADVANCED"),
                distance_km=dist_km,
                eta_minutes=eta,
                match_score=100.0,
                reasons=[f"Assigned responding unit ({freshness} telemetry • {age_sec:.0f}s ago)"],
                latitude=lat,
                longitude=lon,
                source=ambulance_source,
                status=amb_data.get("status", "EN_ROUTE"),
                updated_at=amb_data.get("updated_at", time.time() * 1000.0),
                freshness_status=freshness,
                is_demo=bool(amb_data.get("is_demo", False))
            )
        else:
            # Fallback to database assigned ambulance (e.g. registered vehicle)
            db_amb = next((a for a in ambulances if a.id == assigned_amb_id), None)
            if db_amb:
                dist_km = calculate_haversine_distance(emergency.latitude, emergency.longitude, db_amb.latitude, db_amb.longitude)
                eta = estimate_ambulance_eta(dist_km)
                is_amb_demo = bool(getattr(db_amb, "is_demo", False))
                ambulance_source = "DEMO_TELEMETRY" if is_amb_demo else "DATABASE"
                ambulance_status_str = "DEMO" if is_amb_demo else "LIVE"
                has_live_amb = True
                
                top_amb = AmbulanceRecommendation(
                    ambulance_id=db_amb.id,
                    vehicle_number=db_amb.vehicle_number,
                    capability=db_amb.capability,
                    distance_km=dist_km,
                    eta_minutes=eta,
                    match_score=100.0,
                    reasons=[f"Assigned unit: {db_amb.vehicle_number}"],
                    latitude=db_amb.latitude,
                    longitude=db_amb.longitude,
                    source=ambulance_source,
                    status=db_amb.status,
                    updated_at=time.time() * 1000.0,
                    freshness_status=ambulance_status_str,
                    is_demo=is_amb_demo
                )
    else:
        # Case B: Unassigned emergency - Find eligible candidate unit within operational range (<= 35km)
        # 1. Check for real connected GPS ambulances with fresh telemetry
        live_items = get_live_ambulances_list()
        live_dict_list = [item.model_dump() for item in live_items]
        if live_dict_list:
            live_ranked = rank_live_ambulances(live_dict_list, emergency)
            available_live = [a for a in live_ranked if a.freshness_status == "LIVE" and a.status in ("AVAILABLE", "ALERTED")]
            if available_live:
                top_amb = available_live[0]
                has_live_amb = True
                ambulance_source = "LIVE_GPS"
                ambulance_status_str = "LIVE"
                
                # Compute live route from Ambulance GPS -> Emergency Scene
                try:
                    amb_origin = Coordinate(latitude=top_amb.latitude, longitude=top_amb.longitude)
                    emg_dest = Coordinate(latitude=emergency.latitude, longitude=emergency.longitude)
                    amb_routes, _, _ = await compute_google_routes(amb_origin, emg_dest, "TRAFFIC_AWARE")
                    if amb_routes and len(amb_routes) > 0:
                        top_amb.eta_minutes = amb_routes[0].adjusted_eta_minutes
                        top_amb.distance_km = amb_routes[0].distance_km
                except Exception as e:
                    logger.warning(f"Failed to calculate exact route for live ambulance candidate: {e}")

        # 2. If no live ambulance, evaluate registered database fleet within range
        if not top_amb and len(ambulances) > 0:
            ranked_ambs = rank_ambulances(ambulances, emergency)
            if ranked_ambs:
                top_amb = ranked_ambs[0]
                is_amb_demo = bool(getattr(top_amb, "is_demo", False))
                ambulance_source = "DEMO_TELEMETRY" if is_amb_demo else "DATABASE"
                ambulance_status_str = "DEMO" if is_amb_demo else "LIVE"
                has_live_amb = not is_amb_demo

        if not top_amb:
            has_live_amb = False
            no_amb_reason = "LifeLine could not verify a nearby registered ambulance with current GPS telemetry."

    # 2. Live Hospital Discovery (Google Places API New)
    places_list, hospital_source, hospital_status, _ = await discover_nearby_hospitals_places(
        emergency.latitude, emergency.longitude, radius_meters=12000.0
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
    
    # Distance sanity check
    from app.services.ambulance_service import calculate_haversine_distance
    straight_line_dist = round(calculate_haversine_distance(
        emergency.latitude, emergency.longitude, top_hosp.latitude, top_hosp.longitude
    ), 2)
    
    travel_eta = selected_route.adjusted_eta_minutes
    route_status_flag = "VERIFIED"
    route_warning = None
    
    if (straight_line_dist < 15.0 and travel_eta > 90.0) or (straight_line_dist < 30.0 and travel_eta > 180.0):
        route_status_flag = "ROUTE_UNAVAILABLE_NEEDS_VERIFICATION"
        route_warning = f"Discrepancy detected: Straight-line distance is {straight_line_dist:.1f} km, but routing returned an unexpected {travel_eta:.0f} min duration. Corridor requires manual verification."
        logger.warning(f"[Sanity Check] {route_warning}")

    # 5. Total Care Latency calculation
    ambulance_eta = top_amb.eta_minutes if top_amb else 0.0
    total_time = round(ambulance_eta + travel_eta, 1)
    
    # 6. Data Provenance & Confidence Calculation
    known_factors = [
        f"Hospital Destination: {top_hosp.name} ({hospital_source} • {hospital_status})",
        f"Route travel time: ~{travel_eta:.0f}m via {traffic_source} ({traffic_status})"
    ]
    if top_amb:
        known_factors.append(f"Ambulance ETA: ~{ambulance_eta:.0f}m ({top_amb.vehicle_number} • {ambulance_source})")
        
    unknown_factors = [
        "Live hospital bed/ICU occupancy (UNKNOWN • Not provided by public municipal APIs)",
        "Real-time emergency department triage wait queue"
    ]
    if not has_live_amb:
        unknown_factors.append("Real-time ambulance GPS location (Awaiting active unit stream)")
    
    confidence_level = "HIGH" if (traffic_status == "LIVE" and hospital_status == "LIVE" and has_live_amb and route_status_flag == "VERIFIED") else "MEDIUM"
    confidence_score = 0.94 if confidence_level == "HIGH" else 0.75
    
    conf_obj = DecisionConfidenceBreakdown(
        level=confidence_level,
        score=confidence_score,
        known_factors=known_factors,
        unknown_factors=unknown_factors,
        rationale=f"Confidence is {confidence_level} based on {hospital_source} verified location, {traffic_source} traffic data, and {ambulance_source} telemetry."
    )
    
    if top_amb:
        opt_reason = (
            f"Optimal care corridor: {top_amb.vehicle_number} ({top_amb.capability}, {ambulance_eta:.0f}m scene ETA) "
            f"→ {top_hosp.name} ({hospital_status} via {hospital_source}) via {selected_route.name} ({travel_eta:.0f}m transit). "
            f"Estimated time to critical care: {total_time:.0f} min."
        )
    else:
        opt_reason = (
            f"Hospital care corridor: → {top_hosp.name} ({hospital_status} via {hospital_source}) "
            f"via {selected_route.name} ({travel_eta:.0f}m transit). No verified live ambulance currently in range."
        )
    
    # 6. Priority Corridor Intelligence
    from app.services.google_routes_service import analyze_emergency_priority_corridor
    from app.schemas import EmergencyPriorityCorridorResponse
    corridor_dict = analyze_emergency_priority_corridor(assessed_routes)
    corridor_obj = EmergencyPriorityCorridorResponse(**corridor_dict) if corridor_dict else None

    data_sources_map = {
        "traffic": traffic_source,
        "hospitals": hospital_source,
        "ambulances": ambulance_source if has_live_amb else "No Verified Live Ambulance",
        "hospital_capacity": "UNKNOWN (Not provided by public municipal APIs)"
    }
    
    return OptimizationResponse(
        emergency_id=emergency.id,
        selected_ambulance=top_amb,
        selected_hospital=top_hosp,
        hospital_candidates=ranked_hosps,
        selected_route=selected_route,
        alternative_routes=alternative_routes,
        ambulance_eta=ambulance_eta,
        travel_eta=travel_eta,
        total_estimated_time=total_time,
        straight_line_distance_km=straight_line_dist,
        route_distance_km=selected_route.distance_km,
        route_status_flag=route_status_flag,
        route_warning=route_warning,
        optimization_reason=opt_reason,
        has_live_ambulance=has_live_amb,
        no_ambulance_reason=no_amb_reason,
        confidence=conf_obj,
        data_sources=data_sources_map,
        corridor_analysis=corridor_obj
    )


def generate_decision_explanation(
    emergency: Emergency,
    ambulance: Optional[AmbulanceRecommendation],
    hospital: HospitalRecommendation,
    route: RouteOption,
    confidence: Optional[DecisionConfidenceBreakdown] = None
) -> DecisionExplanationResponse:
    """
    Generates transparent, human-readable explanations detailing known vs unknown factors.
    """
    # Ambulance explanation
    if ambulance:
        amb_source = ambulance.source or "LIVE_GPS"
        amb_reason = (
            f"{ambulance.vehicle_number} was selected because it is available and has the required "
            f"emergency capability ({ambulance.capability}), with an estimated arrival time of "
            f"{ambulance.eta_minutes:.0f} min ({ambulance.distance_km:.1f} km away) [{amb_source}]."
        )
    else:
        amb_reason = (
            "No verified live GPS ambulance is currently available in the active fleet. "
            "LifeLine requires live GPS confirmation before assigning an emergency unit."
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
        
    amb_eta = ambulance.eta_minutes if ambulance else 0.0
    total_time = round(amb_eta + route.adjusted_eta_minutes, 1)
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
