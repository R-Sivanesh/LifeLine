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
  RoadIncident
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const lifelineApi = {
  // Health
  checkHealth: async () => {
    const res = await api.get('/health');
    return res.data;
  },

  // Emergencies
  createEmergency: async (data: {
    description: string;
    latitude: number;
    longitude: number;
    title?: string;
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

  getDecisionExplanation: async (emergencyId: string): Promise<DecisionExplanation> => {
    const res = await api.get(`/emergencies/${emergencyId}/decision`);
    return res.data;
  },

  triggerReroute: async (emergencyId: string): Promise<RerouteResult> => {
    const res = await api.post(`/emergencies/${emergencyId}/reroute`);
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
