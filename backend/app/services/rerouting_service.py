from typing import List, Optional
from sqlalchemy.orm import Session
from app.models import Emergency, Hospital, RoadIncident, RouteEvent, Dispatch
from app.schemas import RerouteResponse, RouteOption, Coordinate
from app.services.routing_service import fetch_mapbox_routes
from app.services.risk_service import analyze_route_risk

async def process_dynamic_reroute(
    emergency_id: str,
    db: Session,
    active_incidents: List[RoadIncident],
    current_route_data: Optional[dict] = None
) -> RerouteResponse:
    """
    Checks if active route is compromised by new or existing incidents,
    evaluates alternative routes, selects the optimal safe detour, and records a route event.
    """
    emergency = db.query(Emergency).filter(Emergency.id == emergency_id).first()
    if not emergency:
        raise ValueError(f"Emergency {emergency_id} not found")

    dispatch = db.query(Dispatch).filter(Dispatch.emergency_id == emergency_id).order_by(Dispatch.created_at.desc()).first()
    
    # Identify destination hospital
    hosp_id = dispatch.hospital_id if dispatch else None
    hospital = db.query(Hospital).filter(Hospital.id == hosp_id).first() if hosp_id else None
    
    if not hospital:
        # Pick default top hospital
        hospital = db.query(Hospital).first()
        if not hospital:
            raise ValueError("No hospital found for route rerouting")

    origin = Coordinate(latitude=emergency.latitude, longitude=emergency.longitude)
    destination = Coordinate(latitude=hospital.latitude, longitude=hospital.longitude)
    
    # Fetch all route alternatives
    all_raw_routes = await fetch_mapbox_routes(origin, destination)
    assessed_routes: List[RouteOption] = [
        analyze_route_risk(r, active_incidents) for r in all_raw_routes
    ]
    
    old_route_obj: Optional[RouteOption] = None
    old_eta = 0.0
    
    if current_route_data:
        try:
            old_route_obj = RouteOption(**current_route_data)
            old_eta = old_route_obj.adjusted_eta_minutes or old_route_obj.duration_minutes
        except Exception:
            old_route_obj = assessed_routes[0]
            old_eta = assessed_routes[0].duration_minutes
    else:
        old_route_obj = assessed_routes[0]
        old_eta = assessed_routes[0].duration_minutes

    # Filter out BLOCKED routes or pick safest lowest ETA
    def route_penalty_score(r: RouteOption) -> float:
        penalty = 0.0
        if r.risk_level == "BLOCKED":
            penalty = 1000.0
        elif r.risk_level == "HIGH":
            penalty = 10.0
        elif r.risk_level == "MEDIUM":
            penalty = 3.0
        return r.adjusted_eta_minutes + penalty

    assessed_routes.sort(key=route_penalty_score)
    new_selected_route = assessed_routes[0]
    
    is_compromised = (
        old_route_obj is not None and (
            old_route_obj.risk_level == "BLOCKED" or 
            old_route_obj.id != new_selected_route.id or
            any(inc.get("type") in ("ROAD_BLOCK", "FLOOD") for inc in (old_route_obj.incidents or []))
        )
    )
    
    reason = "Dynamic reroute: Safe detour selected to bypass active road disruption."
    if new_selected_route.risk_level == "LOW":
        reason = f"Alternative route ({new_selected_route.name}) selected because the previous route encountered an active blockage."
    elif new_selected_route.risk_level == "MEDIUM":
        reason = f"Route updated to {new_selected_route.name} to avoid critical road blockage."
        
    # Log route event in database
    route_event = RouteEvent(
        emergency_id=emergency_id,
        event_type="DYNAMIC_REROUTE",
        description=reason,
        old_route=old_route_obj.dict() if old_route_obj else None,
        new_route=new_selected_route.dict(),
        old_eta=old_eta,
        new_eta=new_selected_route.adjusted_eta_minutes
    )
    db.add(route_event)
    
    if dispatch:
        dispatch.selected_route = new_selected_route.dict()
        dispatch.estimated_hospital_eta = new_selected_route.adjusted_eta_minutes
        dispatch.total_response_time = round(dispatch.estimated_ambulance_eta + new_selected_route.adjusted_eta_minutes, 1)
        dispatch.reason = reason
        
    db.commit()
    
    return RerouteResponse(
        rerouted=True,
        reason=reason,
        old_eta_minutes=old_eta,
        new_eta_minutes=new_selected_route.adjusted_eta_minutes,
        new_route=new_selected_route,
        old_route=old_route_obj
    )
