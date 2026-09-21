import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import Driver, Ambulance
from app.schemas import (
    DriverGoogleAuthRequest,
    DriverAuthResponse,
    DriverResponse,
    DriverStatusUpdate,
    AmbulanceResponse
)

router = APIRouter(prefix="/auth", tags=["Authentication & Driver Fleet"])

@router.post("/google-login", response_model=DriverAuthResponse, summary="Driver/Operator Google Authentication")
async def driver_google_login(payload: DriverGoogleAuthRequest, db: Session = Depends(get_db)):
    """
    Authenticates a driver or operations operator via Google credentials.
    Creates or synchronizes driver profile and returns session token.
    """
    now = datetime.now(timezone.utc)
    email = payload.email.strip().lower()
    
    driver = db.query(Driver).filter(Driver.email == email).first()
    if not driver:
        # Register new driver
        driver = Driver(
            google_id=payload.google_id or f"goog_{secrets.token_hex(8)}",
            name=payload.name,
            email=email,
            phone=payload.phone,
            role=payload.role,
            assigned_ambulance_id=payload.ambulance_id or "A-103",
            status="AVAILABLE",
            last_active_at=now,
            created_at=now
        )
        db.add(driver)
        db.commit()
        db.refresh(driver)
    else:
        driver.name = payload.name
        if payload.google_id:
            driver.google_id = payload.google_id
        if payload.ambulance_id:
            driver.assigned_ambulance_id = payload.ambulance_id
        driver.status = "AVAILABLE"
        driver.last_active_at = now
        db.commit()
        db.refresh(driver)
        
    # Find linked ambulance if assigned
    amb = None
    if driver.assigned_ambulance_id:
        amb_model = db.query(Ambulance).filter(
            (Ambulance.id == driver.assigned_ambulance_id) | (Ambulance.vehicle_number == driver.assigned_ambulance_id)
        ).first()
        if amb_model:
            amb = AmbulanceResponse.model_validate(amb_model)
            
    token = f"ll_drv_{secrets.token_urlsafe(32)}"
    
    return DriverAuthResponse(
        driver=DriverResponse.model_validate(driver),
        token=token,
        ambulance=amb
    )

@router.get("/me", response_model=DriverResponse, summary="Get current authenticated driver profile")
async def get_current_driver(driver_id: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Retrieves authenticated driver profile.
    """
    if not driver_id:
        driver = db.query(Driver).first()
    else:
        driver = db.query(Driver).filter(Driver.id == driver_id).first()
        
    if not driver:
        raise HTTPException(status_code=404, detail="Driver record not found")
        
    return driver

@router.post("/driver-status", response_model=DriverResponse, summary="Update driver operational readiness and GPS")
async def update_driver_status(
    driver_id: str,
    payload: DriverStatusUpdate,
    db: Session = Depends(get_db)
):
    """
    Updates driver operational state (AVAILABLE, EN_ROUTE, ON_SCENE, OFFLINE) and current location.
    """
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
        
    driver.status = payload.status
    if payload.latitude is not None and payload.longitude is not None:
        driver.latitude = payload.latitude
        driver.longitude = payload.longitude
    driver.last_active_at = datetime.now(timezone.utc)
    
    # Synchronize linked ambulance status if available
    if driver.assigned_ambulance_id:
        amb = db.query(Ambulance).filter(
            (Ambulance.id == driver.assigned_ambulance_id) | (Ambulance.vehicle_number == driver.assigned_ambulance_id)
        ).first()
        if amb:
            amb.status = payload.status
            if payload.latitude is not None and payload.longitude is not None:
                amb.latitude = payload.latitude
                amb.longitude = payload.longitude
                amb.last_gps_at = datetime.now(timezone.utc)
                
    db.commit()
    db.refresh(driver)
    return driver

@router.get("/drivers", response_model=List[DriverResponse], summary="List all registered response drivers")
async def list_registered_drivers(db: Session = Depends(get_db)):
    """
    Lists all registered drivers and operational statuses.
    """
    return db.query(Driver).order_by(Driver.last_active_at.desc()).all()
