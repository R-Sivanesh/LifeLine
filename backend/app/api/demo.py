import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.config import settings
from app.database import get_db
from app.models import RoadIncident, Emergency, Ambulance, Hospital, Dispatch, RouteEvent
from app.seed.demo_data import seed_database
from app.schemas import EmergencyResponse

router = APIRouter(prefix="/demo", tags=["Demo & Simulation"])

@router.post("/reset", summary="Reset and reseed demo environment safely")
async def reset_demo(db: Session = Depends(get_db)):
    """
    Safely resets demo accounts and simulated emergency cases.
    NEVER deletes real user profiles or production operational records.
    """
    if not settings.DEMO_MODE:
        raise HTTPException(
            status_code=403,
            detail="Demo reset is disabled when DEMO_MODE=false."
        )

    seed_database(db, force_reset=False, reset_only_demo=True)
    return {
        "status": "success",
        "message": "Demo state successfully reset. Real operational records remain untouched.",
        "demo_ambulances_count": db.query(Ambulance).filter(Ambulance.is_demo == True).count(),
        "demo_hospitals_count": db.query(Hospital).filter(Hospital.is_demo == True).count(),
        "total_ambulances_count": db.query(Ambulance).count()
    }

@router.post("/seed", summary="Seed initial demo dataset")
async def seed_demo(db: Session = Depends(get_db)):
    seed_database(db, force_reset=False)
    return {"status": "success", "message": "Demo dataset initialized."}

@router.post("/block-route", summary="Simulate dynamic road blockage on active transit path")
async def block_route(latitude: float = 13.0335, longitude: float = 80.2205, db: Session = Depends(get_db)):
    """
    Creates an active critical road blockage event near the primary route corridor
    to trigger the dynamic rerouting simulation.
    """
    blockage = RoadIncident(
        id=f"inc-block-{str(uuid.uuid4())[:8]}",
        type="ROAD_BLOCK",
        latitude=latitude,
        longitude=longitude,
        severity="CRITICAL",
        description="Flash road collapse & emergency water main burst blocking main arterial corridor",
        radius_meters=350,
        active=True
    )
    db.add(blockage)
    db.commit()
    db.refresh(blockage)
    
    return {
        "status": "blockage_created",
        "incident_id": blockage.id,
        "type": blockage.type,
        "location": {"latitude": blockage.latitude, "longitude": blockage.longitude},
        "description": blockage.description
    }

@router.post("/create-emergency", response_model=EmergencyResponse, summary="Instantly create hero demo emergency")
async def create_hero_emergency(db: Session = Depends(get_db)):
    hero_emg = db.query(Emergency).filter(Emergency.id == "emg-hero-001").first()
    if not hero_emg:
        hero_emg = Emergency(
            id="emg-hero-001",
            title="Critical Multi-Vehicle Collision",
            description="Three people injured in a road accident near the railway bridge. One person is unconscious.",
            incident_type="ROAD_ACCIDENT",
            latitude=13.0380,
            longitude=80.2300,
            patient_count=3,
            critical_patient_count=1,
            severity="CRITICAL",
            status="ACTIVE",
            is_demo=True,
            demo_type="HERO_DEMO"
        )
        db.add(hero_emg)
        db.commit()
        db.refresh(hero_emg)
    else:
        hero_emg.status = "ACTIVE"
        hero_emg.is_demo = True
        db.commit()
        db.refresh(hero_emg)
    return hero_emg

@router.get("/incidents", summary="Get all active road incidents")
async def get_road_incidents(db: Session = Depends(get_db)):
    incidents = db.query(RoadIncident).filter(RoadIncident.active == True).all()
    return incidents
