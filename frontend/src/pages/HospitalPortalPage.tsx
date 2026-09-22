import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Emergency, Hospital, LiveAmbulanceGPS, OptimizationResult } from '../types';
import { lifelineApi } from '../services/api';
import { TacticalMap } from '../components/TacticalMap';
import { useAuth } from '../context/AuthContext';
import {
  Hospital as HospitalIcon,
  Activity,
  Ambulance,
  PhoneCall,
  Clock,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  LogOut,
  MapPin,
  ChevronRight,
  User,
  Heart
} from 'lucide-react';

export const HospitalPortalPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [selectedEmergency, setSelectedEmergency] = useState<Emergency | null>(null);
  const [selectedOptimization, setSelectedOptimization] = useState<OptimizationResult | null>(null);
  const [hospitalInfo, setHospitalInfo] = useState<Hospital | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [apiError, setApiError] = useState<string | null>(null);

  // Fetch Inbound Emergencies for Hospital
  const fetchInboundEmergencies = useCallback(async () => {
    try {
      const emgList = await lifelineApi.listEmergencies();
      // Filter for active non-completed emergencies
      const inbound = (emgList || []).filter((e: Emergency) =>
        ['CREATED', 'SEARCHING', 'DISPATCHING', 'DRIVER_ALERTED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'PATIENT_ONBOARD', 'TRANSPORTING'].includes(e.status)
      );

      setEmergencies(inbound);
      setLastRefreshed(new Date());
      setApiError(null);

      // Auto-select first emergency if none selected or selection closed
      if (inbound.length > 0 && (!selectedEmergency || !inbound.some((e: Emergency) => e.id === selectedEmergency.id))) {
        setSelectedEmergency(inbound[0]);
      } else if (inbound.length === 0) {
        setSelectedEmergency(null);
        setSelectedOptimization(null);
      }
    } catch (err: any) {
      console.warn('[Hospital Portal] Refresh note:', err);
      setApiError('Unable to refresh inbound emergency feed.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedEmergency]);

  // Load Optimization for Selected Emergency
  useEffect(() => {
    if (selectedEmergency) {
      lifelineApi.optimizeEmergency(selectedEmergency.id)
        .then((opt) => setSelectedOptimization(opt))
        .catch(() => setSelectedOptimization(null));
    }
  }, [selectedEmergency?.id]);

  useEffect(() => {
    fetchInboundEmergencies();
    const timer = setInterval(fetchInboundEmergencies, 5000);
    return () => clearInterval(timer);
  }, [fetchInboundEmergencies]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans selection:bg-cyan-500/30">
      {/* ── Top Command Bar ── */}
      <header className="px-4 sm:px-6 py-3.5 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="p-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm text-white">
                {user?.hospital_name || (user?.is_demo ? 'Apollo Hospital (Demo ER)' : 'Hospital Emergency Command')}
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                ER ONLINE
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Staff: {user?.name || 'Dr. Radhika Srinivasan'} · {emergencies.length} Inbound Units Active
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchInboundEmergencies}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-all"
            title="Refresh feed"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/');
            }}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-all"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── Main 3-Column Command Workspace ── */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto animate-fadeIn">
        {emergencies.length === 0 ? (
          /* ── Clean Empty State (When 0 Active Cases) ── */
          <div className="p-10 rounded-3xl bg-slate-900/60 border border-slate-800 text-center space-y-3 max-w-lg mx-auto my-12 shadow-2xl">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
            <div className="font-black text-lg text-white">NO INBOUND EMERGENCIES</div>
            <p className="text-xs text-slate-400">
              Your emergency department has no active LifeLine inbound cases currently. Incoming ambulance transfers and patient alerts will automatically stream here.
            </p>
            <div className="text-[11px] font-mono text-slate-500 pt-2">
              Auto-updating via live telemetry · {lastRefreshed.toLocaleTimeString()}
            </div>
          </div>
        ) : (
          /* ── 3-Column Layout: Left Feed | Center Map | Right Case Triage ── */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* ── Column 1: Inbound Emergency Cases Feed (4 cols) ── */}
            <div className="lg:col-span-4 space-y-3">
              <div className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between px-1">
                <span>INBOUND STREAM ({emergencies.length})</span>
                <span className="text-[10px] text-slate-500">LIVE AUTO-SYNC</span>
              </div>

              <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                {emergencies.map((emg) => {
                  const isSelected = selectedEmergency?.id === emg.id;
                  const isCritical = emg.severity === 'CRITICAL' || emg.severity === 'HIGH';
                  return (
                    <button
                      key={emg.id}
                      type="button"
                      onClick={() => setSelectedEmergency(emg)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all ${
                        isSelected
                          ? 'bg-slate-900 border-cyan-500/80 shadow-lg shadow-cyan-950/50'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-cyan-400">
                            {emg.code || `EMG-${emg.id.slice(0, 5).toUpperCase()}`}
                          </span>
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            isCritical ? 'bg-red-950 text-red-300 border border-red-500/40' : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                          }`}>
                            {emg.severity}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                          {emg.status}
                        </span>
                      </div>

                      <div className="font-bold text-sm text-white mt-1.5 truncate">
                        {emg.title || emg.incident_type.replace('_', ' ')}
                      </div>

                      <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                        "{emg.description}"
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Column 2: Live Tactical Map (5 cols) ── */}
            <div className="lg:col-span-5 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 relative h-96 lg:h-[600px]">
              <TacticalMap
                emergency={selectedEmergency || undefined}
                selectedHospital={selectedOptimization?.selected_hospital}
                selectedRoute={selectedOptimization?.selected_route}
                className="h-full w-full"
              />
              <div className="absolute top-3 left-3 bg-slate-950/90 backdrop-blur-md border border-slate-700 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-mono text-slate-300 shadow-lg">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span>INBOUND RADAR</span>
              </div>
            </div>

            {/* ── Column 3: Selected Case Triage Details (3 cols) ── */}
            <div className="lg:col-span-3 space-y-4">
              {selectedEmergency ? (
                <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
                  <div>
                    <div className="text-[10px] font-mono font-bold text-cyan-400 uppercase">
                      CASE DETAILS
                    </div>
                    <h3 className="font-black text-base text-white mt-0.5">
                      {selectedEmergency.title || selectedEmergency.incident_type.replace('_', ' ')}
                    </h3>
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                      <div className="text-[10px] text-slate-500">ESTIMATED TRANSIT ETA</div>
                      <div className="text-lg font-black text-cyan-400">
                        {selectedOptimization?.travel_eta ? `~${selectedOptimization.travel_eta.toFixed(0)} min` : '5 min'}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                      <div className="text-[10px] text-slate-500">TRIAGE PATIENTS</div>
                      <div className="font-bold text-white">
                        {selectedEmergency.patient_count || 1} Total · {selectedEmergency.critical_patient_count || 0} Critical
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                      <div className="text-[10px] text-slate-500">REPORTED DESCRIPTION</div>
                      <div className="text-slate-300 text-xs font-sans">
                        "{selectedEmergency.description}"
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      ASSIGNED RESPONDING UNIT:
                    </div>
                    <div className="font-bold text-sm text-white mt-0.5">
                      {selectedEmergency.assigned_ambulance_id || 'Seeking Nearest Unit'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800 text-center text-xs text-slate-400">
                  Select an inbound emergency to inspect clinical details.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="px-4 py-3 text-center text-[11px] font-mono text-slate-500 border-t border-slate-800/50">
        LifeLine Hospital Emergency Department Portal · Authenticated Clinical Access
      </footer>
    </div>
  );
};
