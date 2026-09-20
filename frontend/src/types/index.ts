export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type EmergencyStatus = 'ACTIVE' | 'DISPATCHED' | 'EN_ROUTE' | 'ARRIVED' | 'RESOLVED';
export type AmbulanceCapability = 'BASIC' | 'ADVANCED' | 'ICU';
export type AmbulanceStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE';
export type HospitalStatus = 'OPEN' | 'LIMITED' | 'CLOSED';
export type IncidentType = 'ACCIDENT' | 'FLOOD' | 'ROAD_BLOCK' | 'CONSTRUCTION' | 'CONGESTION' | 'HAZARD';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';

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
  status: EmergencyStatus;
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

export interface HospitalRecommendation {
  hospital_id: string;
  name: string;
  eta_minutes: number;
  match_score: number;
  reasons: string[];
  latitude: number;
  longitude: number;
  trauma_capable: boolean;
  icu_available: boolean;
  available_beds: number;
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
}

export interface DecisionExplanation {
  ambulance_reason: string;
  hospital_reason: string;
  route_reason: string;
  overall_reason: string;
}

export interface RerouteResult {
  rerouted: boolean;
  reason: string;
  old_eta_minutes: number;
  new_eta_minutes: number;
  new_route?: RouteOption;
  old_route?: RouteOption;
}

export interface EmergencyAnalysis {
  incident_type: string;
  patient_count: number;
  critical_patient_count: number;
  severity: Severity;
  location_description: string;
  special_requirements: string[];
}
