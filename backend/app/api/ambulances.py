from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Ambulance
from app.schemas import AmbulanceCreate, AmbulanceUpdate, AmbulanceResponse

router = APIRouter(prefix="/ambulances", tags=["Ambulances"])

@router.get("", response_model=List[AmbulanceResponse], summary="List all ambulances")
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
    
    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(amb, key, value)
        
    db.commit()
    db.refresh(amb)
    return amb
