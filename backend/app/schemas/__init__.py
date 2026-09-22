from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Any, Dict
from datetime import datetime

# ==================== EMERGENCY SESSION SCHEMAS ====================
class EmergencySessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    session_token: str
    session_code: str
    emergency_id: str
    expires_at: datetime
    is_active: bool

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
    code: Optional[str] = None
    session_id: Optional[str] = None
    title: Optional[str] = None
    description: str
    incident_type: str
    latitude: float
    longitude: float
    patient_count: int
    critical_patient_count: int
    severity: str
    status: str
    assigned_ambulance_id: Optional[str] = None
    assigned_driver_id: Optional[str] = None
    assigned_hospital_id: Optional[str] = None
    is_demo: bool = False
    demo_type: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    session: Optional[EmergencySessionResponse] = None

# ==================== DRIVER & AUTH SCHEMAS ====================
class DemoLoginRequest(BaseModel):
    role: str = "DRIVER"  # DRIVER, HOSPITAL_STAFF
    demo_id: str  # demo-driver-a, demo-driver-b, demo-hospital-1

class DemoStatusResponse(BaseModel):
    demo_mode: bool = True

class DriverGoogleAuthRequest(BaseModel):
    google_id: Optional[str] = None
    email: str
    name: str
    phone: Optional[str] = None
    ambulance_id: Optional[str] = None
    role: str = "DRIVER"  # DRIVER, OPERATOR

class SendOtpRequest(BaseModel):
    phone: str
    role: str = "DRIVER"  # DRIVER, HOSPITAL, OPERATOR

class SendOtpResponse(BaseModel):
    success: bool
    message: str
    cooldown_seconds: int = 60

class VerifyOtpRequest(BaseModel):
    phone: str
    otp: str
    email: Optional[str] = None
    name: Optional[str] = None
    role: str = "DRIVER"
    ambulance_id: Optional[str] = None
    google_id: Optional[str] = None

class VerifyOtpResponse(BaseModel):
    success: bool
    message: str
    token: Optional[str] = None
    driver: Optional[Any] = None
    ambulance: Optional[Any] = None

class DriverResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: str
    phone: Optional[str] = None
    phone_verified: bool = False
    otp_verified_at: Optional[datetime] = None
    role: str
    assigned_ambulance_id: Optional[str] = None
    status: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_demo: bool = False
    demo_type: Optional[str] = None
    last_active_at: Optional[datetime] = None

class DriverAuthResponse(BaseModel):
    driver: DriverResponse
    token: str
    ambulance: Optional[Any] = None

class DriverStatusUpdate(BaseModel):
    status: str  # AVAILABLE, EN_ROUTE, ON_SCENE, OFFLINE
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    accuracy: Optional[float] = None

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
    current_driver_id: Optional[str] = None
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
    current_driver_id: Optional[str] = None
    current_assignment_id: Optional[str] = None
    eta_minutes: float
    is_demo: bool = False
    demo_type: Optional[str] = None
    last_gps_at: Optional[datetime] = None

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
    freshness_status: str = "LIVE"  # LIVE, STALE, OFFLINE, DEMO
    is_demo: bool = False
    demo_type: Optional[str] = None
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None

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
    is_demo: bool = False
    demo_type: Optional[str] = None
    driver_id: Optional[str] = None

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
    is_demo: bool = False
    demo_type: Optional[str] = None
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None

# ==================== DISPATCH & ATOMIC CONCURRENCY SCHEMAS ====================
class DriverAlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    emergency_id: str
    driver_id: str
    ambulance_id: str
    status: str  # PENDING, ACCEPTED, DECLINED, CANCELLED, EXPIRED
    is_demo: bool = False
    demo_type: Optional[str] = None
    alerted_at: datetime
    emergency_code: Optional[str] = None
    incident_type: Optional[str] = None
    severity: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = None

class DriverAcceptRequest(BaseModel):
    emergency_id: str
    driver_id: str
    ambulance_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class DriverAcceptResponse(BaseModel):
    success: bool
    status: str  # ACCEPTED, ALREADY_ASSIGNED, FAILED
    emergency_id: str
    assigned_driver_id: Optional[str] = None
    assigned_ambulance_id: Optional[str] = None
    message: str
    patient_latitude: float
    patient_longitude: float
    destination_hospital: Optional[Any] = None
    navigation_route: Optional[Any] = None

class DriverDeclineRequest(BaseModel):
    emergency_id: str
    driver_id: str
    reason: Optional[str] = "DRIVER_DECLINED"

class StateTransitionRequest(BaseModel):
    emergency_id: str
    target_status: str  # EN_ROUTE, ARRIVED, PATIENT_ONBOARD, TRANSPORTING, COMPLETED, CANCELLED
    driver_id: Optional[str] = None
    ambulance_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notes: Optional[str] = None

# ==================== HOSPITAL SCHEMAS ====================
class HospitalCreate(BaseModel):
    name: str
    latitude: float
    longitude: float
    address: Optional[str] = None
    phone: Optional[str] = None
    emergency_available: bool = True
    trauma_capable: bool = False
    icu_available: bool = True
    available_beds: int = 10
    specialities: List[str] = Field(default_factory=list)
    status: str = "OPEN"

class HospitalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    place_id: Optional[str] = None
    name: str
    latitude: float
    longitude: float
    address: Optional[str] = None
    phone: Optional[str] = None
    emergency_available: bool
    trauma_capable: bool
    icu_available: bool
    available_beds: int
    specialities: List[str] = Field(default_factory=list)
    status: str
    capacity_status: str = "UNKNOWN"
    is_demo: bool = False
    demo_type: Optional[str] = None

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
    is_demo: bool = False
    demo_type: Optional[str] = None

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
    is_demo: bool = False
    demo_type: Optional[str] = None

# ==================== ROUTING & CORRIDOR SCHEMAS ====================
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
    traffic_delay_minutes: float = 0.0
    congestion_level: str = "NORMAL"  # NORMAL, HEAVY, SEVERE

class RouteResponse(BaseModel):
    routes: List[RouteOption]

class RouteRiskAnalysisRequest(BaseModel):
    route_id: str
    geometry: List[List[float]]

class RouteRiskResponse(BaseModel):
    route_id: str
    risk_level: str
    incidents: List[Dict[str, Any]]
    adjusted_eta_minutes: float

class EmergencyPriorityCorridorResponse(BaseModel):
    status: str  # OPTIMAL_CORRIDOR_ACTIVE, CONGESTION_DETECTED, REROUTE_RECOMMENDED
    current_corridor_name: str
    current_eta_minutes: float
    traffic_delay_minutes: float
    congestion_severity: str  # NORMAL, HEAVY, SEVERE
    recommended_corridor: RouteOption
    alternate_corridors: List[RouteOption] = Field(default_factory=list)
    time_saved_minutes: float = 0.0
    reason: str
    traffic_control_integration: str = "INFORMATIONAL_ROUTING_ONLY (No public municipal signal override)"

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
    intent: str = "UNKNOWN"
    conversation_state: str = "IDLE"
    incident_type: Optional[str] = None
    severity: str = "MEDIUM"
    patient_count: Optional[int] = None
    critical_patient_count: Optional[int] = None
    injury_reported: Optional[bool] = None
    bleeding_reported: Optional[bool] = None
    is_unconscious: Optional[bool] = None
    location_description: Optional[str] = None
    location_mentioned: Optional[str] = None
    location_confirmed: bool = False
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_source: Optional[str] = None
    accuracy_meters: Optional[float] = None
    road_passability: Optional[str] = None
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
    database: Optional[DataSourceItem] = None
    realtime: Optional[DataSourceItem] = None

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
    corridor_analysis: Optional[EmergencyPriorityCorridorResponse] = None

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

# ==================== ANALYTICS & AUDIT SCHEMAS ====================
class AnalyticsMetricsResponse(BaseModel):
    total_emergencies: int
    active_emergencies: int
    completed_emergencies: int
    cancelled_emergencies: int
    avg_dispatch_time_seconds: float
    avg_driver_acceptance_time_seconds: float
    avg_ambulance_response_time_minutes: float
    avg_hospital_travel_time_minutes: float
    driver_acceptance_rate_percent: float
    no_ambulance_rate_percent: float
    fleet_total_count: int
    fleet_active_count: int
    fleet_utilization_percent: float
    gps_freshness_percent: float
    traffic_delay_avg_minutes: float
    corridor_time_saved_avg_minutes: float

class AnalyticsHotspotItem(BaseModel):
    latitude: float
    longitude: float
    incident_count: int
    primary_severity: str
    location_label: Optional[str] = None

class EmergencyAuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    emergency_id: str
    event_type: str
    actor_type: str
    actor_id: Optional[str] = None
    description: str
    metadata_json: Dict[str, Any] = Field(default_factory=dict)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_demo: bool = False
    created_at: datetime
