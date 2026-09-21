import uuid
import secrets
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, JSON, Text, ForeignKey, Index
from app.database import Base

def generate_uuid():
    return str(uuid.uuid4())

def generate_session_code():
    # E.g. EMG-8F72A
    return f"EMG-{secrets.token_hex(3).upper()}"

def generate_session_token():
    return f"ll_sess_{secrets.token_urlsafe(32)}"

class EmergencySession(Base):
    __tablename__ = "emergency_sessions"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_token = Column(String(128), unique=True, nullable=False, default=generate_session_token, index=True)
    session_code = Column(String(32), unique=True, nullable=False, default=generate_session_code, index=True)
    emergency_id = Column(String(36), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True)
    ip_hash = Column(String(64), nullable=True)

class Driver(Base):
    __tablename__ = "drivers"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    google_id = Column(String(128), unique=True, nullable=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    phone = Column(String(50), nullable=True)
    phone_verified = Column(Boolean, default=False)
    otp_verified_at = Column(DateTime, nullable=True)
    role = Column(String(50), default="DRIVER")  # DRIVER, HOSPITAL_STAFF, OPERATOR, ADMIN
    assigned_ambulance_id = Column(String(36), nullable=True)
    status = Column(String(50), default="AVAILABLE")  # AVAILABLE, EN_ROUTE, ON_SCENE, OFFLINE
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    is_demo = Column(Boolean, default=False, index=True)
    demo_type = Column(String(50), nullable=True)
    last_active_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Emergency(Base):
    __tablename__ = "emergencies"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), nullable=True, index=True)
    code = Column(String(32), nullable=True, index=True)
    title = Column(String(255), nullable=True)
    description = Column(Text, nullable=False)
    incident_type = Column(String(100), default="MEDICAL_EMERGENCY")
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    patient_count = Column(Integer, default=1)
    critical_patient_count = Column(Integer, default=0)
    severity = Column(String(50), default="MEDIUM")  # LOW, MEDIUM, HIGH, CRITICAL
    
    # Complete Emergency Lifecycle State Machine:
    # CREATED -> SEARCHING -> DISPATCHING -> DRIVER_ALERTED -> ACCEPTED -> EN_ROUTE -> ARRIVED -> PATIENT_ONBOARD -> TRANSPORTING -> COMPLETED
    # Failure branches: DRIVER_DECLINED, DRIVER_TIMEOUT, NO_VERIFIED_AMBULANCE_AVAILABLE, CANCELLED
    status = Column(String(50), default="CREATED", index=True)
    
    assigned_ambulance_id = Column(String(36), nullable=True)
    assigned_driver_id = Column(String(36), nullable=True)
    assigned_hospital_id = Column(String(36), nullable=True)
    is_demo = Column(Boolean, default=False, index=True)
    demo_type = Column(String(50), nullable=True)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    closed_at = Column(DateTime, nullable=True)

class Ambulance(Base):
    __tablename__ = "ambulances"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    vehicle_number = Column(String(50), unique=True, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    status = Column(String(50), default="AVAILABLE", index=True)  # AVAILABLE, EN_ROUTE, ON_SCENE, OFFLINE
    capability = Column(String(50), default="BASIC")   # BASIC, ADVANCED, ICU
    equipment = Column(JSON, default=list)
    current_driver_id = Column(String(36), nullable=True)
    current_assignment_id = Column(String(36), nullable=True)
    eta_minutes = Column(Float, default=0.0)
    is_demo = Column(Boolean, default=False, index=True)
    demo_type = Column(String(50), nullable=True)
    last_gps_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Hospital(Base):
    __tablename__ = "hospitals"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    place_id = Column(String(128), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    address = Column(String(512), nullable=True)
    phone = Column(String(50), nullable=True)
    emergency_available = Column(Boolean, default=True)
    trauma_capable = Column(Boolean, default=False)
    icu_available = Column(Boolean, default=True)
    available_beds = Column(Integer, default=10)
    specialities = Column(JSON, default=list)
    status = Column(String(50), default="OPEN")  # OPEN, LIMITED, CLOSED
    capacity_status = Column(String(50), default="UNKNOWN")  # UNKNOWN, VERIFIED, LIMITED, FULL
    is_demo = Column(Boolean, default=False, index=True)
    demo_type = Column(String(50), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

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
    is_demo = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Dispatch(Base):
    __tablename__ = "dispatches"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    emergency_id = Column(String(36), nullable=False, index=True)
    ambulance_id = Column(String(36), nullable=False, index=True)
    driver_id = Column(String(36), nullable=True)
    hospital_id = Column(String(36), nullable=False)
    selected_route = Column(JSON, nullable=True)
    estimated_ambulance_eta = Column(Float, default=0.0)
    estimated_hospital_eta = Column(Float, default=0.0)
    total_response_time = Column(Float, default=0.0)
    reason = Column(Text, nullable=True)
    status = Column(String(50), default="DISPATCHED")  # DISPATCHED, ACCEPTED, COMPLETED, CANCELLED
    is_demo = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class DriverAlert(Base):
    __tablename__ = "driver_alerts"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    emergency_id = Column(String(36), nullable=False, index=True)
    driver_id = Column(String(36), nullable=False, index=True)
    ambulance_id = Column(String(36), nullable=False)
    status = Column(String(50), default="PENDING")  # PENDING, ACCEPTED, DECLINED, CANCELLED, EXPIRED
    is_demo = Column(Boolean, default=False, index=True)
    alerted_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    responded_at = Column(DateTime, nullable=True)

class EmergencyEvent(Base):
    __tablename__ = "emergency_events"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    emergency_id = Column(String(36), nullable=False, index=True)
    event_type = Column(String(100), nullable=False, index=True)
    # Event Types: CREATED, SEARCHING, DISPATCHING, DRIVER_ALERTED, DRIVER_ACCEPTED, DRIVER_DECLINED, 
    # ALERTS_CANCELLED, EN_ROUTE, ARRIVED, PATIENT_ONBOARD, TRANSPORTING, COMPLETED, CANCELLED, REROUTED
    actor_type = Column(String(50), default="SYSTEM")  # SYSTEM, PATIENT, DRIVER, OPERATOR, AI
    actor_id = Column(String(36), nullable=True)
    description = Column(Text, nullable=False)
    metadata_json = Column(JSON, default=dict)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    is_demo = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

class LocationLog(Base):
    __tablename__ = "location_logs"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    driver_id = Column(String(36), nullable=True, index=True)
    ambulance_id = Column(String(36), nullable=True, index=True)
    emergency_id = Column(String(36), nullable=True, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    speed = Column(Float, nullable=True)
    heading = Column(Float, nullable=True)
    accuracy = Column(Float, nullable=True)
    source = Column(String(50), default="BROWSER_GPS")  # BROWSER_GPS, HARDWARE_OBD, SIMULATED
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

class RouteEvent(Base):
    __tablename__ = "route_events"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    emergency_id = Column(String(36), nullable=False, index=True)
    event_type = Column(String(100), default="REROUTE")
    description = Column(Text, nullable=False)
    old_route = Column(JSON, nullable=True)
    new_route = Column(JSON, nullable=True)
    old_eta = Column(Float, default=0.0)
    new_eta = Column(Float, default=0.0)
    time_saved_minutes = Column(Float, default=0.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

