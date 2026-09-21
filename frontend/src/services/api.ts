import axios from 'axios';
import {
  Emergency,
  EmergencyAnalysis,
  Ambulance,
  AmbulanceRecommendation,
  Hospital,
  HospitalRecommendation,
  OptimizationResult,
  DecisionExplanation,
  RerouteResult,
  RoadIncident,
  ChatRequest,
  ChatResponse,
  DataSourceStatusResponse,
  ChatMessage,
  Driver,
  DriverAuthResponse,
  DriverAlertItem,
  DriverAcceptResponse,
  SendOtpRequest,
  SendOtpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
  AnalyticsMetrics,
  AnalyticsHotspot,
  EmergencyAuditEvent
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Attach session token if stored
api.interceptors.request.use((config) => {
  const sessionToken = sessionStorage.getItem('lifeline_session_token') || localStorage.getItem('lifeline_session_token');
  if (sessionToken) {
    config.headers['X-Session-Token'] = sessionToken;
  }
  const driverToken = localStorage.getItem('lifeline_driver_token');
  if (driverToken) {
    config.headers['Authorization'] = `Bearer ${driverToken}`;
  }
  return config;
});

export const lifelineApi = {
  // Health & Data Provenance
  checkHealth: async () => {
    const res = await api.get('/health');
    return res.data;
  },

  getDataSourcesStatus: async (): Promise<DataSourceStatusResponse> => {
    const res = await api.get('/data/status');
    return res.data;
  },

  // Location & Geocoding
  searchLocation: async (query: string) => {
    const res = await api.get('/location/search', { params: { query } });
    return res.data;
  },

  reverseGeocode: async (lat: number, lng: number) => {
    const res = await api.get('/location/reverse', { params: { lat, lng } });
    return res.data;
  },

  // Gemini AI Dispatcher
  chatDispatcher: async (data: {
    message: string;
    conversation_id?: string;
    history?: ChatMessage[];
    latitude?: number;
    longitude?: number;
    location_source?: string;
    accuracy_meters?: number;
  }): Promise<ChatResponse> => {
    const res = await api.post('/ai/chat', data);
    return res.data;
  },

  analyzeEmergencyText: async (description: string): Promise<EmergencyAnalysis> => {
    const res = await api.post('/ai/analyze', null, { params: { description } });
    return res.data;
  },

  // Emergencies & Patient Session Persistence
  validatePatientSession: async (sessionToken: string): Promise<{
    is_active: boolean;
    status?: string;
    reason?: string;
    emergency?: Emergency;
    assigned_ambulance?: any;
  }> => {
    try {
      const res = await api.get(`/emergencies/session/active/${encodeURIComponent(sessionToken)}`);
      return res.data;
    } catch (e) {
      return { is_active: false, reason: 'NETWORK_OR_SERVER_ERROR' };
    }
  },

  clearPatientSession: () => {
    localStorage.removeItem('lifeline_patient_session');
    localStorage.removeItem('lifeline_session_token');
    localStorage.removeItem('lifeline_session_code');
    sessionStorage.removeItem('lifeline_session_token');
    sessionStorage.removeItem('lifeline_session_code');
  },

  createEmergency: async (data: {
    description: string;
    latitude: number;
    longitude: number;
    title?: string;
    patient_count?: number;
    critical_patient_count?: number;
    severity?: string;
    incident_type?: string;
  }): Promise<Emergency> => {
    const res = await api.post('/emergencies', data);
    if (res.data?.session?.session_token) {
      const sessionData = {
        emergency_id: res.data.id,
        session_token: res.data.session.session_token,
        session_code: res.data.session.session_code,
        created_at: Date.now(),
        incident_type: res.data.incident_type
      };
      localStorage.setItem('lifeline_patient_session', JSON.stringify(sessionData));
      localStorage.setItem('lifeline_session_token', res.data.session.session_token);
      localStorage.setItem('lifeline_session_code', res.data.session.session_code);
      sessionStorage.setItem('lifeline_session_token', res.data.session.session_token);
      sessionStorage.setItem('lifeline_session_code', res.data.session.session_code);
    }
    return res.data;
  },

  listEmergencies: async (statusFilter?: string): Promise<Emergency[]> => {
    const res = await api.get('/emergencies', { params: { status_filter: statusFilter } });
    return res.data;
  },

  getEmergency: async (id: string): Promise<Emergency> => {
    const res = await api.get(`/emergencies/${id}`);
    return res.data;
  },

  updateEmergencyStatus: async (id: string, status: string): Promise<Emergency> => {
    const res = await api.patch(`/emergencies/${id}/status`, { status });
    return res.data;
  },

  cancelEmergency: async (id: string, reason: string = 'PATIENT_CANCELLED'): Promise<Emergency> => {
    const res = await api.post(`/emergencies/${id}/cancel`, null, { params: { reason } });
    return res.data;
  },

  analyzeEmergency: async (id: string): Promise<EmergencyAnalysis> => {
    const res = await api.post(`/emergencies/${id}/analyze`);
    return res.data;
  },

  getAmbulanceRecommendations: async (emergencyId: string): Promise<AmbulanceRecommendation[]> => {
    const res = await api.get(`/emergencies/${emergencyId}/ambulance-recommendations`);
    return res.data;
  },

  getHospitalRecommendations: async (emergencyId: string): Promise<HospitalRecommendation[]> => {
    const res = await api.get(`/emergencies/${emergencyId}/hospital-recommendations`);
    return res.data;
  },

  optimizeEmergency: async (emergencyId: string): Promise<OptimizationResult> => {
    const res = await api.post(`/emergencies/${emergencyId}/optimize`);
    return res.data;
  },

  getDecisionExplanation: async (emergencyId: string): Promise<DecisionExplanation> => {
    const res = await api.get(`/emergencies/${emergencyId}/decision`);
    return res.data;
  },

  triggerReroute: async (emergencyId: string): Promise<RerouteResult> => {
    const res = await api.post(`/emergencies/${emergencyId}/reroute`);
    return res.data;
  },

  // Dispatch Engine & Atomic Acceptance
  alertDrivers: async (emergencyId: string, ambulanceIds: string[]): Promise<DriverAlertItem[]> => {
    const res = await api.post('/dispatch/alert', ambulanceIds, { params: { emergency_id: emergencyId } });
    return res.data;
  },

  acceptDispatch: async (data: {
    emergency_id: string;
    driver_id: string;
    ambulance_id?: string;
    latitude?: number;
    longitude?: number;
  }): Promise<DriverAcceptResponse> => {
    const res = await api.post('/dispatch/accept', data);
    return res.data;
  },

  declineDispatch: async (data: {
    emergency_id: string;
    driver_id: string;
    reason?: string;
  }) => {
    const res = await api.post('/dispatch/decline', data);
    return res.data;
  },

  transitionEmergencyState: async (data: {
    emergency_id: string;
    target_status: string;
    driver_id?: string;
    ambulance_id?: string;
    latitude?: number;
    longitude?: number;
    notes?: string;
  }) => {
    const res = await api.post('/dispatch/transition', data);
    return res.data;
  },

  getDriverAlerts: async (driverId: string): Promise<DriverAlertItem[]> => {
    const res = await api.get(`/dispatch/alerts/${driverId}`);
    return res.data;
  },

  // Mobile OTP & Authentication
  sendOtp: async (data: { phone: string; role?: string }): Promise<SendOtpResponse> => {
    const res = await api.post('/auth/send-otp', data);
    return res.data;
  },

  verifyOtp: async (data: VerifyOtpRequest): Promise<VerifyOtpResponse> => {
    const res = await api.post('/auth/verify-otp', data);
    if (res.data?.token) {
      localStorage.setItem('lifeline_driver_token', res.data.token);
      if (res.data.driver) {
        localStorage.setItem('lifeline_driver_profile', JSON.stringify(res.data.driver));
      }
    }
    return res.data;
  },

  // Driver Authentication & Management
  driverGoogleLogin: async (data: {
    email: string;
    name: string;
    google_id?: string;
    phone?: string;
    ambulance_id?: string;
    role?: string;
  }): Promise<DriverAuthResponse> => {
    const res = await api.post('/auth/google-login', data);
    if (res.data?.token) {
      localStorage.setItem('lifeline_driver_token', res.data.token);
      localStorage.setItem('lifeline_driver_profile', JSON.stringify(res.data.driver));
    }
    return res.data;
  },

  getCurrentDriver: async (driverId?: string): Promise<Driver> => {
    const res = await api.get('/auth/me', { params: { driver_id: driverId } });
    return res.data;
  },

  updateDriverStatus: async (driverId: string, statusData: {
    status: string;
    latitude?: number;
    longitude?: number;
    speed?: number;
    heading?: number;
    accuracy?: number;
  }): Promise<Driver> => {
    const res = await api.post('/auth/driver-status', statusData, { params: { driver_id: driverId } });
    return res.data;
  },

  listDrivers: async (): Promise<Driver[]> => {
    const res = await api.get('/auth/drivers');
    return res.data;
  },

  // Operational Analytics & Audit History
  getAnalyticsMetrics: async (): Promise<AnalyticsMetrics> => {
    const res = await api.get('/analytics/metrics');
    return res.data;
  },

  getAnalyticsHotspots: async (): Promise<AnalyticsHotspot[]> => {
    const res = await api.get('/analytics/hotspots');
    return res.data;
  },

  getAuditLog: async (params?: { emergency_id?: string; limit?: number }): Promise<EmergencyAuditEvent[]> => {
    const res = await api.get('/analytics/audit-log', { params });
    return res.data;
  },

  // Live Google Places & Routes
  getNearbyHospitals: async (lat: number, lng: number, radius: number = 8000) => {
    const res = await api.get('/hospitals/nearby', {
      params: { lat, lng, radius }
    });
    return res.data;
  },

  getLiveRoute: async (origLat: number, origLon: number, destLat: number, destLon: number) => {
    const res = await api.get('/routes/live', {
      params: { orig_lat: origLat, orig_lon: origLon, dest_lat: destLat, dest_lon: destLon }
    });
    return res.data;
  },

  // Live Ambulances & GPS Telemetry
  getLiveAmbulances: async (): Promise<{ source: string; status: string; count: number; ambulances: any[] }> => {
    const res = await api.get('/ambulances/live');
    return res.data;
  },

  sendAmbulanceTelemetry: async (telemetry: {
    id: string;
    vehicle_number?: string;
    capability?: string;
    status: string;
    latitude: number;
    longitude: number;
    speed?: number | null;
    heading?: number | null;
    accuracy?: number | null;
    updated_at?: number;
    source?: string;
    driver_id?: string;
  }) => {
    const res = await api.post('/ambulances/telemetry', telemetry);
    return res.data;
  },

  // Ambulances & Hospitals
  listAmbulances: async (): Promise<Ambulance[]> => {
    const res = await api.get('/ambulances');
    return res.data;
  },

  listHospitals: async (): Promise<Hospital[]> => {
    const res = await api.get('/hospitals');
    return res.data;
  },

  // Demo & Simulation
  resetDemo: async () => {
    const res = await api.post('/demo/reset');
    return res.data;
  },

  seedDemo: async () => {
    const res = await api.post('/demo/seed');
    return res.data;
  },

  blockRouteDemo: async (coords?: { latitude: number; longitude: number }) => {
    const res = await api.post('/demo/block-route', null, {
      params: coords
    });
    return res.data;
  },

  createHeroEmergency: async (): Promise<Emergency> => {
    const res = await api.post('/demo/create-emergency');
    return res.data;
  },

  getRoadIncidents: async (): Promise<RoadIncident[]> => {
    const res = await api.get('/demo/incidents');
    return res.data;
  }
};
