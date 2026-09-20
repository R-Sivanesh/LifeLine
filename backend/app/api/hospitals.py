from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Hospital
from app.schemas import HospitalCreate, HospitalResponse

router = APIRouter(prefix="/hospitals", tags=["Hospitals"])

@router.get("", response_model=List[HospitalResponse], summary="List all hospitals")
async def list_hospitals(db: Session = Depends(get_db)):
    return db.query(Hospital).all()

@router.get("/available", response_model=List[HospitalResponse], summary="List open emergency hospitals")
async def list_available_hospitals(db: Session = Depends(get_db)):
    return db.query(Hospital).filter(Hospital.emergency_available == True, Hospital.status != "CLOSED").all()

@router.get("/{id}", response_model=HospitalResponse, summary="Get hospital by ID")
async def get_hospital(id: str, db: Session = Depends(get_db)):
    hosp = db.query(Hospital).filter(Hospital.id == id).first()
    if not hosp:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return hosp

@router.get("/nearby", summary="Discover nearby hospital facilities via Google Places")
async def get_nearby_hospitals(latitude: float = 13.0380, longitude: float = 80.2300, radius: int = 8000):
    from app.services.google_places_service import discover_nearby_hospitals_places
    places, source, status_val = await discover_nearby_hospitals_places(latitude, longitude, radius)
    return {
        "hospitals": places,
        "source": source,
        "status": status_val
    }

@router.post("", response_model=HospitalResponse, status_code=status.HTTP_201_CREATED, summary="Register hospital")
async def create_hospital(payload: HospitalCreate, db: Session = Depends(get_db)):
    hosp = Hospital(
        name=payload.name,
        latitude=payload.latitude,
        longitude=payload.longitude,
        emergency_available=payload.emergency_available,
        trauma_capable=payload.trauma_capable,
        icu_available=payload.icu_available,
        available_beds=payload.available_beds,
        specialities=payload.specialities,
        status=payload.status
    )
    db.add(hosp)
    db.commit()
    db.refresh(hosp)
    return hosp
