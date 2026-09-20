from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import RoadIncident
from app.schemas import RouteCalculateRequest, RouteResponse, RouteRiskAnalysisRequest, RouteRiskResponse, RouteOption
from app.services.routing_service import fetch_mapbox_routes
from app.services.risk_service import analyze_route_risk

router = APIRouter(prefix="/routes", tags=["Routing"])

@router.post("/calculate", response_model=RouteResponse, summary="Calculate multi-option routes via Mapbox Directions API")
async def calculate_routes(payload: RouteCalculateRequest, db: Session = Depends(get_db)):
    raw_routes = await fetch_mapbox_routes(payload.origin, payload.destination)
    incidents = db.query(RoadIncident).filter(RoadIncident.active == True).all()
    
    assessed_routes = [analyze_route_risk(r, incidents) for r in raw_routes]
    return RouteResponse(routes=assessed_routes)

@router.post("/analyze", response_model=RouteRiskResponse, summary="Assess risk on specific route geometry against active incidents")
async def analyze_route(payload: RouteRiskAnalysisRequest, db: Session = Depends(get_db)):
    incidents = db.query(RoadIncident).filter(RoadIncident.active == True).all()
    
    mock_route = RouteOption(
        id=payload.route_id,
        name="Custom Route",
        distance_km=5.0,
        duration_minutes=10.0,
        geometry=payload.geometry
    )
    
    assessed = analyze_route_risk(mock_route, incidents)
    return RouteRiskResponse(
        route_id=assessed.id,
        risk_level=assessed.risk_level,
        incidents=assessed.incidents,
        adjusted_eta_minutes=assessed.adjusted_eta_minutes
    )
