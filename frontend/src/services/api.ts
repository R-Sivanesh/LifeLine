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
  ChatMessage
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
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

  // Emergencies
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
    return res.data;
  },

  listEmergencies: async (): Promise<Emergency[]> => {
    const res = await api.get('/emergencies');
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

  decideEmergency: async (emergencyId: string): Promise<OptimizationResult> => {
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
