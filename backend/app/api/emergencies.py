import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import Emergency, EmergencySession, Ambulance, Hospital, RoadIncident, Dispatch, EmergencyEvent
from app.schemas import (
    EmergencyCreate,
    EmergencyResponse,
    EmergencyStatusUpdate,
    EmergencySessionResponse,
    EmergencyAnalysisResponse,
    AmbulanceRecommendation,
    HospitalRecommendation,
    OptimizationResponse,
    DecisionExplanationResponse,
    RerouteResponse
)
from app.services.ai_service import analyze_emergency_description
from app.services.ambulance_service import rank_ambulances
from app.services.hospital_service import rank_hospitals
from app.services.optimization_service import run_golden_minute_optimization, generate_decision_explanation
from app.services.rerouting_service import process_dynamic_reroute
from app.services.dispatch_service import record_emergency_event, transition_emergency_status

router = APIRouter(prefix="/emergencies", tags=["Emergencies"])

@router.get("/session/active/{session_token}", summary="Validate and restore active patient emergency session")
async def get_active_patient_session(session_token: str, db: Session = Depends(get_db)):
    """
    Validates patient emergency session token and returns active emergency details if still running.
    Prevents duplicate emergency creations upon refresh, minimize/reopen, or network recovery.
    """
    now = datetime.now(timezone.utc)
    session = db.query(EmergencySession).filter(
        EmergencySession.session_token == session_token,
        EmergencySession.is_active == True
    ).first()
    
    if not session:
        return {"is_active": False, "reason": "SESSION_NOT_FOUND"}
        
    if session.expires_at and session.expires_at < now:
        session.is_active = False
        db.commit()
        return {"is_active": False, "reason": "SESSION_EXPIRED"}
        
    emg = db.query(Emergency).filter(Emergency.id == session.emergency_id).first()
    if not emg:
        return {"is_active": False, "reason": "EMERGENCY_NOT_FOUND"}
        
    active_statuses = {"CREATED", "SEARCHING", "DISPATCHING", "DRIVER_ALERTED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "PATIENT_ONBOARD", "TRANSPORTING"}
    if emg.status not in active_statuses:
        return {
            "is_active": False,
            "status": emg.status,
            "reason": "EMERGENCY_NOT_ACTIVE",
            "emergency_id": emg.id
        }
        
    resp = EmergencyResponse.model_validate(emg)
    resp.session = EmergencySessionResponse.model_validate(session)
    
    # Enrich with assigned ambulance telemetry if assigned
    assigned_ambulance = None
    if emg.assigned_ambulance_id:
        amb = db.query(Ambulance).filter(Ambulance.id == emg.assigned_ambulance_id).first()
        if amb:
            assigned_ambulance = {
                "ambulance_id": amb.id,
                "vehicle_number": amb.vehicle_number,
                "latitude": amb.latitude,
                "longitude": amb.longitude,
                "capability": amb.capability,
                "status": amb.status,
                "last_gps_at": amb.last_gps_at.isoformat() if amb.last_gps_at else None
            }
            
    return {
        "is_active": True,
        "status": emg.status,
        "emergency": resp,
        "assigned_ambulance": assigned_ambulance
    }

@router.post("", response_model=EmergencyResponse, status_code=status.HTTP_201_CREATED, summary="Create new emergency report with secure temporary session")
async def create_emergency(
    payload: EmergencyCreate,
    x_session_token: Optional[str] = Header(None, alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """
    Creates a new emergency case and initializes a secure temporary patient session.
    No permanent login required, but protected by scoped temporary session tokens.
    Enforces duplicate prevention if an active session already exists for this client.
    """
    now = datetime.now(timezone.utc)
    
    # 0. Duplicate Emergency Protection: Check if caller already holds an active session
    if x_session_token:
        existing_session = db.query(EmergencySession).filter(
            EmergencySession.session_token == x_session_token,
            EmergencySession.is_active == True,
            EmergencySession.expires_at > now
        ).first()
        if existing_session:
            existing_emg = db.query(Emergency).filter(Emergency.id == existing_session.emergency_id).first()
            if existing_emg and existing_emg.status in (
                "CREATED", "SEARCHING", "DISPATCHING", "DRIVER_ALERTED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "PATIENT_ONBOARD", "TRANSPORTING"
            ):
                resp = EmergencyResponse.model_validate(existing_emg)
                resp.session = EmergencySessionResponse.model_validate(existing_session)
                return resp

    # 1. Analyze description with AI / fallback rule engine
    analysis = await analyze_emergency_description(payload.description)
    
    # 2. Generate secure human-readable session code (e.g. EMG-8F72A)
    session_code = f"EMG-{secrets.token_hex(3).upper()}"
    session_token = f"ll_sess_{secrets.token_urlsafe(32)}"
    
    # 3. Create Emergency model
    emg = Emergency(
        code=session_code,
        title=payload.title or f"{analysis.severity.capitalize()} {analysis.incident_type.replace('_', ' ').title()}",
        description=payload.description,
        incident_type=payload.incident_type or analysis.incident_type,
        latitude=payload.latitude,
        longitude=payload.longitude,
        patient_count=payload.patient_count if payload.patient_count is not None else analysis.patient_count,
        critical_patient_count=payload.critical_patient_count if payload.critical_patient_count is not None else analysis.critical_patient_count,
        severity=payload.severity or analysis.severity,
        status="SEARCHING",
        created_at=now,
        updated_at=now
    )
    db.add(emg)
    db.flush()
    
    # 4. Create EmergencySession model (2 hours validity)
    session = EmergencySession(
        session_token=session_token,
        session_code=session_code,
        emergency_id=emg.id,
        created_at=now,
        expires_at=now + timedelta(hours=2),
        is_active=True
    )
    db.add(session)
    emg.session_id = session.id
    
    # 5. Record Immutable Audit Event
    record_emergency_event(
        db=db,
        emergency_id=emg.id,
        event_type="CREATED",
        actor_type="PATIENT",
        description=f"Emergency case created ({session_code}). Intake: {emg.incident_type} ({emg.severity}).",
        metadata_json={
            "session_code": session_code,
            "patient_count": emg.patient_count,
            "severity": emg.severity,
            "incident_type": emg.incident_type
        },
        latitude=emg.latitude,
        longitude=emg.longitude
    )
    
    db.commit()
    db.refresh(emg)
    
    # Build response with attached session
    resp = EmergencyResponse.model_validate(emg)
    resp.session = EmergencySessionResponse.model_validate(session)
    return resp

@router.get("", response_model=List[EmergencyResponse], summary="List all active and recent emergencies (Operations View)")
async def list_emergencies(
    status_filter: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """
    Lists recent emergencies.
    """
    query = db.query(Emergency)
    if status_filter:
        query = query.filter(Emergency.status == status_filter)
    return query.order_by(Emergency.created_at.desc()).limit(limit).all()

@router.get("/{id}", response_model=EmergencyResponse, summary="Get emergency details by ID")
async def get_emergency(
    id: str,
    x_session_token: Optional[str] = Header(None, alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """
    Retrieves emergency details. Validates scoped session token when accessed from patient clients.
    """
    emg = db.query(Emergency).filter((Emergency.id == id) | (Emergency.code == id)).first()
    if not emg:
        raise HTTPException(status_code=404, detail="Emergency record not found")
        
    session = db.query(EmergencySession).filter(EmergencySession.emergency_id == emg.id).first()
    resp = EmergencyResponse.model_validate(emg)
    if session:
        resp.session = EmergencySessionResponse.model_validate(session)
    return resp

@router.patch("/{id}/status", response_model=EmergencyResponse, summary="Update emergency status")
async def update_emergency_status(id: str, payload: EmergencyStatusUpdate, db: Session = Depends(get_db)):
    emg = db.query(Emergency).filter(Emergency.id == id).first()
    if not emg:
        raise HTTPException(status_code=404, detail="Emergency record not found")
    
    success, msg, updated = transition_emergency_status(
        db=db,
        emergency_id=id,
        target_status=payload.status,
        actor_type="OPERATOR"
    )
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return updated

@router.post("/{id}/cancel", response_model=EmergencyResponse, summary="Cancel an active emergency case")
async def cancel_emergency(
    id: str,
    reason: Optional[str] = "PATIENT_CANCELLED",
    db: Session = Depends(get_db)
):
    """
    Cancels an active emergency, releases dispatched units, and records audit event.
    """
    success, msg, updated = transition_emergency_status(
        db=db,
        emergency_id=id,
        target_status="CANCELLED",
        actor_type="PATIENT",
        notes=f"Emergency cancelled: {reason}"
    )
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return updated

@router.post("/{id}/analyze", response_model=EmergencyAnalysisResponse, summary="Analyze emergency text via AI engine")
async def analyze_emergency(id: str, db: Session = Depends(get_db)):
    emg = db.query(Emergency).filter(Emergency.id == id).first()
    if not emg:
        raise HTTPException(status_code=404, detail="Emergency record not found")
    return await analyze_emergency_description(emg.description)

@router.get("/{id}/ambulance-recommendations", response_model=List[AmbulanceRecommendation], summary="Get ranked ambulance recommendations")
async def get_ambulance_recommendations(id: str, db: Session = Depends(get_db)):
    emg = db.query(Emergency).filter(Emergency.id == id).first()
    if not emg:
        raise HTTPException(status_code=404, detail="Emergency record not found")
    ambulances = db.query(Ambulance).all()
    return rank_ambulances(ambulances, emg)

@router.get("/{id}/hospital-recommendations", response_model=List[HospitalRecommendation], summary="Get ranked hospital recommendations")
async def get_hospital_recommendations(id: str, db: Session = Depends(get_db)):
    emg = db.query(Emergency).filter(Emergency.id == id).first()
    if not emg:
        raise HTTPException(status_code=404, detail="Emergency record not found")
    hospitals = db.query(Hospital).all()
    return rank_hospitals(hospitals, emg)

@router.post("/{id}/optimize", response_model=OptimizationResponse, summary="Run Golden Minute response-to-care optimization")
async def optimize_emergency_flow(id: str, db: Session = Depends(get_db)):
    emg = db.query(Emergency).filter(Emergency.id == id).first()
    if not emg:
        raise HTTPException(status_code=404, detail="Emergency record not found")
    ambulances = db.query(Ambulance).all()
    hospitals = db.query(Hospital).all()
    incidents = db.query(RoadIncident).filter(RoadIncident.active == True).all()
    
    optimization_result = await run_golden_minute_optimization(emg, ambulances, hospitals, incidents)
    
    # Save or update dispatch record in PostgreSQL
    amb_id = optimization_result.selected_ambulance.ambulance_id if optimization_result.selected_ambulance else "NO_AMBULANCE"
    dispatch = db.query(Dispatch).filter(Dispatch.emergency_id == id).first()
    if not dispatch:
        dispatch = Dispatch(
            emergency_id=id,
            ambulance_id=amb_id,
            hospital_id=optimization_result.selected_hospital.hospital_id,
            selected_route=optimization_result.selected_route.model_dump(),
            estimated_ambulance_eta=optimization_result.ambulance_eta,
            estimated_hospital_eta=optimization_result.travel_eta,
            total_response_time=optimization_result.total_estimated_time,
            reason=optimization_result.optimization_reason,
            status="DISPATCHED"
        )
        db.add(dispatch)
    else:
        dispatch.ambulance_id = amb_id
        dispatch.hospital_id = optimization_result.selected_hospital.hospital_id
        dispatch.selected_route = optimization_result.selected_route.model_dump()
        dispatch.estimated_ambulance_eta = optimization_result.ambulance_eta
        dispatch.estimated_hospital_eta = optimization_result.travel_eta
        dispatch.total_response_time = optimization_result.total_estimated_time
        dispatch.reason = optimization_result.optimization_reason
        
    db.commit()
    return optimization_result

@router.get("/{id}/decision", response_model=DecisionExplanationResponse, summary="Get transparent decision explanations")
async def get_decision_explanation(id: str, db: Session = Depends(get_db)):
    emg = db.query(Emergency).filter(Emergency.id == id).first()
    if not emg:
        raise HTTPException(status_code=404, detail="Emergency record not found")
    
    ambulances = db.query(Ambulance).all()
    hospitals = db.query(Hospital).all()
    incidents = db.query(RoadIncident).filter(RoadIncident.active == True).all()
    
    opt_result = await run_golden_minute_optimization(emg, ambulances, hospitals, incidents)
    
    return generate_decision_explanation(
        emergency=emg,
        ambulance=opt_result.selected_ambulance,
        hospital=opt_result.selected_hospital,
        route=opt_result.selected_route,
        confidence=opt_result.confidence
    )

@router.post("/{id}/reroute", response_model=RerouteResponse, summary="Dynamically reroute around road blockage")
async def reroute_emergency(id: str, db: Session = Depends(get_db)):
    incidents = db.query(RoadIncident).filter(RoadIncident.active == True).all()
    dispatch = db.query(Dispatch).filter(Dispatch.emergency_id == id).first()
    current_route = dispatch.selected_route if dispatch else None
    
    return await process_dynamic_reroute(
        emergency_id=id,
        db=db,
        active_incidents=incidents,
        current_route_data=current_route
    )
