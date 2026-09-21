from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import Emergency, DriverAlert, Ambulance, Driver, EmergencyEvent
from app.schemas import (
    DriverAlertResponse,
    DriverAcceptRequest,
    DriverAcceptResponse,
    DriverDeclineRequest,
    StateTransitionRequest,
    EmergencyResponse
)
from app.services.dispatch_service import (
    alert_eligible_drivers,
    atomic_accept_emergency,
    decline_emergency_alert,
    transition_emergency_status
)

router = APIRouter(prefix="/dispatch", tags=["Dispatch Engine"])

@router.post("/alert", response_model=List[DriverAlertResponse], summary="Transmit emergency dispatch alerts to eligible response units")
async def trigger_dispatch_alerts(emergency_id: str, ambulance_ids: List[str], db: Session = Depends(get_db)):
    """
    Alerts nearby eligible ambulance units about an active emergency.
    """
    emg = db.query(Emergency).filter(Emergency.id == emergency_id).first()
    if not emg:
        raise HTTPException(status_code=404, detail="Emergency record not found")
        
    alerts = alert_eligible_drivers(db, emg, ambulance_ids)
    
    # Enrich response with emergency metadata
    response_list: List[DriverAlertResponse] = []
    for a in alerts:
        resp = DriverAlertResponse(
            id=a.id,
            emergency_id=a.emergency_id,
            driver_id=a.driver_id,
            ambulance_id=a.ambulance_id,
            status=a.status,
            alerted_at=a.alerted_at,
            emergency_code=emg.code,
            incident_type=emg.incident_type,
            severity=emg.severity,
            latitude=emg.latitude,
            longitude=emg.longitude,
            description=emg.description
        )
        response_list.append(resp)
    return response_list

@router.post("/accept", response_model=DriverAcceptResponse, summary="Atomically accept an emergency dispatch request")
async def accept_dispatch(payload: DriverAcceptRequest, db: Session = Depends(get_db)):
    """
    CRITICAL DISPATCH CONCURRENCY:
    Server-side atomic acceptance handling. When multiple drivers accept simultaneously,
    exactly ONE driver wins the assignment. All other competing alerts are closed immediately.
    """
    result = atomic_accept_emergency(
        db=db,
        emergency_id=payload.emergency_id,
        driver_id=payload.driver_id,
        ambulance_id=payload.ambulance_id,
        latitude=payload.latitude,
        longitude=payload.longitude
    )
    
    if not result.success and result.status == "NOT_FOUND":
        raise HTTPException(status_code=404, detail=result.message)
        
    return result

@router.post("/decline", summary="Driver declines dispatch request")
async def decline_dispatch(payload: DriverDeclineRequest, db: Session = Depends(get_db)):
    """
    Records driver decline and releases assignment for fallback search.
    """
    success = decline_emergency_alert(
        db=db,
        emergency_id=payload.emergency_id,
        driver_id=payload.driver_id,
        reason=payload.reason or "DRIVER_DECLINED"
    )
    return {"success": success, "emergency_id": payload.emergency_id, "status": "DECLINED"}

@router.post("/transition", summary="Advance emergency state through strict state machine")
async def update_state_transition(payload: StateTransitionRequest, db: Session = Depends(get_db)):
    """
    Enforces the emergency lifecycle state machine:
    ACCEPTED -> EN_ROUTE -> ARRIVED -> PATIENT_ONBOARD -> TRANSPORTING -> COMPLETED
    """
    success, message, emg = transition_emergency_status(
        db=db,
        emergency_id=payload.emergency_id,
        target_status=payload.target_status,
        actor_id=payload.driver_id,
        actor_type="DRIVER",
        latitude=payload.latitude,
        longitude=payload.longitude,
        notes=payload.notes
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
        
    return {
        "success": True,
        "message": message,
        "emergency_id": emg.id,
        "status": emg.status
    }

@router.get("/alerts/{driver_id}", response_model=List[DriverAlertResponse], summary="Get pending dispatch alerts for a driver")
async def get_driver_alerts(driver_id: str, db: Session = Depends(get_db)):
    """
    Fetches active PENDING alerts for a specific driver.
    """
    alerts = db.query(DriverAlert).filter(
        DriverAlert.driver_id == driver_id,
        DriverAlert.status == "PENDING"
    ).order_by(DriverAlert.alerted_at.desc()).all()
    
    results: List[DriverAlertResponse] = []
    for a in alerts:
        emg = db.query(Emergency).filter(Emergency.id == a.emergency_id).first()
        if emg and emg.status in ("DRIVER_ALERTED", "DISPATCHING", "SEARCHING", "CREATED"):
            results.append(
                DriverAlertResponse(
                    id=a.id,
                    emergency_id=a.emergency_id,
                    driver_id=a.driver_id,
                    ambulance_id=a.ambulance_id,
                    status=a.status,
                    alerted_at=a.alerted_at,
                    emergency_code=emg.code,
                    incident_type=emg.incident_type,
                    severity=emg.severity,
                    latitude=emg.latitude,
                    longitude=emg.longitude,
                    description=emg.description
                )
            )
        elif emg and emg.status not in ("DRIVER_ALERTED", "DISPATCHING", "SEARCHING", "CREATED"):
            # Emergency was accepted by someone else; close this alert
            a.status = "CANCELLED"
            db.commit()
            
    return results
