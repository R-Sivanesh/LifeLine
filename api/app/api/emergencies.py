from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import Emergency, Ambulance, Hospital, RoadIncident, Dispatch
from app.schemas import (
    EmergencyCreate,
    EmergencyResponse,
    EmergencyStatusUpdate,
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

router = APIRouter(prefix="/emergencies", tags=["Emergencies"])

@router.post("", response_model=EmergencyResponse, status_code=status.HTTP_201_CREATED, summary="Create new emergency report")
async def create_emergency(payload: EmergencyCreate, db: Session = Depends(get_db)):
    # 1. Analyze description with AI / fallback parser
    analysis = await analyze_emergency_description(payload.description)
    
    # 2. Build Emergency model
    emg = Emergency(
        title=payload.title or f"{analysis.severity.capitalize()} {analysis.incident_type.replace('_', ' ').title()}",
        description=payload.description,
        incident_type=payload.incident_type or analysis.incident_type,
        latitude=payload.latitude,
        longitude=payload.longitude,
        patient_count=payload.patient_count if payload.patient_count is not None else analysis.patient_count,
        critical_patient_count=payload.critical_patient_count if payload.critical_patient_count is not None else analysis.critical_patient_count,
        severity=payload.severity or analysis.severity,
        status="ACTIVE"
    )
    db.add(emg)
    db.commit()
    db.refresh(emg)
    return emg

@router.get("", response_model=List[EmergencyResponse], summary="List all active and recent emergencies")
async def list_emergencies(db: Session = Depends(get_db)):
    return db.query(Emergency).order_by(Emergency.created_at.desc()).all()

@router.get("/{id}", response_model=EmergencyResponse, summary="Get emergency details by ID")
async def get_emergency(id: str, db: Session = Depends(get_db)):
    emg = db.query(Emergency).filter(Emergency.id == id).first()
    if not emg:
        raise HTTPException(status_code=404, detail="Emergency record not found")
    return emg

@router.patch("/{id}/status", response_model=EmergencyResponse, summary="Update emergency status")
async def update_emergency_status(id: str, payload: EmergencyStatusUpdate, db: Session = Depends(get_db)):
    emg = db.query(Emergency).filter(Emergency.id == id).first()
    if not emg:
        raise HTTPException(status_code=404, detail="Emergency record not found")
    emg.status = payload.status
    db.commit()
    db.refresh(emg)
    return emg

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
    
    # Save or update dispatch record
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
            reason=optimization_result.optimization_reason
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
        route=opt_result.selected_route
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
