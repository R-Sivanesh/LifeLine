import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import Driver, Ambulance
from app.config import settings
from app.schemas import (
    DriverGoogleAuthRequest,
    DriverAuthResponse,
    DriverResponse,
    DriverStatusUpdate,
    AmbulanceResponse,
    SendOtpRequest,
    SendOtpResponse,
    VerifyOtpRequest,
    VerifyOtpResponse,
    DemoLoginRequest,
    DemoStatusResponse
)
from app.services.otp_service import otp_service

router = APIRouter(prefix="/auth", tags=["Authentication & Driver Fleet"])

@router.get("/demo-status", response_model=DemoStatusResponse, summary="Get environment demo mode status")
async def get_demo_status():
    """
    Returns whether DEMO_MODE is enabled in the current deployment environment.
    """
    return DemoStatusResponse(demo_mode=settings.DEMO_MODE)

@router.post("/demo-login", response_model=DriverAuthResponse, summary="Authenticate Demo Driver or Demo Hospital Staff")
async def demo_login(payload: DemoLoginRequest, db: Session = Depends(get_db)):
    """
    Authenticates a demo unit (Demo Driver A, Demo Driver B, Demo ER Staff).
    STRICT SECURITY RULE: Rejects immediately if DEMO_MODE=False in environment.
    """
    if not settings.DEMO_MODE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo authentication is disabled in this environment (DEMO_MODE=false)."
        )

    now = datetime.now(timezone.utc)
    demo_id = payload.demo_id.lower().strip()

    if "driver-b" in demo_id or demo_id == "drv-demo-002":
        target_driver_id = "drv-demo-002"
        target_email = "demo.driver.b@lifeline.org"
        target_name = "Demo Driver B"
        target_role = "DRIVER"
        target_amb_id = "amb-demo-002"
        target_lat = 13.0305
        target_lng = 80.2250
    elif "hospital" in demo_id or demo_id == "staff-demo-001":
        target_driver_id = "staff-demo-001"
        target_email = "demo.hospital@lifeline.org"
        target_name = "Demo ER Staff"
        target_role = "HOSPITAL_STAFF"
        target_amb_id = None
        target_lat = 13.0100
        target_lng = 80.2120
    else:
        # Default to Demo Driver A
        target_driver_id = "drv-demo-001"
        target_email = "demo.driver.a@lifeline.org"
        target_name = "Demo Driver A"
        target_role = "DRIVER"
        target_amb_id = "amb-demo-001"
        target_lat = 13.0425
        target_lng = 80.2410

    driver = db.query(Driver).filter((Driver.id == target_driver_id) | (Driver.email == target_email)).first()
    if not driver:
        driver = Driver(
            id=target_driver_id,
            google_id=f"demo_goog_{target_driver_id}",
            name=target_name,
            email=target_email,
            phone="+91 98401 00001" if target_role == "DRIVER" else "+91 98402 00001",
            phone_verified=True,
            otp_verified_at=now,
            role=target_role,
            assigned_ambulance_id=target_amb_id,
            status="AVAILABLE",
            latitude=target_lat,
            longitude=target_lng,
            is_demo=True,
            demo_type=f"DEMO_{target_role}",
            last_active_at=now,
            created_at=now
        )
        db.add(driver)
        db.commit()
        db.refresh(driver)
    else:
        driver.status = "AVAILABLE"
        driver.last_active_at = now
        driver.is_demo = True
        db.commit()
        db.refresh(driver)

    amb = None
    if driver.assigned_ambulance_id:
        amb_model = db.query(Ambulance).filter(
            (Ambulance.id == driver.assigned_ambulance_id) | (Ambulance.vehicle_number == driver.assigned_ambulance_id)
        ).first()
        if not amb_model:
            amb_model = Ambulance(
                id=driver.assigned_ambulance_id,
                vehicle_number="LL-DEMO-AMB-001" if "001" in driver.assigned_ambulance_id else "LL-DEMO-AMB-002",
                latitude=target_lat,
                longitude=target_lng,
                capability="ADVANCED" if "001" in driver.assigned_ambulance_id else "BASIC",
                status="AVAILABLE",
                is_demo=True,
                demo_type="DEMO_FLEET",
                last_gps_at=now,
                created_at=now
            )
            db.add(amb_model)
            db.commit()
            db.refresh(amb_model)
        amb = AmbulanceResponse.model_validate(amb_model)

    token = f"ll_demo_{secrets.token_urlsafe(32)}"

    return DriverAuthResponse(
        driver=DriverResponse.model_validate(driver),
        token=token,
        ambulance=amb
    )

@router.post("/send-otp", response_model=SendOtpResponse, summary="Send Mobile OTP Verification Code")
async def send_otp(payload: SendOtpRequest):
    """
    Generates a cryptographically secure 6-digit OTP, creates a salted HMAC-SHA256 hash,
    enforces a 60-second resend cooldown, and dispatches via SMS service.
    Raw OTP is NEVER stored in plaintext.
    """
    clean_phone = payload.phone.strip()
    if not clean_phone or len(clean_phone) < 8:
        raise HTTPException(status_code=400, detail="Invalid mobile phone number format.")
        
    success, message, cooldown = otp_service.generate_and_send_otp(clean_phone, payload.role)
    if not success:
        raise HTTPException(status_code=429, detail=message)
        
    return SendOtpResponse(
        success=True,
        message=message,
        cooldown_seconds=cooldown
    )

@router.post("/verify-otp", response_model=VerifyOtpResponse, summary="Verify Mobile OTP & Authenticate Session")
async def verify_otp(payload: VerifyOtpRequest, db: Session = Depends(get_db)):
    """
    Validates entered OTP against salted hash with max 3 attempts and expiration checks.
    Upon verification, updates or creates user profile and returns verified bearer token.
    """
    clean_phone = payload.phone.strip()
    success, msg = otp_service.verify_otp(clean_phone, payload.otp)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
        
    now = datetime.now(timezone.utc)
    email = (payload.email or f"user_{clean_phone[-4:]}@lifeline.org").strip().lower()
    
    # Locate or create user/driver record
    driver = db.query(Driver).filter((Driver.phone == clean_phone) | (Driver.email == email)).first()
    
    if not driver:
        driver = Driver(
            google_id=payload.google_id or f"auth_{secrets.token_hex(8)}",
            name=payload.name or f"LifeLine {payload.role.replace('_', ' ').title()}",
            email=email,
            phone=clean_phone,
            phone_verified=True,
            otp_verified_at=now,
            role=payload.role,
            assigned_ambulance_id=payload.ambulance_id or ("A-103" if payload.role == "DRIVER" else None),
            status="AVAILABLE",
            last_active_at=now,
            created_at=now
        )
        db.add(driver)
        db.commit()
        db.refresh(driver)
    else:
        if payload.name:
            driver.name = payload.name
        if payload.google_id:
            driver.google_id = payload.google_id
        if payload.role:
            driver.role = payload.role
        if payload.ambulance_id:
            driver.assigned_ambulance_id = payload.ambulance_id
        driver.phone = clean_phone
        driver.phone_verified = True
        driver.otp_verified_at = now
        driver.last_active_at = now
        db.commit()
        db.refresh(driver)
        
    # Find linked ambulance if driver role
    amb = None
    if driver.assigned_ambulance_id:
        amb_model = db.query(Ambulance).filter(
            (Ambulance.id == driver.assigned_ambulance_id) | (Ambulance.vehicle_number == driver.assigned_ambulance_id)
        ).first()
        if amb_model:
            amb = AmbulanceResponse.model_validate(amb_model)
            
    token = f"ll_auth_{secrets.token_urlsafe(32)}"
    
    return VerifyOtpResponse(
        success=True,
        message="Phone number successfully verified. Session established.",
        token=token,
        driver=DriverResponse.model_validate(driver),
        ambulance=amb
    )

@router.post("/google-login", response_model=DriverAuthResponse, summary="Driver/Operator Google Authentication")
async def driver_google_login(payload: DriverGoogleAuthRequest, db: Session = Depends(get_db)):
    """
    Authenticates a driver, hospital staff, or operations operator via Google credentials.
    Creates or synchronizes profile.
    """
    now = datetime.now(timezone.utc)
    email = payload.email.strip().lower()
    
    driver = db.query(Driver).filter(Driver.email == email).first()
    if not driver:
        # Register new profile
        driver = Driver(
            google_id=payload.google_id or f"goog_{secrets.token_hex(8)}",
            name=payload.name,
            email=email,
            phone=payload.phone,
            phone_verified=bool(payload.phone and otp_service.is_phone_verified(payload.phone)),
            role=payload.role,
            assigned_ambulance_id=payload.ambulance_id or ("A-103" if payload.role == "DRIVER" else None),
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
        if payload.role:
            driver.role = payload.role
        if payload.phone:
            driver.phone = payload.phone
            if otp_service.is_phone_verified(payload.phone):
                driver.phone_verified = True
                driver.otp_verified_at = now
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

@router.get("/me", response_model=DriverResponse, summary="Get current authenticated user profile")
async def get_current_driver(driver_id: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Retrieves authenticated driver / operator profile.
    """
    if not driver_id:
        driver = db.query(Driver).first()
    else:
        driver = db.query(Driver).filter(Driver.id == driver_id).first()
        
    if not driver:
        raise HTTPException(status_code=404, detail="User record not found")
        
    return driver

@router.post("/driver-status", response_model=DriverResponse, summary="Update driver operational readiness and GPS")
async def update_driver_status(
    driver_id: str,
    payload: DriverStatusUpdate,
    db: Session = Depends(get_db)
):
    """
    Updates driver operational state (AVAILABLE, EN_ROUTE, ON_SCENE, PATIENT_ONBOARD, TRANSPORTING, OFFLINE) and current location.
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

@router.get("/drivers", response_model=List[DriverResponse], summary="List all registered response units / staff")
async def list_registered_drivers(db: Session = Depends(get_db)):
    """
    Lists all registered drivers and operational statuses.
    """
    return db.query(Driver).order_by(Driver.last_active_at.desc()).all()
