from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Any, Dict
from datetime import datetime

# ==================== EMERGENCY SCHEMAS ====================
class EmergencyCreate(BaseModel):
    description: str
    latitude: float
    longitude: float
    title: Optional[str] = None
    patient_count: Optional[int] = None
    critical_patient_count: Optional[int] = None
    severity: Optional[str] = None
    incident_type: Optional[str] = None

class EmergencyStatusUpdate(BaseModel):
    status: str

class EmergencyAnalysisResponse(BaseModel):
    incident_type: str
    patient_count: int
    critical_patient_count: int
    severity: str  # LOW, MEDIUM, HIGH, CRITICAL
    location_description: Optional[str] = ""
    special_requirements: List[str] = Field(default_factory=list)

class EmergencyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: Optional[str] = None
    description: str
    incident_type: str
    latitude: float
    longitude: float
    patient_count: int
    critical_patient_count: int
    severity: str
    status: str
    created_at: Optional[datetime] = None

# ==================== AMBULANCE SCHEMAS ====================
class AmbulanceCreate(BaseModel):
    vehicle_number: str
    latitude: float
    longitude: float
    capability: str = "BASIC"  # BASIC, ADVANCED, ICU
    equipment: List[str] = Field(default_factory=list)
    status: str = "AVAILABLE"

class AmbulanceUpdate(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    capability: Optional[str] = None
    equipment: Optional[List[str]] = None
    status: Optional[str] = None
    current_assignment_id: Optional[str] = None
    eta_minutes: Optional[float] = None

class AmbulanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    vehicle_number: str
    latitude: float
    longitude: float
    status: str
    capability: str
    equipment: List[str] = Field(default_factory=list)
    current_assignment_id: Optional[str] = None
    eta_minutes: float

class LiveAmbulanceGPSItem(BaseModel):
    id: str
    vehicle_number: str
    capability: str = "ADVANCED"
    status: str = "AVAILABLE"  # AVAILABLE, EN_ROUTE, ON_SCENE, OFFLINE
    latitude: float
    longitude: float
    speed: Optional[float] = None
    heading: Optional[float] = None
    accuracy: Optional[float] = None
    updated_at: float  # Unix timestamp in seconds or ms
    source: str = "LIVE_GPS"
    freshness_status: str = "LIVE"  # LIVE, STALE, OFFLINE

class AmbulanceTelemetryRequest(BaseModel):
    id: str
    vehicle_number: Optional[str] = None
    capability: Optional[str] = "ADVANCED"
    status: str = "AVAILABLE"
    latitude: float
    longitude: float
    speed: Optional[float] = None
    heading: Optional[float] = None
    accuracy: Optional[float] = None
    updated_at: Optional[float] = None
    source: str = "LIVE_GPS"

class LiveAmbulancesResponse(BaseModel):
    source: str = "LIVE_GPS"
    status: str = "LIVE"
    count: int = 0
    ambulances: List[LiveAmbulanceGPSItem] = Field(default_factory=list)

class AmbulanceRecommendation(BaseModel):
    ambulance_id: str
    vehicle_number: str
    capability: str
    distance_km: float
    eta_minutes: float
    match_score: float
    reasons: List[str]
    latitude: float
    longitude: float
    source: Optional[str] = "LIVE_GPS"
    status: Optional[str] = "AVAILABLE"
    updated_at: Optional[float] = None
    freshness_status: Optional[str] = "LIVE"

# ==================== HOSPITAL SCHEMAS ====================
class HospitalCreate(BaseModel):
    name: str
    latitude: float
    longitude: float
    emergency_available: bool = True
    trauma_capable: bool = False
    icu_available: bool = True
    available_beds: int = 10
    specialities: List[str] = Field(default_factory=list)
    status: str = "OPEN"

class HospitalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    latitude: float
    longitude: float
    emergency_available: bool
    trauma_capable: bool
    icu_available: bool
    available_beds: int
    specialities: List[str] = Field(default_factory=list)
    status: str

class NearbyHospitalItem(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    address: Optional[str] = ""
    business_status: Optional[str] = "OPERATIONAL"
    distance_meters: Optional[float] = None
    distance_km: Optional[float] = None
    place_id: Optional[str] = None
    phone: Optional[str] = None
    rating: Optional[float] = None
    source: str = "GOOGLE_PLACES"
    status: str = "LIVE"
    capacity_status: str = "UNKNOWN"
    trauma_capable: Optional[bool] = None
    icu_available: Optional[bool] = None
    available_beds: Optional[int] = None

class NearbyHospitalsResponse(BaseModel):
    source: str = "GOOGLE_PLACES"
    status: str = "LIVE"  # LIVE, DEMO, UNKNOWN, DEGRADED, MISSING
    hospitals: List[NearbyHospitalItem] = Field(default_factory=list)
    error: Optional[str] = None

class HospitalRecommendation(BaseModel):
    hospital_id: str
    name: str
    eta_minutes: float
    match_score: float
    reasons: List[str]
    latitude: float
    longitude: float
    trauma_capable: Optional[bool] = None
    icu_available: Optional[bool] = None
    available_beds: Optional[int] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    distance_km: Optional[float] = None
    place_id: Optional[str] = None
    source: Optional[str] = "GOOGLE_PLACES"
    verification_status: Optional[str] = "PUBLICLY_VERIFIED"
    capacity_status: Optional[str] = "UNKNOWN"

# ==================== ROUTING SCHEMAS ====================
class Coordinate(BaseModel):
    latitude: float
    longitude: float

class RouteCalculateRequest(BaseModel):
    origin: Coordinate
    destination: Coordinate

class RouteStep(BaseModel):
    instruction: str
    distance_meters: float
    duration_seconds: float

class RouteOption(BaseModel):
    id: str
    name: str
    distance_km: float
    duration_minutes: float
    geometry: Any  # GeoJSON LineString coordinates [[lon, lat], ...] or encoded polyline
    risk_level: str = "LOW"  # LOW, MEDIUM, HIGH, BLOCKED
    incidents: List[Dict[str, Any]] = Field(default_factory=list)
    adjusted_eta_minutes: float = 0.0
    steps: List[RouteStep] = Field(default_factory=list)

class RouteResponse(BaseModel):
    routes: List[RouteOption]

class RouteRiskAnalysisRequest(BaseModel):
    route_id: str
    geometry: List[List[float]]  # list of [lon, lat]

class RouteRiskResponse(BaseModel):
    route_id: str
    risk_level: str
    incidents: List[Dict[str, Any]]
    adjusted_eta_minutes: float

# ==================== LOCATION & GEOCODING SCHEMAS ====================
class LocationSearchResult(BaseModel):
    formatted_address: str
    latitude: float
    longitude: float
    place_name: Optional[str] = ""
    source: str = "GEOCODED"  # USER_GPS, USER_SEARCH, USER_PIN, DEMO
    accuracy_meters: Optional[float] = None

class LocationReverseResult(BaseModel):
    formatted_address: str
    latitude: float
    longitude: float
    place_name: Optional[str] = ""
    source: str = "USER_PIN"

# ==================== CHAT & GEMINI DISPATCHER SCHEMAS ====================
class ChatMessage(BaseModel):
    role: str  # 'user', 'assistant', 'system'
    content: str
    timestamp: Optional[datetime] = None

class EmergencyDispatcherState(BaseModel):
    intent: str = "UNKNOWN"  # GREETING, GENERAL_QUESTION, EMERGENCY_REPORT, LOCATION_UPDATE, ANSWER_TO_QUESTION, CONFIRMATION, CANCELLATION, UNKNOWN
    conversation_state: str = "IDLE"  # IDLE, GREETING, INTAKE_STARTED, COLLECTING_LOCATION, COLLECTING_INCIDENT, COLLECTING_PATIENT_COUNT, COLLECTING_CRITICAL_STATUS, COLLECTING_ROAD_ACCESS, INFORMATION_SUFFICIENT, PLAN_READY
    incident_type: Optional[str] = None  # ROAD_ACCIDENT, CARDIAC_ARREST, STROKE, FIRE_BURN, TRAUMA_INJURY, MEDICAL_EMERGENCY or None
    severity: str = "MEDIUM"  # LOW, MEDIUM, HIGH, CRITICAL
    patient_count: Optional[int] = None
    critical_patient_count: Optional[int] = None
    location_description: Optional[str] = None
    location_confirmed: bool = False
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_source: Optional[str] = None  # USER_GPS, USER_SEARCH, USER_PIN, DEMO
    accuracy_meters: Optional[float] = None
    road_passability: Optional[str] = None  # PASSABLE, PARTIAL, BLOCKED, UNKNOWN
    special_requirements: List[str] = Field(default_factory=list)
    confidence: float = 0.0
    missing_information: List[str] = Field(default_factory=list)
    has_sufficient_information: bool = False

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    history: List[ChatMessage] = Field(default_factory=list)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_source: Optional[str] = None
    accuracy_meters: Optional[float] = None

class ChatResponse(BaseModel):
    reply: str
    conversation_id: str
    state: EmergencyDispatcherState
    has_sufficient_information: bool
    emergency_id: Optional[str] = None
    suggested_quick_replies: List[str] = Field(default_factory=list)

# ==================== DATA SOURCE PROVENANCE SCHEMAS ====================
class DataSourceItem(BaseModel):
    name: str
    source: str
    status: str  # LIVE, SIMULATED, UNKNOWN, DERIVED
    description: str

class DataSourceStatusResponse(BaseModel):
    traffic: DataSourceItem
    hospitals: DataSourceItem
    ambulances: DataSourceItem
    hospital_capacity: DataSourceItem
    road_incidents: DataSourceItem
    ai_dispatcher: DataSourceItem
    map: Optional[DataSourceItem] = None
    database: Optional[DataSourceItem] = None

# ==================== OPTIMIZATION & DISPATCH SCHEMAS ====================
class DecisionConfidenceBreakdown(BaseModel):
    level: str  # HIGH, MEDIUM, LOW
    score: float
    known_factors: List[str] = Field(default_factory=list)
    unknown_factors: List[str] = Field(default_factory=list)
    rationale: str

class OptimizationResponse(BaseModel):
    emergency_id: str
    selected_ambulance: Optional[AmbulanceRecommendation] = None
    selected_hospital: HospitalRecommendation
    hospital_candidates: List[HospitalRecommendation] = Field(default_factory=list)
    selected_route: RouteOption
    alternative_routes: List[RouteOption] = Field(default_factory=list)
    ambulance_eta: float = 0.0
    travel_eta: float = 0.0
    total_estimated_time: float = 0.0
    straight_line_distance_km: Optional[float] = None
    route_distance_km: Optional[float] = None
    route_status_flag: Optional[str] = "VERIFIED"
    route_warning: Optional[str] = None
    optimization_reason: str
    has_live_ambulance: bool = True
    no_ambulance_reason: Optional[str] = None
    confidence: Optional[DecisionConfidenceBreakdown] = None
    data_sources: Optional[Dict[str, str]] = None

class DecisionExplanationResponse(BaseModel):
    ambulance_reason: str
    hospital_reason: str
    route_reason: str
    overall_reason: str
    confidence: Optional[DecisionConfidenceBreakdown] = None

class RerouteResponse(BaseModel):
    rerouted: bool
    reason: str
    old_eta_minutes: float
    new_eta_minutes: float
    new_route: Optional[RouteOption] = None
    old_route: Optional[RouteOption] = None
    confidence: Optional[DecisionConfidenceBreakdown] = None
