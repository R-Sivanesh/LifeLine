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
  Wifi,
  Radio
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
        } else if (sessionRes.status === 'COMPLETED' || sessionRes.status === 'CANCELLED') {
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

  const isAssigned = !!emergency.assigned_ambulance_id || emergency.status === 'ACCEPTED' || emergency.status === 'EN_ROUTE' || emergency.status === 'ARRIVED' || emergency.status === 'PATIENT_ONBOARD' || emergency.status === 'TRANSPORTING';
  const isCompleted = emergency.status === 'COMPLETED' || emergency.status === 'RESOLVED';
  const isCancelled = emergency.status === 'CANCELLED';

  const sessionCode = emergency.code || (emergency.session?.session_code) || `EMG-${emergency.id.slice(0, 5).toUpperCase()}`;

  // If Emergency has reached COMPLETED or RESOLVED
  if (isCompleted) {
    return (
      <div className="max-w-lg mx-auto w-full px-4 py-8 space-y-6 animate-fadeIn text-center">
        <div className="h-20 w-20 mx-auto rounded-3xl bg-emerald-950 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-2xl shadow-emerald-600/30">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
            Case Resolved
          </div>
          <h1 className="text-3xl font-black text-white">Emergency Response Completed</h1>
          <p className="text-sm text-zinc-400 max-w-sm mx-auto">
            Emergency case <span className="font-mono text-cyan-300 font-bold">{sessionCode}</span> has been safely closed.
          </p>
        </div>

        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 text-left space-y-3">
          <div className="text-xs font-mono text-zinc-400 uppercase">Summary</div>
          <div className="text-sm text-zinc-200">{emergency.description}</div>
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
    <div className="max-w-lg mx-auto w-full px-4 py-4 space-y-4 animate-fadeIn font-sans">
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

      {/* ── Top Emergency Status Header ── */}
      <div className={`p-5 rounded-3xl border-2 shadow-2xl space-y-3 relative overflow-hidden ${
        isAssigned
          ? 'bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-950 border-emerald-500/50 card-glow-emerald'
          : 'bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-950 border-amber-500/50 card-glow-amber'
      }`}>
        <div className="flex items-center justify-between">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${isAssigned ? 'bg-emerald-500 animate-ping' : 'bg-amber-500 animate-pulse'}`} />
            <span className={`text-xs font-mono font-black tracking-wider uppercase ${isAssigned ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isAssigned ? '🟢 ACTIVE EMERGENCY' : '🟡 FINDING HELP'}
            </span>
          </div>

          {/* Emergency Session Code */}
          <div className="text-right flex items-center gap-1.5">
            {emergency.is_demo && (
              <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/90 px-1.5 py-0.5 rounded border border-amber-500/50">
                🟠 DEMO
              </span>
            )}
            <div>
              <span className="text-[10px] font-mono text-zinc-500 block uppercase">Emergency ID</span>
              <span className="text-xs font-mono font-black text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">
                {sessionCode}
              </span>
            </div>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-black text-white tracking-tight leading-tight">
            {isAssigned ? 'Emergency assistance is active.' : 'Emergency received. Finding nearby ambulance...'}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {isAssigned
              ? 'A verified ambulance unit is actively responding to your coordinates.'
              : 'Our deterministic dispatch engine is alerting the closest emergency fleet units.'}
          </p>
        </div>

        {/* Reconnect & Sync Timestamp */}
        <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono text-zinc-500">
          <div className="flex items-center gap-1.5">
            <Radio className="h-3 w-3 text-emerald-400 animate-pulse" />
            <span>Telemetry Live Sync</span>
          </div>
          <span>Updated {secondsSinceUpdate}s ago</span>
        </div>
      </div>

      {/* ── Prominent Ambulance Status Card ── */}
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center text-xl shadow-lg ${
              isAssigned ? 'bg-cyan-950 border border-cyan-500/40 text-cyan-400' : 'bg-amber-950 border border-amber-500/40 text-amber-400'
            }`}>
              🚑
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-white">
                  {liveAmbulance?.vehicle_number || (isAssigned ? 'Assigned Ambulance' : 'Searching Units...')}
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
                {liveAmbulance?.capability || 'Mobile Intensive Care Unit (MICU)'}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-black font-mono text-cyan-400">
              {optimization ? `~${optimization.ambulance_eta.toFixed(0)} min` : (isAssigned ? 'En Route' : 'Dispatching')}
            </div>
            <div className="text-[10px] font-mono uppercase text-zinc-500">Estimated Arrival</div>
          </div>
        </div>
      </div>

      {/* ── Live Tactical Map View (Dominates Screen) ── */}
      <div className="rounded-3xl overflow-hidden border-2 border-zinc-700 shadow-2xl bg-zinc-950 relative h-72 sm:h-80">
        <TacticalMap
          emergency={emergency}
          selectedAmbulance={liveAmbulance ? {
            ambulance_id: liveAmbulance.ambulance_id || liveAmbulance.id,
            vehicle_number: liveAmbulance.vehicle_number || 'A-103',
            capability: liveAmbulance.capability || 'ICU',
            latitude: liveAmbulance.latitude,
            longitude: liveAmbulance.longitude,
            distance_km: liveAmbulance.distance_km || 2.5,
            eta_minutes: optimization?.ambulance_eta || 4,
            match_score: 95,
            reasons: ['Fastest ETA', 'Advanced Life Support']
          } : undefined}
          selectedHospital={optimization?.selected_hospital}
          selectedRoute={optimization?.selected_route}
          alternativeRoutes={optimization?.alternative_routes}
          className="h-full w-full"
        />

        {/* Floating Map Overlay Badge */}
        <div className="absolute top-3 left-3 bg-zinc-950/90 backdrop-blur-md border border-zinc-700 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-mono text-zinc-300 shadow-lg">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          <span>LIVE TRACKING</span>
        </div>
      </div>

      {/* ── Recommended Hospital Card ── */}
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
                <div className="font-bold text-sm text-white truncate max-w-[220px]">
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
              <div className="text-[10px] font-mono text-zinc-500 uppercase">ER Care Time</div>
            </div>
          </div>

          {/* Hospital Call Button */}
          {optimization.selected_hospital.phone ? (
            <a
              href={`tel:${optimization.selected_hospital.phone}`}
              className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all active:scale-[0.98]"
            >
              <PhoneCall className="h-4 w-4" />
              <span>CALL HOSPITAL ({optimization.selected_hospital.phone})</span>
            </a>
          ) : (
            <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 text-center text-xs text-zinc-500 font-mono">
              Hospital phone directory unavailable for direct dial
            </div>
          )}
        </div>
      )}

      {/* ── Emergency Services Hotlines (108 / 112) ── */}
      <div className="space-y-2">
        <div className="text-[11px] font-mono font-bold text-zinc-500 uppercase tracking-wider px-1">
          Emergency Hotlines &amp; Direct Dial:
        </div>
        <div className="grid grid-cols-2 gap-3">
          <a
            href="tel:108"
            className="p-3.5 rounded-2xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 border border-red-400 transition-all active:scale-[0.98]"
          >
            <PhoneCall className="h-4 w-4" />
            <span>CALL 108</span>
          </a>
          <a
            href="tel:112"
            className="p-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <PhoneCall className="h-4 w-4 text-zinc-400" />
            <span>CALL 112</span>
          </a>
        </div>
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
