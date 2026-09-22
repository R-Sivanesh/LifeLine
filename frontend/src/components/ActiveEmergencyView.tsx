import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Emergency, OptimizationResult, LiveAmbulanceGPS } from '../types';
import { lifelineApi } from '../services/api';
import { TacticalMap } from './TacticalMap';
import { subscribeToAmbulanceUpdates } from '../services/firebase';
import {
  PhoneCall,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  MapPin,
  Ambulance,
  Building2,
  ShieldCheck,
  Clock,
  Navigation,
  XCircle,
  WifiOff,
  Radio,
  Share2,
  Check
} from 'lucide-react';

interface ActiveEmergencyViewProps {
  emergency: Emergency;
  initialOptimization?: OptimizationResult | null;
  onExit: () => void;
}

export const ActiveEmergencyView: React.FC<ActiveEmergencyViewProps> = ({
  emergency: initialEmergency,
  initialOptimization,
  onExit
}) => {
  const [emergency, setEmergency] = useState<Emergency>(initialEmergency);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(initialOptimization || null);
  const [liveAmbulance, setLiveAmbulance] = useState<any>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState<number>(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // Polling interval ref
  const pollTimerRef = useRef<any>(null);
  const secondTickerRef = useRef<any>(null);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsReconnecting(false);
      fetchLatestStatus();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setIsReconnecting(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Update ticker every second
  useEffect(() => {
    secondTickerRef.current = setInterval(() => {
      setSecondsSinceUpdate((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(secondTickerRef.current);
  }, []);

  // Fetch optimization if not already loaded
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
      console.warn('[ActiveEmergency] Failed to load optimization plan:', err);
    }
  }, []);

  // Poll latest emergency & assigned ambulance state
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
      console.warn('[ActiveEmergency] Status refresh failed (network/offline):', err);
      setIsReconnecting(true);
    }
  }, [emergency.id]);

  useEffect(() => {
    if (!optimization) {
      loadOptimization(emergency.id);
    }

    // Set up live ambulance telemetry subscription
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

    // Start polling every 3.5 seconds
    pollTimerRef.current = setInterval(() => {
      fetchLatestStatus();
    }, 3500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (unsubscribeFirebase) unsubscribeFirebase();
    };
  }, [emergency.id, emergency.assigned_ambulance_id, optimization, loadOptimization, fetchLatestStatus]);

  // Handle emergency cancellation
  const handleCancelEmergency = async () => {
    setIsCancelling(true);
    try {
      await lifelineApi.cancelEmergency(emergency.id, 'PATIENT_REQUESTED_CANCELLATION');
      lifelineApi.clearPatientSession();
      setShowCancelConfirm(false);
      onExit();
    } catch (err) {
      console.error('Failed to cancel emergency:', err);
      alert('Could not cancel emergency. Please try again or call 108 directly.');
    } finally {
      setIsCancelling(false);
    }
  };

  const status = emergency.status;
  const isAssigned = !!emergency.assigned_ambulance_id || ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'ON_SCENE', 'PATIENT_ONBOARD', 'TRANSPORTING'].includes(status);
  const isArrived = status === 'ARRIVED' || status === 'ON_SCENE';
  const isTransporting = status === 'PATIENT_ONBOARD' || status === 'TRANSPORTING';
  const isCompleted = status === 'COMPLETED' || status === 'RESOLVED';
  const isCancelled = status === 'CANCELLED';

  const sessionCode = emergency.code || (emergency.session?.session_code) || `EMG-${emergency.id.slice(0, 5).toUpperCase()}`;

  // Telemetry Provenance Status
  const getProvenanceBadge = () => {
    if (emergency.is_demo || liveAmbulance?.is_demo) {
      return (
        <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950 px-2 py-0.5 rounded border border-amber-500/40">
          DEMO TELEMETRY
        </span>
      );
    }
    if (secondsSinceUpdate > 60) {
      return (
        <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-500/40">
          🟡 STALE • Updated {secondsSinceUpdate}s ago
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/40 flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
        <span>LIVE • Updated {secondsSinceUpdate}s ago</span>
      </span>
    );
  };

  // ═════════════════════════════════════════════════════════════════
  // STAGE 5: COMPLETED / RESOLVED
  // ═════════════════════════════════════════════════════════════════
  if (isCompleted) {
    return (
      <div className="max-w-lg mx-auto w-full px-4 py-8 space-y-6 animate-fadeIn text-center font-sans">
        <div className="h-20 w-20 mx-auto rounded-3xl bg-emerald-950 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-2xl shadow-emerald-600/30 card-glow-emerald">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
            ✓ EMERGENCY COMPLETED
          </div>
          <h1 className="text-3xl font-black text-white">Hospital Reached</h1>
          <p className="text-sm text-zinc-400 max-w-sm mx-auto">
            Emergency case <span className="font-mono text-cyan-300 font-bold">{sessionCode}</span> has been safely closed.
          </p>
        </div>

        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 text-left space-y-3 shadow-xl">
          <div className="text-xs font-mono text-zinc-400 uppercase font-bold">Case Summary</div>
          <div className="text-sm text-zinc-200">{emergency.description}</div>
          {optimization?.selected_hospital && (
            <div className="pt-2 border-t border-zinc-800 text-xs font-mono text-zinc-400">
              Receiving Hospital: <span className="text-white font-bold">{optimization.selected_hospital.name}</span>
            </div>
          )}
          <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-500">
            <span>Status: RESOLVED</span>
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
        </div>

        <button
          onClick={() => {
            lifelineApi.clearPatientSession();
            onExit();
          }}
          className="w-full py-4 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-base shadow-xl transition-all active:scale-[0.98]"
        >
          Return to LifeLine Home
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto w-full space-y-4 animate-fadeIn font-sans">
      {/* ── Network Connection Warning Banner ── */}
      {(!isOnline || isReconnecting) && (
        <div className="p-3.5 rounded-2xl bg-amber-950/90 border border-amber-500/60 text-amber-200 text-xs flex items-center justify-between shadow-xl animate-pulse">
          <div className="flex items-center gap-2.5">
            <WifiOff className="h-4 w-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold block">⚠ Connection lost</span>
              <span className="text-[11px] text-amber-300/80">Reconnecting to your emergency session...</span>
            </div>
          </div>
          <button
            onClick={fetchLatestStatus}
            className="px-2.5 py-1 rounded-lg bg-amber-900/80 border border-amber-500/40 text-amber-300 font-mono text-[11px] font-bold flex items-center gap-1 hover:bg-amber-800"
          >
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 1. TOP EMERGENCY STATUS HEADER (TRANSFORMS BY STATE)              */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className={`p-5 rounded-3xl border-2 shadow-2xl space-y-3 relative overflow-hidden ${
        isTransporting
          ? 'bg-gradient-to-b from-blue-950 via-zinc-950 to-zinc-950 border-blue-500/60 card-glow-cyan'
          : isArrived
          ? 'bg-gradient-to-b from-emerald-950 via-zinc-950 to-zinc-950 border-emerald-500/60 card-glow-emerald'
          : isAssigned
          ? 'bg-gradient-to-b from-emerald-950 via-zinc-950 to-zinc-950 border-emerald-500/50 card-glow-emerald'
          : 'bg-gradient-to-b from-amber-950 via-zinc-950 to-zinc-950 border-amber-500/50 card-glow-amber'
      }`}>
        <div className="flex items-center justify-between">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${
              isAssigned ? 'bg-emerald-500 animate-ping' : 'bg-amber-500 animate-pulse'
            }`} />
            <span className={`text-xs font-mono font-black tracking-wider uppercase ${
              isTransporting ? 'text-cyan-400' : isArrived ? 'text-emerald-400' : isAssigned ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              {isTransporting
                ? '🟢 TRANSPORTING'
                : isArrived
                ? '🟢 AMBULANCE ARRIVED'
                : isAssigned
                ? '🟢 AMBULANCE ASSIGNED'
                : '🚑 FINDING EMERGENCY ASSISTANCE'}
            </span>
          </div>

          {/* Emergency Session Code */}
          <div className="text-right flex items-center gap-1.5">
            <div>
              <span className="text-[10px] font-mono text-zinc-500 block uppercase">Session</span>
              <span className="text-xs font-mono font-black text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">
                {sessionCode}
              </span>
            </div>
          </div>
        </div>

        {/* State Headline & Subtext */}
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight leading-tight">
            {isTransporting
              ? 'En route to hospital emergency room'
              : isArrived
              ? 'Ambulance is at your scene'
              : isAssigned
              ? 'Verified ambulance is responding'
              : 'Contacting nearby ambulance drivers...'}
          </h1>
          <p className="text-xs text-zinc-300 mt-1">
            {isTransporting
              ? `Patient onboard. Transporting to ${optimization?.selected_hospital.name || 'Receiving Hospital'}.`
              : isArrived
              ? 'Paramedic unit has arrived at your emergency coordinates.'
              : isAssigned
              ? 'A verified ambulance unit has accepted and is actively driving towards your location.'
              : 'Our deterministic dispatch engine is alerting eligible nearby drivers.'}
          </p>
        </div>

        {/* Searching Checklist (Priority 6) */}
        {!isAssigned && (
          <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-1.5 text-xs font-mono">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <Check className="h-3.5 w-3.5" />
              <span>Emergency received</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <Check className="h-3.5 w-3.5" />
              <span>Location confirmed: {emergency.latitude.toFixed(4)}, {emergency.longitude.toFixed(4)}</span>
            </div>
            <div className="flex items-center gap-2 text-amber-400 animate-pulse font-bold">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Contacting eligible nearby registered drivers... Waiting for acceptance.</span>
            </div>
          </div>
        )}

        {/* Freshness Provenance Banner */}
        <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Radio className="h-3 w-3 text-cyan-400 animate-pulse" />
            <span>Telemetry</span>
          </div>
          {getProvenanceBadge()}
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 2. PROMINENT AMBULANCE STATUS CARD                                */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center text-2xl shadow-lg ${
              isAssigned ? 'bg-cyan-950 border border-cyan-500/40 text-cyan-400' : 'bg-amber-950 border border-amber-500/40 text-amber-400'
            }`}>
              🚑
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-white">
                  {isAssigned
                    ? (liveAmbulance?.vehicle_number || 'Assigned Ambulance')
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
              <div className="text-xs text-zinc-400 mt-0.5">
                {isAssigned
                  ? (liveAmbulance?.capability || 'Advanced Life Support (ALS)')
                  : 'Awaiting Driver Acceptance'}
              </div>
            </div>
          </div>

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
            <div className="text-[10px] uppercase text-zinc-500">
              {isTransporting
                ? 'Hospital ETA'
                : isAssigned
                ? 'Estimated Arrival'
                : 'Unit Assignment'}
            </div>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 3. LIVE TACTICAL MAP VIEW (DOMINATES SCREEN)                      */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="rounded-3xl overflow-hidden border-2 border-zinc-700 shadow-2xl bg-zinc-950 relative h-72 sm:h-80">
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

        {/* Floating Map Overlay Badge */}
        <div className="absolute top-3 left-3 bg-zinc-950/90 backdrop-blur-md border border-zinc-700 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-mono text-zinc-300 shadow-lg">
          <span className={`h-2 w-2 rounded-full ${isAssigned ? 'bg-emerald-400 animate-ping' : 'bg-amber-400 animate-pulse'}`} />
          <span>{isAssigned ? 'LIVE TRACKING' : 'SEARCHING RADAR'}</span>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 4. RECOMMENDED HOSPITAL CARD (DATA HONESTY & CALL BUTTON)         */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {optimization?.selected_hospital && (
        <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-emerald-500/40 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xl">
                🏥
              </div>
              <div>
                <div className="text-[10px] font-mono font-bold text-emerald-400 uppercase">
                  RECOMMENDED RECEIVING HOSPITAL
                </div>
                <div className="font-bold text-sm text-white truncate max-w-[200px] sm:max-w-xs">
                  {optimization.selected_hospital.name}
                </div>
                <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                  {optimization.travel_eta ? `~${optimization.travel_eta.toFixed(0)} min driving` : 'Direct Route'} · Google Places Directory
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-base font-black font-mono text-emerald-400">
                {optimization.travel_eta ? `${optimization.travel_eta.toFixed(0)}m` : 'Ready'}
              </div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase">Driving Time</div>
            </div>
          </div>

          {/* Hospital Readiness: Data Honesty Rule (Priority 10) */}
          <div className="p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800 flex items-center justify-between text-[11px] font-mono text-zinc-400">
            <span>Hospital readiness:</span>
            <span className="text-zinc-300 font-bold">UNKNOWN (Call to confirm)</span>
          </div>

          {/* Hospital Direct Dial Button */}
          {optimization.selected_hospital.phone ? (
            <a
              href={`tel:${optimization.selected_hospital.phone}`}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all active:scale-[0.98]"
            >
              <PhoneCall className="h-4 w-4" />
              <span>CALL HOSPITAL ({optimization.selected_hospital.phone})</span>
            </a>
          ) : (
            <a
              href="tel:108"
              className="w-full py-3.5 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all"
            >
              <PhoneCall className="h-4 w-4" />
              <span>CALL 108 DISPATCH TO NOTIFY HOSPITAL</span>
            </a>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 5. TRAFFIC-AWARE ROUTING / PRIORITY CORRIDOR (PRIORITY 11)       */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {optimization?.corridor_analysis && (
        <div className="p-4 rounded-3xl bg-zinc-900/90 border border-cyan-500/40 shadow-xl space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between font-bold text-cyan-400 text-xs">
            <span className="flex items-center gap-1.5">
              <Navigation className="h-3.5 w-3.5" />
              <span>TRAFFIC-AWARE EMERGENCY CORRIDOR</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/30">
              {optimization.corridor_analysis.congestion_severity} TRAFFIC
            </span>
          </div>
          <p className="text-zinc-300 text-[11px] leading-relaxed">
            {optimization.corridor_analysis.reason}
          </p>
          <div className="text-[10px] text-zinc-500 pt-1 border-t border-zinc-800">
            {optimization.corridor_analysis.traffic_control_integration}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 6. EMERGENCY SERVICES HOTLINES (108 / 112)                        */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <a
          href="tel:108"
          className="p-4 rounded-2xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 border border-red-400 transition-all active:scale-[0.98]"
        >
          <PhoneCall className="h-4 w-4" />
          <span>CALL 108</span>
        </a>
        <a
          href="tel:112"
          className="p-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        >
          <PhoneCall className="h-4 w-4 text-zinc-400" />
          <span>CALL 112</span>
        </a>
      </div>

      {/* ── Cancel Emergency Request Action ── */}
      <div className="pt-2 text-center">
        <button
          onClick={() => setShowCancelConfirm(true)}
          className="text-xs font-mono text-zinc-500 hover:text-red-400 transition-colors py-2 px-3 underline decoration-dotted"
        >
          Cancel Emergency Assistance
        </button>
      </div>

      {/* ── Cancel Confirmation Modal ── */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="h-12 w-12 rounded-2xl bg-red-950 border border-red-500/40 flex items-center justify-center text-red-400 mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white">Cancel Emergency Request?</h3>
              <p className="text-xs text-zinc-400">
                Dispatched ambulance units and receiving hospitals will be immediately notified of cancellation.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 font-bold text-xs"
              >
                Keep Active
              </button>
              <button
                onClick={handleCancelEmergency}
                disabled={isCancelling}
                className="py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                {isCancelling ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                <span>Yes, Cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActiveEmergencyView;
