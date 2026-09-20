from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import RoadIncident
from app.schemas import RouteCalculateRequest, RouteResponse, RouteRiskAnalysisRequest, RouteRiskResponse, RouteOption
from app.services.google_routes_service import compute_google_routes
from app.services.routing_service import fetch_mapbox_routes
from app.services.risk_service import analyze_route_risk

router = APIRouter(prefix="/routes", tags=["Routing"])

@router.post("/calculate", response_model=RouteResponse, summary="Calculate multi-option traffic-aware routes")
async def calculate_routes(payload: RouteCalculateRequest, db: Session = Depends(get_db)):
    raw_routes, source, status_val = await compute_google_routes(payload.origin, payload.destination, "TRAFFIC_AWARE")
    incidents = db.query(RoadIncident).filter(RoadIncident.active == True).all()
    
    assessed_routes = [analyze_route_risk(r, incidents) for r in raw_routes]
    return RouteResponse(routes=assessed_routes)

@router.get("/live", summary="Get live traffic route between coordinates")
async def get_live_route(orig_lat: float, orig_lon: float, dest_lat: float, dest_lon: float, db: Session = Depends(get_db)):
    origin = Coordinate(latitude=orig_lat, longitude=orig_lon)
    destination = Coordinate(latitude=dest_lat, longitude=dest_lon)
    raw_routes, source, status_val = await compute_google_routes(origin, destination, "TRAFFIC_AWARE")
    incidents = db.query(RoadIncident).filter(RoadIncident.active == True).all()
    assessed = [analyze_route_risk(r, incidents) for r in raw_routes]
    return {
        "routes": assessed,
        "source": source,
        "status": status_val
    }

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
