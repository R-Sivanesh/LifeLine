export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type EmergencyStatus = 'INTAKE' | 'INFORMATION_SUFFICIENT' | 'ANALYZING' | 'PLAN_READY' | 'ACTIVE' | 'DISPATCHED' | 'EN_ROUTE' | 'REROUTING' | 'ARRIVED' | 'RESOLVED';
export type AmbulanceCapability = 'BASIC' | 'ADVANCED' | 'ICU';
export type AmbulanceStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE';
export type HospitalStatus = 'OPEN' | 'LIMITED' | 'CLOSED';
export type IncidentType = 'ACCIDENT' | 'FLOOD' | 'ROAD_BLOCK' | 'CONSTRUCTION' | 'CONGESTION' | 'HAZARD';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';
export type DataStatusLevel = 'LIVE' | 'SIMULATED' | 'UNKNOWN' | 'DERIVED' | 'PUBLIC_DATA' | 'DEGRADED' | 'CONFIGURED' | 'MISSING';

export interface Emergency {
  id: string;
  title?: string;
  description: string;
  incident_type: string;
  latitude: number;
  longitude: number;
  patient_count: number;
  critical_patient_count: number;
  severity: Severity;
  status: string;
  created_at?: string;
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
}

export interface Ambulance {
  id: string;
  vehicle_number: string;
  latitude: number;
  longitude: number;
  status: AmbulanceStatus;
  capability: AmbulanceCapability;
  equipment: string[];
  current_assignment_id?: string;
  eta_minutes: number;
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
}

export interface NearbyHospitalsResponse {
  source: string;
  status: 'LIVE' | 'DEMO' | 'UNKNOWN' | 'DEGRADED' | 'MISSING' | string;
  hospitals: NearbyHospitalItem[];
  error?: string | null;
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
  address?: string;
  phone?: string;
  distance_km?: number;
  place_id?: string;
  source?: string;
  verification_status?: string;
  capacity_status?: string;
}

export interface Hospital {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  emergency_available: boolean;
  trauma_capable: boolean;
  icu_available: boolean;
  available_beds: number;
  specialities: string[];
  status: HospitalStatus;
  address?: string;
  phone?: string;
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
  geometry: [number, number][]; // [lon, lat]
  risk_level: RiskLevel;
  incidents: any[];
  adjusted_eta_minutes: number;
  steps: RouteStep[];
}

export interface DecisionConfidenceBreakdown {
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
  known_factors?: string[];
  unknown_factors?: string[];
  reasons?: string[];
  rationale?: string;
}

export interface OptimizationResult {
  emergency_id: string;
  selected_ambulance: AmbulanceRecommendation;
  selected_hospital: HospitalRecommendation;
  selected_route: RouteOption;
  alternative_routes: RouteOption[];
  ambulance_eta: number;
  travel_eta: number;
  total_estimated_time: number;
  optimization_reason: string;
  confidence?: DecisionConfidenceBreakdown;
  confidence_breakdown?: DecisionConfidenceBreakdown;
  data_sources?: Record<string, string>;
}

export interface DecisionExplanation {
  ambulance_reason: string;
  hospital_reason: string;
  route_reason: string;
  overall_reason: string;
  confidence?: DecisionConfidenceBreakdown;
}

export interface RerouteResult {
  rerouted: boolean;
  reason: string;
  old_eta_minutes: number;
  new_eta_minutes: number;
  new_route?: RouteOption;
  old_route?: RouteOption;
  confidence?: DecisionConfidenceBreakdown;
}

export interface LocationSearchResult {
  formatted_address: string;
  latitude: number;
  longitude: number;
  place_name?: string;
  source: 'USER_GPS' | 'USER_SEARCH' | 'USER_PIN' | 'DEMO' | 'GEOCODED';
  accuracy_meters?: number;
}

export interface LocationReverseResult {
  formatted_address: string;
  latitude: number;
  longitude: number;
  place_name?: string;
  source: string;
}

export interface EmergencyAnalysis {
  incident_type: string;
  patient_count: number;
  critical_patient_count: number;
  severity: Severity;
  location_description: string;
  special_requirements: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface EmergencyDispatcherState {
  intent?: 'GREETING' | 'GENERAL_QUESTION' | 'EMERGENCY_REPORT' | 'LOCATION_UPDATE' | 'ANSWER_TO_QUESTION' | 'CONFIRMATION' | 'CANCELLATION' | 'UNKNOWN' | string;
  conversation_state?: 'IDLE' | 'GREETING' | 'INTAKE_STARTED' | 'COLLECTING_LOCATION' | 'COLLECTING_INCIDENT' | 'COLLECTING_PATIENT_COUNT' | 'COLLECTING_CRITICAL_STATUS' | 'COLLECTING_ROAD_ACCESS' | 'INFORMATION_SUFFICIENT' | 'PLAN_READY' | string;
  incident_type?: string | null;
  severity?: Severity;
  patient_count?: number | null;
  critical_patient_count?: number | null;
  location_description?: string | null;
  location_confirmed?: boolean;
  road_passability?: string | null;
  special_requirements?: string[];
  confidence?: number;
  missing_information?: string[];
  has_sufficient_information: boolean;
  latitude?: number | null;
  longitude?: number | null;
  location_source?: 'USER_GPS' | 'USER_SEARCH' | 'USER_PIN' | 'DEMO' | string | null;
  accuracy_meters?: number | null;
  location_note?: string;
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
  status: DataStatusLevel;
  description: string;
}

export interface DataSourceStatusResponse {
  traffic: DataSourceItem;
  hospitals: DataSourceItem;
  ambulances: DataSourceItem;
  hospital_capacity: DataSourceItem;
  road_incidents: DataSourceItem;
  ai_dispatcher: DataSourceItem;
  map?: DataSourceItem;
  database?: DataSourceItem;
}
