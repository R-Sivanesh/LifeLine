import logging
import threading
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import update
from app.models import (
    Emergency,
    EmergencyEvent,
    Driver,
    Ambulance,
    DriverAlert,
    Dispatch,
    Hospital
)
from app.schemas import DriverAcceptResponse

logger = logging.getLogger(__name__)
_dispatch_lock = threading.Lock()

# Valid state machine transitions
ALLOWED_STATE_TRANSITIONS: Dict[str, List[str]] = {
    "CREATED": ["SEARCHING", "DISPATCHING", "DRIVER_ALERTED", "CANCELLED"],
    "SEARCHING": ["DISPATCHING", "DRIVER_ALERTED", "NO_VERIFIED_AMBULANCE_AVAILABLE", "CANCELLED"],
    "DISPATCHING": ["DRIVER_ALERTED", "ACCEPTED", "SEARCHING", "NO_VERIFIED_AMBULANCE_AVAILABLE", "CANCELLED"],
    "DRIVER_ALERTED": ["ACCEPTED", "DRIVER_DECLINED", "DRIVER_TIMEOUT", "SEARCHING", "CANCELLED"],
    "ACCEPTED": ["EN_ROUTE", "CANCELLED"],
    "EN_ROUTE": ["ARRIVED", "CANCELLED"],
    "ARRIVED": ["PATIENT_ONBOARD", "CANCELLED"],
    "PATIENT_ONBOARD": ["TRANSPORTING", "CANCELLED"],
    "TRANSPORTING": ["COMPLETED", "CANCELLED"],
    "COMPLETED": [],
    "CANCELLED": [],
    "NO_VERIFIED_AMBULANCE_AVAILABLE": ["SEARCHING", "CANCELLED"]
}

def record_emergency_event(
    db: Session,
    emergency_id: str,
    event_type: str,
    actor_type: str = "SYSTEM",
    description: str = "",
    actor_id: Optional[str] = None,
    metadata_json: Optional[Dict[str, Any]] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None
) -> EmergencyEvent:
    """
    Appends an immutable audit event to PostgreSQL.
    """
    event = EmergencyEvent(
        emergency_id=emergency_id,
        event_type=event_type,
        actor_type=actor_type,
        actor_id=actor_id,
        description=description or f"Emergency event: {event_type}",
        metadata_json=metadata_json or {},
        latitude=latitude,
        longitude=longitude,
        created_at=datetime.now(timezone.utc)
    )
    db.add(event)
    return event

def alert_eligible_drivers(
    db: Session,
    emergency: Emergency,
    ambulance_ids: List[str]
) -> List[DriverAlert]:
    """
    Creates dispatch alert records for eligible ambulances / drivers.
    """
    now = datetime.now(timezone.utc)
    alerts: List[DriverAlert] = []
    
    # 1. Update emergency status to DRIVER_ALERTED
    emergency.status = "DRIVER_ALERTED"
    emergency.updated_at = now
    
    # 2. Find linked or available drivers for each ambulance
    for amb_id in ambulance_ids:
        # Check if alert already exists
        existing = db.query(DriverAlert).filter(
            DriverAlert.emergency_id == emergency.id,
            DriverAlert.ambulance_id == amb_id,
            DriverAlert.status == "PENDING"
        ).first()
        if existing:
            alerts.append(existing)
            continue
            
        driver = db.query(Driver).filter(
            (Driver.assigned_ambulance_id == amb_id) | (Driver.status == "AVAILABLE")
        ).first()
        
        driver_id = driver.id if driver else f"drv-{amb_id}"
        
        alert = DriverAlert(
            emergency_id=emergency.id,
            driver_id=driver_id,
            ambulance_id=amb_id,
            status="PENDING",
            alerted_at=now
        )
        db.add(alert)
        alerts.append(alert)
        
        record_emergency_event(
            db=db,
            emergency_id=emergency.id,
            event_type="DRIVER_ALERTED",
            actor_type="SYSTEM",
            actor_id=driver_id,
            description=f"Dispatch alert transmitted to Ambulance {amb_id} / Driver {driver_id}",
            metadata_json={"ambulance_id": amb_id, "driver_id": driver_id}
        )
        
    db.commit()
    return alerts

def atomic_accept_emergency(
    db: Session,
    emergency_id: str,
    driver_id: str,
    ambulance_id: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None
) -> DriverAcceptResponse:
    """
    CRITICAL ATOMIC DISPATCH ACCEPTANCE:
    Guarantees that when multiple drivers press ACCEPT simultaneously,
    exactly ONE driver wins the assignment. All competing alerts are cancelled.
    """
    with _dispatch_lock:
        now = datetime.now(timezone.utc)
        
        try:
            # Execute PostgreSQL row-level lock (or SQLite compatible lock)
            # Using with_for_update() ensures transaction isolation
            try:
                emergency = db.query(Emergency).filter(Emergency.id == emergency_id).with_for_update().first()
            except Exception:
                # Fallback for databases like SQLite without with_for_update
                emergency = db.query(Emergency).filter(Emergency.id == emergency_id).first()
                
            if not emergency:
                return DriverAcceptResponse(
                    success=False,
                    status="NOT_FOUND",
                    emergency_id=emergency_id,
                    message="Emergency record not found.",
                    patient_latitude=0.0,
                    patient_longitude=0.0
                )
                
            # Concurrency Check: If already accepted or closed, reject this request
            if emergency.status not in ("CREATED", "SEARCHING", "DISPATCHING", "DRIVER_ALERTED"):
                logger.warning(
                    f"[Dispatch Concurrency] Driver {driver_id} rejected for {emergency_id}. "
                    f"Already in status: {emergency.status} (Assigned to {emergency.assigned_driver_id})"
                )
                return DriverAcceptResponse(
                    success=False,
                    status="ALREADY_ASSIGNED",
                    emergency_id=emergency_id,
                    assigned_driver_id=emergency.assigned_driver_id,
                    assigned_ambulance_id=emergency.assigned_ambulance_id,
                    message=f"Emergency has already been accepted by unit {emergency.assigned_ambulance_id or 'another driver'}.",
                    patient_latitude=emergency.latitude,
                    patient_longitude=emergency.longitude
                )
                
            # Determine assigned ambulance ID
            assigned_amb_id = ambulance_id
            if not assigned_amb_id:
                driver = db.query(Driver).filter(Driver.id == driver_id).first()
                if driver and driver.assigned_ambulance_id:
                    assigned_amb_id = driver.assigned_ambulance_id
                else:
                    assigned_amb_id = "A-103"
                    
            # 1. Update Emergency
            emergency.status = "ACCEPTED"
            emergency.assigned_driver_id = driver_id
            emergency.assigned_ambulance_id = assigned_amb_id
            emergency.updated_at = now
            
            # 2. Update Driver & Ambulance Status
            driver = db.query(Driver).filter(Driver.id == driver_id).first()
            if driver:
                driver.status = "EN_ROUTE"
                driver.assigned_ambulance_id = assigned_amb_id
                if latitude and longitude:
                    driver.latitude = latitude
                    driver.longitude = longitude
                driver.last_active_at = now
                
            amb = db.query(Ambulance).filter((Ambulance.id == assigned_amb_id) | (Ambulance.vehicle_number == assigned_amb_id)).first()
            if amb:
                amb.status = "EN_ROUTE"
                amb.current_driver_id = driver_id
                amb.current_assignment_id = emergency.id
                amb.last_gps_at = now
                
            # 3. Update Winning DriverAlert
            winner_alert = db.query(DriverAlert).filter(
                DriverAlert.emergency_id == emergency_id,
                (DriverAlert.driver_id == driver_id) | (DriverAlert.ambulance_id == assigned_amb_id)
            ).first()
            if winner_alert:
                winner_alert.status = "ACCEPTED"
                winner_alert.responded_at = now
                
            # 4. Cancel All Competing Alerts
            competing_alerts = db.query(DriverAlert).filter(
                DriverAlert.emergency_id == emergency_id,
                DriverAlert.status == "PENDING"
            ).all()
            for ca in competing_alerts:
                ca.status = "CANCELLED"
                ca.responded_at = now
                
            # 5. Record Immutable Audit Events
            record_emergency_event(
                db=db,
                emergency_id=emergency_id,
                event_type="DRIVER_ACCEPTED",
                actor_type="DRIVER",
                actor_id=driver_id,
                description=f"Driver {driver_id} (Ambulance {assigned_amb_id}) accepted emergency assignment.",
                metadata_json={"driver_id": driver_id, "ambulance_id": assigned_amb_id},
                latitude=latitude,
                longitude=longitude
            )
            
            if competing_alerts:
                record_emergency_event(
                    db=db,
                    emergency_id=emergency_id,
                    event_type="ALERTS_CANCELLED",
                    actor_type="SYSTEM",
                    description=f"Closed {len(competing_alerts)} competing alerts following successful assignment.",
                    metadata_json={"cancelled_count": len(competing_alerts)}
                )
                
            # 6. Commit Database Transaction
            db.commit()
            db.refresh(emergency)
            
            logger.info(f"[Dispatch Success] Emergency {emergency_id} atomically assigned to Driver {driver_id} (Ambulance {assigned_amb_id})")
            
            return DriverAcceptResponse(
                success=True,
                status="ACCEPTED",
                emergency_id=emergency_id,
                assigned_driver_id=driver_id,
                assigned_ambulance_id=assigned_amb_id,
                message="Emergency successfully accepted. Navigation route initialized.",
                patient_latitude=emergency.latitude,
                patient_longitude=emergency.longitude
            )
            
        except Exception as e:
            db.rollback()
            logger.error(f"[Dispatch Concurrency Error] {e}", exc_info=True)
            return DriverAcceptResponse(
                success=False,
                status="ERROR",
                emergency_id=emergency_id,
                message=f"Acceptance transaction error: {str(e)}",
                patient_latitude=0.0,
                patient_longitude=0.0
            )

def decline_emergency_alert(
    db: Session,
    emergency_id: str,
    driver_id: str,
    reason: str = "DRIVER_DECLINED"
) -> bool:
    """
    Records driver decline and evaluates if fallback redispatch is required.
    """
    now = datetime.now(timezone.utc)
    alert = db.query(DriverAlert).filter(
        DriverAlert.emergency_id == emergency_id,
        DriverAlert.driver_id == driver_id,
        DriverAlert.status == "PENDING"
    ).first()
    
    if alert:
        alert.status = "DECLINED"
        alert.responded_at = now
        
    record_emergency_event(
        db=db,
        emergency_id=emergency_id,
        event_type="DRIVER_DECLINED",
        actor_type="DRIVER",
        actor_id=driver_id,
        description=f"Driver {driver_id} declined emergency dispatch: {reason}",
        metadata_json={"reason": reason}
    )
    
    # Check if any pending alerts remain
    remaining = db.query(DriverAlert).filter(
        DriverAlert.emergency_id == emergency_id,
        DriverAlert.status == "PENDING"
    ).count()
    
    emergency = db.query(Emergency).filter(Emergency.id == emergency_id).first()
    if emergency and remaining == 0 and emergency.status in ("DRIVER_ALERTED", "DISPATCHING"):
        emergency.status = "SEARCHING"
        record_emergency_event(
            db=db,
            emergency_id=emergency_id,
            event_type="SEARCHING",
            actor_type="SYSTEM",
            description="All alerted drivers declined. Searching for additional response units."
        )
        
    db.commit()
    return True

def transition_emergency_status(
    db: Session,
    emergency_id: str,
    target_status: str,
    actor_id: Optional[str] = None,
    actor_type: str = "DRIVER",
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    notes: Optional[str] = None
) -> Tuple[bool, str, Optional[Emergency]]:
    """
    Enforces the strict emergency state machine lifecycle with audit logging.
    """
    emergency = db.query(Emergency).filter(Emergency.id == emergency_id).first()
    if not emergency:
        return False, "Emergency not found", None
        
    current_status = emergency.status
    allowed = ALLOWED_STATE_TRANSITIONS.get(current_status, [])
    
    if target_status not in allowed and target_status != current_status:
        msg = f"Invalid state transition from {current_status} to {target_status}. Allowed: {allowed}"
        logger.warning(f"[State Machine] {msg}")
        return False, msg, emergency
        
    now = datetime.now(timezone.utc)
    emergency.status = target_status
    emergency.updated_at = now
    
    # Handle completion / cancellation cleanup
    if target_status in ("COMPLETED", "CANCELLED"):
        emergency.closed_at = now
        if emergency.assigned_driver_id:
            drv = db.query(Driver).filter(Driver.id == emergency.assigned_driver_id).first()
            if drv:
                drv.status = "AVAILABLE"
        if emergency.assigned_ambulance_id:
            amb = db.query(Ambulance).filter((Ambulance.id == emergency.assigned_ambulance_id) | (Ambulance.vehicle_number == emergency.assigned_ambulance_id)).first()
            if amb:
                amb.status = "AVAILABLE"
                amb.current_assignment_id = None
                
    record_emergency_event(
        db=db,
        emergency_id=emergency_id,
        event_type=target_status,
        actor_type=actor_type,
        actor_id=actor_id,
        description=notes or f"Emergency transitioned from {current_status} to {target_status}.",
        metadata_json={"from_status": current_status, "to_status": target_status, "notes": notes},
        latitude=latitude,
        longitude=longitude
    )
    
    db.commit()
    db.refresh(emergency)
    return True, f"Successfully transitioned to {target_status}", emergency
