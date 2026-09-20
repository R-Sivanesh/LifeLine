import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, JSON, Text, ForeignKey
from app.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class Emergency(Base):
    __tablename__ = "emergencies"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(255), nullable=True)
    description = Column(Text, nullable=False)
    incident_type = Column(String(100), default="MEDICAL_EMERGENCY")
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    patient_count = Column(Integer, default=1)
    critical_patient_count = Column(Integer, default=0)
    severity = Column(String(50), default="MEDIUM")  # LOW, MEDIUM, HIGH, CRITICAL
    status = Column(String(50), default="ACTIVE")   # ACTIVE, DISPATCHED, EN_ROUTE, ARRIVED, RESOLVED
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Ambulance(Base):
    __tablename__ = "ambulances"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    vehicle_number = Column(String(50), unique=True, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    status = Column(String(50), default="AVAILABLE")  # AVAILABLE, BUSY, OFFLINE
    capability = Column(String(50), default="BASIC")   # BASIC, ADVANCED, ICU
    equipment = Column(JSON, default=list)
    current_assignment_id = Column(String(36), nullable=True)
    eta_minutes = Column(Float, default=0.0)

class Hospital(Base):
    __tablename__ = "hospitals"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    emergency_available = Column(Boolean, default=True)
    trauma_capable = Column(Boolean, default=False)
    icu_available = Column(Boolean, default=True)
    available_beds = Column(Integer, default=10)
    specialities = Column(JSON, default=list)
    status = Column(String(50), default="OPEN")  # OPEN, LIMITED, CLOSED

class RoadIncident(Base):
    __tablename__ = "road_incidents"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    type = Column(String(50), default="ROAD_BLOCK")  # ACCIDENT, FLOOD, ROAD_BLOCK, CONSTRUCTION, CONGESTION, HAZARD
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    severity = Column(String(50), default="MEDIUM")  # LOW, MEDIUM, HIGH, CRITICAL
    description = Column(Text, nullable=True)
    radius_meters = Column(Integer, default=200)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Dispatch(Base):
    __tablename__ = "dispatches"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    emergency_id = Column(String(36), nullable=False)
    ambulance_id = Column(String(36), nullable=False)
    hospital_id = Column(String(36), nullable=False)
    selected_route = Column(JSON, nullable=True)
    estimated_ambulance_eta = Column(Float, default=0.0)
    estimated_hospital_eta = Column(Float, default=0.0)
    total_response_time = Column(Float, default=0.0)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class RouteEvent(Base):
    __tablename__ = "route_events"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    emergency_id = Column(String(36), nullable=False)
    event_type = Column(String(100), default="REROUTE")
    description = Column(Text, nullable=False)
    old_route = Column(JSON, nullable=True)
    new_route = Column(JSON, nullable=True)
    old_eta = Column(Float, default=0.0)
    new_eta = Column(Float, default=0.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
