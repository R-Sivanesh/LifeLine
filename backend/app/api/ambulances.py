from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Ambulance
from app.schemas import (
    AmbulanceCreate,
    AmbulanceUpdate,
    AmbulanceResponse,
    LiveAmbulancesResponse,
    LiveAmbulanceGPSItem,
    AmbulanceTelemetryRequest
)
from app.services.ambulance_service import (
    get_live_ambulances_list,
    update_live_ambulance_telemetry
)

router = APIRouter(prefix="/ambulances", tags=["Ambulances"])

@router.get("/live", response_model=LiveAmbulancesResponse, summary="Get all connected live GPS ambulances with real-time freshness")
async def get_live_ambulances():
    """
    Returns real-time GPS ambulances streaming telemetry from the tracker page / Firebase.
    Freshness statuses: LIVE (<=30s), STALE (30-60s), OFFLINE (>60s).
    """
    live_list = get_live_ambulances_list()
    return LiveAmbulancesResponse(
        source="LIVE_GPS",
        status="LIVE" if any(a.freshness_status == "LIVE" for a in live_list) else "STANDBY",
        count=len(live_list),
        ambulances=live_list
    )

@router.post("/telemetry", response_model=LiveAmbulanceGPSItem, summary="Ingest real-time GPS telemetry from ambulance tracker")
async def ingest_ambulance_telemetry(payload: AmbulanceTelemetryRequest, db: Session = Depends(get_db)):
    """
    Ingests continuous high-accuracy GPS coordinates from mobile ambulance devices.
    Updates the live in-memory telemetry pool and synchronizes database status if matching record exists.
    """
    item = update_live_ambulance_telemetry(payload)
    
    # Optionally update database record if registered
    db_amb = db.query(Ambulance).filter(Ambulance.id == payload.id).first()
    if db_amb:
        db_amb.latitude = payload.latitude
        db_amb.longitude = payload.longitude
        db_amb.status = payload.status
        if payload.capability:
            db_amb.capability = payload.capability
        db.commit()
        
    return item

@router.get("", response_model=List[AmbulanceResponse], summary="List all ambulances in database")
async def list_ambulances(db: Session = Depends(get_db)):
    return db.query(Ambulance).all()

@router.get("/available", response_model=List[AmbulanceResponse], summary="List available ambulances")
async def list_available_ambulances(db: Session = Depends(get_db)):
    return db.query(Ambulance).filter(Ambulance.status == "AVAILABLE").all()

@router.get("/{id}", response_model=AmbulanceResponse, summary="Get ambulance by ID")
async def get_ambulance(id: str, db: Session = Depends(get_db)):
    amb = db.query(Ambulance).filter(Ambulance.id == id).first()
    if not amb:
        raise HTTPException(status_code=404, detail="Ambulance not found")
    return amb

@router.post("", response_model=AmbulanceResponse, status_code=status.HTTP_201_CREATED, summary="Register new ambulance")
async def create_ambulance(payload: AmbulanceCreate, db: Session = Depends(get_db)):
    amb = Ambulance(
        vehicle_number=payload.vehicle_number,
        latitude=payload.latitude,
        longitude=payload.longitude,
        capability=payload.capability,
        equipment=payload.equipment,
        status=payload.status
    )
    db.add(amb)
    db.commit()
    db.refresh(amb)
    return amb

@router.patch("/{id}", response_model=AmbulanceResponse, summary="Update ambulance telemetry/status")
async def update_ambulance(id: str, payload: AmbulanceUpdate, db: Session = Depends(get_db)):
    amb = db.query(Ambulance).filter(Ambulance.id == id).first()
    if not amb:
        raise HTTPException(status_code=404, detail="Ambulance not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(amb, key, value)
        
    db.commit()
    db.refresh(amb)
    return amb
