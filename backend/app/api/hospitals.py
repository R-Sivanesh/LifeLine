from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import Hospital
from app.schemas import HospitalCreate, HospitalResponse, NearbyHospitalsResponse, NearbyHospitalItem
from app.services.google_places_service import discover_nearby_hospitals_places
from app.config import settings

router = APIRouter(prefix="/hospitals", tags=["Hospitals"])

@router.get("", response_model=List[HospitalResponse], summary="List all hospitals in database")
async def list_hospitals(db: Session = Depends(get_db)):
    return db.query(Hospital).all()

@router.get("/available", response_model=List[HospitalResponse], summary="List open emergency hospitals")
async def list_available_hospitals(db: Session = Depends(get_db)):
    return db.query(Hospital).filter(Hospital.emergency_available == True, Hospital.status != "CLOSED").all()

@router.get("/nearby", response_model=NearbyHospitalsResponse, summary="Discover nearby real hospital facilities via Google Places API (New)")
async def get_nearby_hospitals(
    lat: Optional[float] = Query(None, description="Latitude of user location"),
    lng: Optional[float] = Query(None, description="Longitude of user location"),
    latitude: Optional[float] = Query(None, description="Latitude alias"),
    longitude: Optional[float] = Query(None, description="Longitude alias"),
    radius: float = Query(8000.0, description="Search radius in meters")
):
    """
    Discovers real-world nearby hospitals using Google Places API (New) Nearby Search.
    
    Data Honesty:
    - Location data is LIVE from Google Places.
    - Capacity and clinical fields are marked UNKNOWN.
    - Fails with 400 if user location is not provided.
    """
    target_lat = lat if lat is not None else latitude
    target_lng = lng if lng is not None else longitude
    
    if target_lat is None or target_lng is None or (target_lat == 0.0 and target_lng == 0.0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Location required before searching nearby hospitals."
        )
    
    places, source, status_val, err = await discover_nearby_hospitals_places(
        latitude=target_lat,
        longitude=target_lng,
        radius_meters=radius,
        is_demo_mode=settings.DEMO_MODE
    )
    
    hospital_items = [NearbyHospitalItem(**p) for p in places]
    
    return NearbyHospitalsResponse(
        source=source,
        status=status_val,
        hospitals=hospital_items,
        error=err
    )

@router.get("/{id}", response_model=HospitalResponse, summary="Get hospital by ID")
async def get_hospital(id: str, db: Session = Depends(get_db)):
    hosp = db.query(Hospital).filter(Hospital.id == id).first()
    if not hosp:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return hosp

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
