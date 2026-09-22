export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type EmergencyStatus =
  | 'CREATED'
  | 'SEARCHING'
  | 'DISPATCHING'
  | 'DISPATCHED'
  | 'DRIVER_ALERTED'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'PATIENT_ONBOARD'
  | 'TRANSPORTING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_VERIFIED_AMBULANCE_AVAILABLE'
  | 'INTAKE'
  | 'ANALYZING'
  | 'PLAN_READY'
  | 'REROUTING'
  | 'INFORMATION_SUFFICIENT';

export type AmbulanceCapability = 'BASIC' | 'ADVANCED' | 'ICU';
export type AmbulanceStatus = 'AVAILABLE' | 'EN_ROUTE' | 'ON_SCENE' | 'BUSY' | 'OFFLINE';
export type HospitalStatus = 'OPEN' | 'LIMITED' | 'CLOSED';
export type IncidentType = 'ACCIDENT' | 'FLOOD' | 'ROAD_BLOCK' | 'CONSTRUCTION' | 'CONGESTION' | 'HAZARD';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';
export type DataStatusLevel = 'LIVE' | 'SIMULATED' | 'UNKNOWN' | 'DERIVED' | 'PUBLIC_DATA' | 'DEGRADED' | 'CONFIGURED' | 'MISSING';

export interface EmergencySession {
  session_token: string;
  session_code: string;
  emergency_id: string;
  expires_at: string;
  is_active: boolean;
}

export interface Emergency {
  id: string;
  code?: string;
  session_id?: string;
  title?: string;
  description: string;
  incident_type: string;
  latitude: number;
  longitude: number;
  patient_count: number;
  critical_patient_count: number;
  severity: Severity;
  status: string;
  assigned_ambulance_id?: string;
  assigned_driver_id?: string;
  assigned_hospital_id?: string;
  is_demo?: boolean;
  demo_type?: string;
  created_at?: string;
  updated_at?: string;
  session?: EmergencySession;
}

export type LiveAmbulanceStatus = 'AVAILABLE' | 'EN_ROUTE' | 'ON_SCENE' | 'OFFLINE';

export interface LiveAmbulanceGPS {
  id: string;
  vehicle_number: string;
  capability: AmbulanceCapability;
  status: LiveAmbulanceStatus;
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
  updated_at: number; // timestamp in ms or seconds
  source: 'LIVE_GPS' | 'DEMO_TELEMETRY' | string;
  freshness_status: 'LIVE' | 'STALE' | 'OFFLINE' | 'DEMO' | string;
  is_demo?: boolean;
  demo_type?: string;
  driver_id?: string;
  driver_name?: string;
}

export interface LiveAmbulancesResponse {
  source: string;
  status: string;
  count: number;
  ambulances: LiveAmbulanceGPS[];
}

export interface AmbulanceRecommendation {
  ambulance_id: string;
  vehicle_number: string;
  capability: AmbulanceCapability;
  distance_km: number;
  eta_minutes: number;
  match_score: number;
  reasons: string[];
  latitude: number;
  longitude: number;
  source?: 'LIVE_GPS' | 'DEMO_TELEMETRY' | string;
  status?: LiveAmbulanceStatus | string;
  updated_at?: number;
  freshness_status?: 'LIVE' | 'STALE' | 'OFFLINE' | 'DEMO' | string;
  is_demo?: boolean;
  demo_type?: string;
  driver_id?: string;
  driver_name?: string;
}

export interface Ambulance {
  id: string;
  vehicle_number: string;
  latitude: number;
  longitude: number;
  status: AmbulanceStatus;
  capability: AmbulanceCapability;
  equipment: string[];
  current_driver_id?: string;
  current_assignment_id?: string;
  eta_minutes: number;
  is_demo?: boolean;
  demo_type?: string;
  last_gps_at?: string;
}

export type UserRole = 'DRIVER' | 'HOSPITAL_STAFF' | 'OPERATOR' | 'ADMIN';

export interface Driver {
  id: string;
  name: string;
  email: string;
  phone?: string;
  phone_verified?: boolean;
  otp_verified_at?: string;
  role: UserRole;
  assigned_ambulance_id?: string;
  status: LiveAmbulanceStatus;
  latitude?: number;
  longitude?: number;
  is_demo?: boolean;
  demo_type?: string;
  last_active_at?: string;
}

export interface SendOtpRequest {
  phone: string;
  role?: string;
}

export interface SendOtpResponse {
  success: boolean;
  message: string;
  cooldown_seconds: number;
}

export interface VerifyOtpRequest {
  phone: string;
  otp: string;
  email?: string;
  name?: string;
  role?: string;
  ambulance_id?: string;
  google_id?: string;
}

export interface VerifyOtpResponse {
  success: boolean;
  message: string;
  token?: string;
  driver?: Driver;
  ambulance?: Ambulance;
}

export interface DriverAuthResponse {
  driver: Driver;
  token: string;
  ambulance?: Ambulance;
}

export interface DriverAlertItem {
  id: string;
  emergency_id: string;
  driver_id: string;
  ambulance_id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
  alerted_at: string;
  emergency_code?: string;
  incident_type?: string;
  severity?: Severity;
  latitude?: number;
  longitude?: number;
  description?: string;
  is_demo?: boolean;
  demo_type?: string;
}

export interface DriverAcceptResponse {
  success: boolean;
  status: 'ACCEPTED' | 'ALREADY_ASSIGNED' | 'FAILED' | 'ERROR';
  emergency_id: string;
  assigned_driver_id?: string;
  assigned_ambulance_id?: string;
  message: string;
  patient_latitude: number;
  patient_longitude: number;
  destination_hospital?: any;
  navigation_route?: any;
}

export interface NearbyHospitalItem {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  business_status?: string;
  distance_meters?: number;
  distance_km?: number;
  place_id?: string;
  phone?: string;
  rating?: number;
  source: 'GOOGLE_PLACES' | 'DEMO_TELEMETRY' | string;
  status: 'LIVE' | 'DEMO' | 'UNKNOWN' | 'DEGRADED' | 'MISSING' | string;
  capacity_status?: string;
  trauma_capable?: boolean | null;
  icu_available?: boolean | null;
  available_beds?: number | null;
  is_demo?: boolean;
  demo_type?: string;
}

export interface NearbyHospitalsResponse {
  source: string;
  status: 'LIVE' | 'DEMO' | 'UNKNOWN' | 'DEGRADED' | 'MISSING' | string;
  hospitals: NearbyHospitalItem[];
  error?: string | null;
}

export interface Hospital {
  id: string;
  place_id?: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  phone?: string;
  emergency_available: boolean;
  trauma_capable: boolean;
  icu_available: boolean;
  available_beds: number;
  specialities: string[];
  status: HospitalStatus;
  capacity_status?: string;
  is_demo?: boolean;
  demo_type?: string;
}

export interface HospitalRecommendation {
  hospital_id: string;
  name: string;
  eta_minutes: number;
  match_score: number;
  reasons: string[];
  latitude: number;
  longitude: number;
  trauma_capable?: boolean | null;
  icu_available?: boolean | null;
  available_beds?: number | null;
  address?: string | null;
  phone?: string | null;
  distance_km?: number | null;
  place_id?: string | null;
  source?: string;
  verification_status?: string;
  capacity_status?: string;
}

export interface RouteStep {
  instruction: string;
  distance_meters: number;
  duration_seconds: number;
}

export interface RouteOption {
  id: string;
  name: string;
  distance_km: number;
  duration_minutes: number;
  geometry: any;
  risk_level: RiskLevel;
  incidents: any[];
  adjusted_eta_minutes: number;
  steps: RouteStep[];
  traffic_delay_minutes?: number;
  congestion_level?: 'NORMAL' | 'HEAVY' | 'SEVERE';
}

export interface EmergencyPriorityCorridor {
  status: 'OPTIMAL_CORRIDOR_ACTIVE' | 'CONGESTION_DETECTED' | 'REROUTE_RECOMMENDED';
  current_corridor_name: string;
  current_eta_minutes: number;
  traffic_delay_minutes: number;
  congestion_severity: 'NORMAL' | 'HEAVY' | 'SEVERE';
  recommended_corridor: RouteOption;
  alternate_corridors: RouteOption[];
  time_saved_minutes: number;
  reason: string;
  traffic_control_integration: string;
}

export interface RoadIncident {
  id: string;
  type: IncidentType;
  latitude: number;
  longitude: number;
  severity: Severity;
  description?: string;
  radius_meters: number;
  active: boolean;
  created_at?: string;
}

export interface DecisionConfidence {
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
  known_factors: string[];
  unknown_factors: string[];
  rationale: string;
}

export type DecisionConfidenceBreakdown = DecisionConfidence;

export interface OptimizationResult {
  emergency_id: string;
  selected_ambulance?: AmbulanceRecommendation | null;
  selected_hospital: HospitalRecommendation;
  hospital_candidates: HospitalRecommendation[];
  selected_route: RouteOption;
  alternative_routes: RouteOption[];
  ambulance_eta: number;
  travel_eta: number;
  total_estimated_time: number;
  straight_line_distance_km?: number;
  route_distance_km?: number;
  route_status_flag?: string;
  route_warning?: string | null;
  optimization_reason: string;
  has_live_ambulance: boolean;
  no_ambulance_reason?: string | null;
  confidence?: DecisionConfidence;
  confidence_breakdown?: DecisionConfidence;
  data_sources?: Record<string, string>;
  corridor_analysis?: EmergencyPriorityCorridor;
}

export interface DecisionExplanation {
  ambulance_reason: string;
  hospital_reason: string;
  route_reason: string;
  overall_reason: string;
  confidence?: DecisionConfidence;
}

export interface RerouteResult {
  rerouted: boolean;
  reason: string;
  old_eta_minutes: number;
  new_eta_minutes: number;
  new_route?: RouteOption;
  old_route?: RouteOption;
  confidence?: DecisionConfidence;
}

export interface LocationSearchResult {
  formatted_address: string;
  latitude: number;
  longitude: number;
  place_name?: string;
  source: string;
  accuracy_meters?: number;
}

export interface EmergencyAnalysis {
  incident_type: string;
  patient_count: number;
  critical_patient_count: number;
  severity: Severity;
  location_description?: string;
  special_requirements: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface EmergencyDispatcherState {
  intent?: string | null;
  conversation_state?: string | null;
  incident_type?: string | null;
  severity?: Severity | null;
  patient_count?: number | null;
  critical_patient_count?: number | null;
  injury_reported?: boolean | null;
  bleeding_reported?: boolean | null;
  is_unconscious?: boolean | null;
  location_description?: string | null;
  location_mentioned?: string | null;
  location_confirmed?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
  location_source?: string | null;
  accuracy_meters?: number | null;
  road_passability?: string | null;
  special_requirements?: string[] | null;
  confidence?: number | null;
  missing_information?: string[];
  has_sufficient_information?: boolean;
}

export interface ChatRequest {
  message: string;
  conversation_id?: string;
  history?: ChatMessage[];
  latitude?: number;
  longitude?: number;
  location_source?: string;
  accuracy_meters?: number;
}

export interface ChatResponse {
  reply: string;
  conversation_id: string;
  state: EmergencyDispatcherState;
  has_sufficient_information: boolean;
  emergency_id?: string;
  suggested_quick_replies?: string[];
}

export interface DataSourceItem {
  name: string;
  source: string;
  status: DataStatusLevel | string;
  description: string;
}

export interface DataSourceStatusResponse {
  traffic?: DataSourceItem;
  hospitals?: DataSourceItem;
  ambulances?: DataSourceItem;
  hospital_capacity?: DataSourceItem;
  road_incidents?: DataSourceItem;
  ai_dispatcher?: DataSourceItem;
  map?: DataSourceItem;
  database?: DataSourceItem;
  realtime?: DataSourceItem;
}

export interface AnalyticsMetrics {
  total_emergencies: number;
  active_emergencies: number;
  completed_emergencies: number;
  cancelled_emergencies: number;
  avg_dispatch_time_seconds: number;
  avg_driver_acceptance_time_seconds: number;
  avg_ambulance_response_time_minutes: number;
  avg_hospital_travel_time_minutes: number;
  driver_acceptance_rate_percent: number;
  no_ambulance_rate_percent: number;
  fleet_total_count: number;
  fleet_active_count: number;
  fleet_utilization_percent: number;
  gps_freshness_percent: number;
  traffic_delay_avg_minutes: number;
  corridor_time_saved_avg_minutes: number;
}

export interface AnalyticsHotspot {
  latitude: number;
  longitude: number;
  incident_count: number;
  primary_severity: string;
  location_label?: string;
}

export interface EmergencyAuditEvent {
  id: string;
  emergency_id: string;
  event_type: string;
  actor_type: string;
  actor_id?: string;
  description: string;
  metadata_json: Record<string, any>;
  latitude?: number;
  longitude?: number;
  created_at: string;
}
