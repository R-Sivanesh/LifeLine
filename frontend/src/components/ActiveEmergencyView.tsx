import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Emergency,
  OptimizationResult,
  LiveAmbulanceGPS,
  Coordinate
} from '../types';
import { TacticalMap } from './TacticalMap';
import { lifelineApi } from '../services/api';
import { subscribeToAmbulanceUpdates } from '../services/firebase';
import {
  PhoneCall,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Clock,
  Radio,
  Hospital as HospitalIcon,
  CheckCircle2,
  Check,
  Navigation,
  X,
  Phone
} from 'lucide-react';

interface ActiveEmergencyViewProps {
  initialEmergency: Emergency;
  initialOptimization?: OptimizationResult;
  onExit: () => void;
}

export const ActiveEmergencyView: React.FC<ActiveEmergencyViewProps> = ({
  initialEmergency,
  initialOptimization,
  onExit
}) => {
  const [emergency, setEmergency] = useState<Emergency>(initialEmergency);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(initialOptimization || null);
  const [liveAmbulance, setLiveAmbulance] = useState<any | null>(null);

  // Connection & Refresh State
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState<number>(0);

  // Cancellation Modal State
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const pollTimerRef = useRef<any>(null);
  const secondTickerRef = useRef<any>(null);

  // Second Ticker
  useEffect(() => {
    secondTickerRef.current = setInterval(() => {
      setSecondsSinceUpdate((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(secondTickerRef.current);
  }, []);

  // Fetch Golden Minute Optimization Plan
  const loadOptimization = useCallback(async (emgId: string) => {
    try {
      const opt = await lifelineApi.optimizeEmergency(emgId);
      setOptimization(opt);
      if (opt.selected_ambulance) {
        setLiveAmbulance({
          ambulance_id: opt.selected_ambulance.ambulance_id,
          vehicle_number: opt.selected_ambulance.vehicle_number,
          latitude: opt.selected_ambulance.latitude,
          longitude: opt.selected_ambulance.longitude,
          capability: opt.selected_ambulance.capability,
          distance_km: opt.selected_ambulance.distance_km,
          eta_minutes: opt.ambulance_eta
        });
      }
    } catch (err) {
      console.warn('[ActiveEmergency] Optimization calculation note:', err);
    }
  }, []);

  // Periodic Status Poll & Session Validation
  const fetchLatestStatus = useCallback(async () => {
    if (!emergency.id) return;
    try {
      const sessionToken = localStorage.getItem('lifeline_session_token') || sessionStorage.getItem('lifeline_session_token');
      if (sessionToken) {
        const sessionRes = await lifelineApi.validatePatientSession(sessionToken);
        if (sessionRes.is_active && sessionRes.emergency) {
          setEmergency(sessionRes.emergency);
          if (sessionRes.assigned_ambulance) {
            setLiveAmbulance(sessionRes.assigned_ambulance);
          }
          setIsReconnecting(false);
          setLastSyncTime(new Date());
          setSecondsSinceUpdate(0);
        } else if (sessionRes.status === 'COMPLETED' || sessionRes.status === 'RESOLVED') {
          if (sessionRes.emergency) setEmergency(sessionRes.emergency);
        }
      } else {
        const freshEmg = await lifelineApi.getEmergency(emergency.id);
        setEmergency(freshEmg);
        setIsReconnecting(false);
        setLastSyncTime(new Date());
        setSecondsSinceUpdate(0);
      }
    } catch (err) {
      console.warn('[ActiveEmergency] Status refresh check (offline):', err);
      setIsReconnecting(true);
    }
  }, [emergency.id]);

  useEffect(() => {
    if (!optimization) {
      loadOptimization(emergency.id);
    }

    // Live Telemetry Subscription via Firebase
    const unsubscribeFirebase = subscribeToAmbulanceUpdates((ambs: LiveAmbulanceGPS[]) => {
      if (emergency.assigned_ambulance_id) {
        const matching = ambs.find((a) => a.id === emergency.assigned_ambulance_id || a.vehicle_number === emergency.assigned_ambulance_id);
        if (matching) {
          setLiveAmbulance(matching);
          setSecondsSinceUpdate(0);
          setLastSyncTime(new Date());
        }
      }
    });

    // 3.5s Polling Interval
    pollTimerRef.current = setInterval(() => {
      fetchLatestStatus();
    }, 3500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (unsubscribeFirebase) unsubscribeFirebase();
    };
  }, [emergency.id, emergency.assigned_ambulance_id, optimization, loadOptimization, fetchLatestStatus]);

  // Handle Cancellation
  const handleCancelEmergency = async () => {
    setIsCancelling(true);
    try {
      await lifelineApi.cancelEmergency(emergency.id, 'PATIENT_REQUESTED_CANCELLATION');
      lifelineApi.clearPatientSession();
      setShowCancelConfirm(false);
      onExit();
    } catch (err) {
      console.error('Failed to cancel emergency:', err);
      alert('Could not cancel emergency. Please dial 108 directly.');
    } finally {
      setIsCancelling(false);
    }
  };

  const status = emergency.status;
  const isAssigned = !!emergency.assigned_ambulance_id || ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'ON_SCENE', 'PATIENT_ONBOARD', 'TRANSPORTING'].includes(status);
  const isArrived = status === 'ARRIVED' || status === 'ON_SCENE';
  const isTransporting = status === 'PATIENT_ONBOARD' || status === 'TRANSPORTING';
  const isCompleted = status === 'COMPLETED' || status === 'RESOLVED';
  const isNoAmbulance = status === 'NO_VERIFIED_AMBULANCE_AVAILABLE' || (!isAssigned && optimization?.has_live_ambulance === false && optimization?.no_ambulance_reason);

  const sessionCode = emergency.code || (emergency.session?.session_code) || `EMG-${emergency.id.slice(0, 5).toUpperCase()}`;

  // Telemetry Provenance Badge
  const getProvenanceBadge = () => {
    if (emergency.is_demo || liveAmbulance?.is_demo) {
      return (
        <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/40">
          DEMO TELEMETRY
        </span>
      );
    }
    if (secondsSinceUpdate > 60) {
      return (
        <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/40">
          🟡 STALE • Updated {secondsSinceUpdate}s ago
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40 flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span>LIVE • Updated {secondsSinceUpdate}s ago</span>
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans selection:bg-cyan-500/30">
      {/* ── Top Header ── */}
      <header className="px-4 sm:px-6 py-3.5 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-sm text-white">{sessionCode}</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-500/40">
                ACTIVE
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {emergency.incident_type ? emergency.incident_type.replace('_', ' ') : 'Emergency Assistance'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isReconnecting && (
            <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1 bg-amber-950/60 px-2 py-1 rounded border border-amber-500/30">
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>Reconnecting</span>
            </span>
          )}

          <a
            href="tel:108"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs shadow-md shadow-red-600/30 transition-all active:scale-95"
          >
            <PhoneCall className="h-3.5 w-3.5" />
            <span>108</span>
          </a>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 space-y-5 animate-fadeIn">
        {/* ── 1. AMBULANCE STATUS & DISPATCH TIMELINE ── */}
        <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center text-2xl shadow-lg shrink-0 ${
                isAssigned ? 'bg-cyan-950 border border-cyan-500/40 text-cyan-400' : 'bg-amber-950 border border-amber-500/40 text-amber-400'
              }`}>
                🚑
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm sm:text-base text-white">
                    {isAssigned
                      ? (liveAmbulance?.vehicle_number || 'Assigned Unit')
                      : 'Searching for Verified Unit...'}
                  </span>
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                    isAssigned
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-950 text-amber-300 border-amber-500/40'
                  }`}>
                    {emergency.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {isAssigned
                    ? (liveAmbulance?.capability || 'Advanced Life Support (ALS)')
                    : 'Awaiting Driver Acceptance'}
                </div>
              </div>
            </div>

            {/* Right ETA Display */}
            <div className="text-right font-mono">
              <div className="text-xl sm:text-2xl font-black text-cyan-400">
                {isTransporting
                  ? (optimization?.travel_eta ? `~${optimization.travel_eta.toFixed(0)} min` : 'TRANSIT')
                  : isArrived
                  ? 'ARRIVED'
                  : isAssigned
                  ? (secondsSinceUpdate > 60
                      ? 'STALE'
                      : (liveAmbulance?.eta_minutes
                          ? `~${liveAmbulance.eta_minutes.toFixed(0)} min`
                          : (optimization?.ambulance_eta ? `~${optimization.ambulance_eta.toFixed(0)} min` : 'EN ROUTE')))
                  : 'AWAITING'}
              </div>
              <div className="text-[10px] uppercase text-slate-500">
                {isTransporting ? 'Hospital ETA' : isAssigned ? 'Estimated Arrival' : 'Unit Assignment'}
              </div>
            </div>
          </div>

          {/* Unassigned Searching Status Checklist */}
          {!isAssigned && (
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1.5 text-xs font-mono">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <Check className="h-3.5 w-3.5" />
                <span>Emergency received &amp; logged</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <Check className="h-3.5 w-3.5" />
                <span>Location confirmed: {emergency.latitude.toFixed(4)}, {emergency.longitude.toFixed(4)}</span>
              </div>
              <div className="flex items-center gap-2 text-amber-400 font-bold animate-pulse">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Contacting nearby registered drivers... Waiting for acceptance.</span>
              </div>
            </div>
          )}

          {/* Telemetry Freshness Bar */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Radio className="h-3 w-3 text-cyan-400" />
              <span>Telemetry Status</span>
            </div>
            {getProvenanceBadge()}
          </div>
        </div>

        {/* ── 2. NO AMBULANCE WARNING BANNER (DATA HONESTY) ── */}
        {isNoAmbulance && (
          <div className="p-4 sm:p-5 rounded-3xl bg-red-950/90 border border-red-500/60 shadow-xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-red-900/60 border border-red-500 flex items-center justify-center text-red-300 text-2xl font-bold">
                ⚠
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-mono font-bold text-red-400 uppercase tracking-wider">
                  NO VERIFIED LIVE AMBULANCE AVAILABLE
                </div>
                <div className="text-xs text-red-200">
                  LifeLine could not verify a nearby registered ambulance with current GPS telemetry.
                </div>
              </div>
            </div>
            <a
              href="tel:108"
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm tracking-wide shadow-lg shadow-red-600/40 transition-all active:scale-95"
            >
              <Phone className="h-4 w-4 animate-bounce" />
              <span>CALL 108 EMERGENCY DIRECTLY</span>
            </a>
          </div>
        )}

        {/* ── 3. FULL-WIDTH LIVE TACTICAL MAP (DOMINATES SCREEN) ── */}
        <div className="rounded-3xl overflow-hidden border-2 border-slate-700 shadow-2xl bg-slate-950 relative h-72 sm:h-80">
          <TacticalMap
            emergency={emergency}
            selectedAmbulance={isAssigned && liveAmbulance && liveAmbulance.latitude && liveAmbulance.longitude ? {
              ambulance_id: liveAmbulance.ambulance_id || liveAmbulance.id,
              vehicle_number: liveAmbulance.vehicle_number || 'Live Unit',
              capability: liveAmbulance.capability || 'ALS',
              latitude: liveAmbulance.latitude,
              longitude: liveAmbulance.longitude,
              distance_km: liveAmbulance.distance_km || 0,
              eta_minutes: liveAmbulance.eta_minutes || optimization?.ambulance_eta || 0,
              match_score: 100,
              reasons: ['Assigned responding unit']
            } : undefined}
            selectedHospital={optimization?.selected_hospital}
            selectedRoute={isAssigned ? optimization?.selected_route : undefined}
            alternativeRoutes={isAssigned ? optimization?.alternative_routes : undefined}
            className="h-full w-full"
          />

          {/* Map Overlay Badge */}
          <div className="absolute top-3 left-3 bg-slate-950/90 backdrop-blur-md border border-slate-700 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-mono text-slate-300 shadow-lg">
            <span className={`h-2 w-2 rounded-full ${isAssigned ? 'bg-emerald-400 animate-ping' : 'bg-amber-400 animate-pulse'}`} />
            <span>{isAssigned ? 'LIVE TRACKING' : 'SEARCHING RADAR'}</span>
          </div>
        </div>

        {/* ── 4. RECOMMENDED RECEIVING HOSPITAL (GOOGLE PLACES DATA HONESTY) ── */}
        {optimization?.selected_hospital && (
          <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-emerald-500/40 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xl shrink-0">
                  🏥
                </div>
                <div>
                  <div className="text-[10px] font-mono font-bold text-emerald-400 uppercase">
                    RECOMMENDED RECEIVING HOSPITAL
                  </div>
                  <div className="font-bold text-sm text-white truncate max-w-[200px] sm:max-w-xs">
                    {optimization.selected_hospital.name}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {optimization.travel_eta ? `~${optimization.travel_eta.toFixed(0)} min driving` : 'Direct Route'} · Google Places Directory
                  </div>
                </div>
              </div>

              {optimization.selected_hospital.phone && (
                <a
                  href={`tel:${optimization.selected_hospital.phone}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono transition-all active:scale-95 shadow-md shadow-emerald-600/30"
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                  <span>CALL</span>
                </a>
              )}
            </div>

            <div className="text-[11px] text-slate-400 font-mono bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
              <span>Clinical Bed/ICU Capacity</span>
              <span className="text-slate-300 font-bold">UNKNOWN (Not provided by public municipal APIs)</span>
            </div>
          </div>
        )}

        {/* ── Cancel Button ── */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => setShowCancelConfirm(true)}
            className="text-xs font-mono text-slate-500 hover:text-red-400 transition-colors underline"
          >
            Cancel Emergency Assistance Request
          </button>
        </div>
      </main>

      {/* ── Cancel Confirmation Modal ── */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="h-12 w-12 rounded-2xl bg-red-950 border border-red-500/40 flex items-center justify-center text-red-400 mx-auto text-xl font-bold">
              ⚠
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white">Cancel Emergency Request?</h3>
              <p className="text-xs text-slate-400">
                Dispatched ambulance units and receiving hospitals will be immediately notified of cancellation.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 font-bold text-xs"
              >
                Keep Active
              </button>
              <button
                type="button"
                onClick={handleCancelEmergency}
                disabled={isCancelling}
                className="py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md shadow-red-600/30"
              >
                {isCancelling ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="px-4 py-3 text-center text-[11px] font-mono text-slate-500 border-t border-slate-800/50">
        Emergency Session ID: {sessionCode} · Encrypted Client Session
      </footer>
    </div>
  );
};
