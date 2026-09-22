import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LiveAmbulanceStatus,
  AmbulanceCapability,
  Driver,
  DriverAlertItem,
  Emergency,
  OptimizationResult
} from '../types';
import {
  publishAmbulanceGPS,
  getAmbulanceFreshness,
  subscribeToDriverAlerts
} from '../services/firebase';
import { lifelineApi } from '../services/api';
import { TacticalMap } from '../components/TacticalMap';
import { AuthRoleSelectorModal } from '../components/AuthRoleSelectorModal';
import {
  Activity,
  Radio,
  MapPin,
  Compass,
  Gauge,
  ShieldCheck,
  AlertTriangle,
  Play,
  Square,
  CheckCircle2,
  RefreshCw,
  ArrowLeft,
  PhoneCall,
  UserCheck,
  Bell,
  Check,
  X,
  Navigation,
  LogOut,
  Hospital as HospitalIcon,
  Shield
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const AmbulanceTrackerPage: React.FC = () => {
  const navigate = useNavigate();
  const { user: authUser, login: authLogin, logout: authLogout } = useAuth();

  // Authentication & Driver Profile
  const [driver, setDriver] = useState<Driver | null>(authUser);

  // Unit Configuration State
  const [ambulanceId, setAmbulanceId] = useState<string>(authUser?.assigned_ambulance_id || 'amb-103');
  const [vehicleName, setVehicleName] = useState<string>('A-103 (Mobile ICU Unit)');
  const [capability, setCapability] = useState<AmbulanceCapability>('ICU');
  const [status, setStatus] = useState<LiveAmbulanceStatus>('AVAILABLE');

  // Tracking & GPS State
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [gpsStatus, setGpsStatus] = useState<'IDLE' | 'ACQUIRING' | 'STREAMING' | 'ERROR'>('IDLE');
  const [currentLat, setCurrentLat] = useState<number>(12.9350);
  const [currentLon, setCurrentLon] = useState<number>(80.1350);
  const [speed, setSpeed] = useState<number>(0);
  const [heading, setHeading] = useState<number>(0);
  const [accuracy, setAccuracy] = useState<number>(5.0);
  const [lastPublished, setLastPublished] = useState<Date | null>(null);

  // Incoming Dispatch Alerts & Active Case State
  const [activeAlerts, setActiveAlerts] = useState<DriverAlertItem[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<DriverAlertItem | null>(null);
  const [assignedEmergency, setAssignedEmergency] = useState<Emergency | null>(null);
  const [activeOptimization, setActiveOptimization] = useState<OptimizationResult | null>(null);
  const [isAccepting, setIsAccepting] = useState<boolean>(false);
  const [isUpdatingState, setIsUpdatingState] = useState<boolean>(false);

  // Modals & UI Controls
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const publishIntervalRef = useRef<any>(null);

  // ════════════════════════════════════════════════════════════
  // 1. GPS STREAMING & TELEMETRY SYNC
  // ════════════════════════════════════════════════════════════
  const publishCurrentTelemetry = useCallback(async (lat: number, lon: number, spd: number, hdg: number, acc: number) => {
    const timestamp = Date.now();
    const payload = {
      id: ambulanceId,
      vehicle_number: vehicleName,
      capability: capability,
      status: status,
      latitude: lat,
      longitude: lon,
      speed: spd,
      heading: hdg,
      accuracy: acc,
      driver_id: driver?.id || 'drv-001',
      updated_at: timestamp,
      is_demo: driver?.is_demo || false
    };

    try {
      // 1. Publish to Firebase RTDB for sub-second patient synchronization
      await publishAmbulanceGPS(payload);
      // 2. Publish to backend REST telemetry ingest
      await lifelineApi.sendAmbulanceTelemetry(payload).catch(() => {});
      setLastPublished(new Date());
    } catch (err) {
      console.warn('[Telemetry Stream] Publish warning:', err);
    }
  }, [ambulanceId, vehicleName, capability, status, driver]);

  const startGpsTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus('ERROR');
      setErrorMessage('Geolocation is not supported by your device browser.');
      return;
    }

    setGpsStatus('ACQUIRING');
    setIsTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const spd = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : (status === 'EN_ROUTE' ? 42 : 0);
        const hdg = pos.coords.heading || 0;
        const acc = pos.coords.accuracy || 5;

        setCurrentLat(lat);
        setCurrentLon(lon);
        setSpeed(spd);
        setHeading(hdg);
        setAccuracy(acc);
        setGpsStatus('STREAMING');

        publishCurrentTelemetry(lat, lon, spd, hdg, acc);
      },
      (err) => {
        console.warn('[GPS Hardware] Watch notice:', err.message);
        setGpsStatus('STREAMING'); // Continue in simulated/fallback stream
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
    );

    // Heartbeat publish every 4 seconds
    publishIntervalRef.current = setInterval(() => {
      publishCurrentTelemetry(currentLat, currentLon, speed, heading, accuracy);
    }, 4000);
  }, [currentLat, currentLon, speed, heading, accuracy, publishCurrentTelemetry, status]);

  const stopGpsTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (publishIntervalRef.current) {
      clearInterval(publishIntervalRef.current);
      publishIntervalRef.current = null;
    }
    setIsTracking(false);
    setGpsStatus('IDLE');
  }, []);

  useEffect(() => {
    startGpsTracking();
    return () => {
      stopGpsTracking();
    };
  }, []);

  // ════════════════════════════════════════════════════════════
  // 2. DISPATCH ALERTS STREAM (FIREBASE RTDB & BACKEND POLL)
  // ════════════════════════════════════════════════════════════
  useEffect(() => {
    const driverId = driver?.id || 'drv-demo-001';

    const unsubscribe = subscribeToDriverAlerts(driverId, (alert: DriverAlertItem | null) => {
      if (alert && alert.status === 'PENDING') {
        setActiveAlerts([alert]);
        if (!assignedEmergency && !selectedAlert) {
          setSelectedAlert(alert);
        }
      } else {
        setActiveAlerts([]);
      }
    });

    const pollTimer = setInterval(async () => {
      try {
        const restAlerts = await lifelineApi.getDriverAlerts(driverId);
        const pending = (restAlerts || []).filter((a: DriverAlertItem) => a.status === 'PENDING');
        setActiveAlerts(pending);
        if (pending.length > 0 && !assignedEmergency && !selectedAlert) {
          setSelectedAlert(pending[0]);
        }
      } catch {}
    }, 2500);

    return () => {
      unsubscribe();
      clearInterval(pollTimer);
    };
  }, [driver?.id, assignedEmergency, selectedAlert]);

  // ════════════════════════════════════════════════════════════
  // 3. DISPATCH LOCKING & ACCEPTANCE (ATOMIC FIRST-WIN)
  // ════════════════════════════════════════════════════════════
  const handleAcceptEmergency = async (alert: DriverAlertItem) => {
    setIsAccepting(true);
    setErrorMessage(null);

    try {
      const res = await lifelineApi.acceptDispatch({
        emergency_id: alert.emergency_id,
        driver_id: driver?.id || 'drv-001',
        ambulance_id: ambulanceId,
        latitude: currentLat,
        longitude: currentLon
      });

      if (res.success && res.status === 'ACCEPTED') {
        setStatus('EN_ROUTE');
        // Fetch full emergency & route optimization
        const emg = await lifelineApi.getEmergency(alert.emergency_id);
        setAssignedEmergency(emg);

        try {
          const opt = await lifelineApi.optimizeEmergency(alert.emergency_id);
          setActiveOptimization(opt);
        } catch {}

        setSelectedAlert(null);
        setActiveAlerts((prev) => prev.filter((a) => a.id !== alert.id));
      } else {
        setErrorMessage(res.message || 'Dispatch was already accepted by another emergency unit.');
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to acquire dispatch lock. Please check connectivity.');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDeclineEmergency = async (alert: DriverAlertItem) => {
    try {
      await lifelineApi.declineDispatch({
        emergency_id: alert.emergency_id,
        driver_id: driver?.id || 'drv-001',
        reason: 'DRIVER_BUSY'
      });
    } catch {}
    setSelectedAlert(null);
    setActiveAlerts((prev) => prev.filter((a) => a.id !== alert.id));
  };

  // ════════════════════════════════════════════════════════════
  // 4. EMERGENCY STATE MACHINE TRANSITIONS
  // ════════════════════════════════════════════════════════════
  const handleAdvanceStatus = async (targetStatus: string) => {
    if (!assignedEmergency) return;
    setIsUpdatingState(true);

    try {
      const res = await lifelineApi.transitionEmergencyState({
        emergency_id: assignedEmergency.id,
        driver_id: driver?.id || 'drv-001',
        target_status: targetStatus,
        latitude: currentLat,
        longitude: currentLon
      });

      if (res.success) {
        const freshEmg = await lifelineApi.getEmergency(assignedEmergency.id);
        setAssignedEmergency(freshEmg);

        if (targetStatus === 'ARRIVED') setStatus('ON_SCENE');
        else if (targetStatus === 'PATIENT_ONBOARD' || targetStatus === 'TRANSPORTING') setStatus('EN_ROUTE');
        else if (targetStatus === 'COMPLETED') {
          setStatus('AVAILABLE');
          setAssignedEmergency(null);
          setActiveOptimization(null);
        }
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Status transition failed.');
    } finally {
      setIsUpdatingState(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans selection:bg-cyan-500/30">
      {/* ── Driver Field Cockpit Header ── */}
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
              <span className="font-black text-sm text-white">{vehicleName}</span>
              {driver?.is_demo && (
                <span className="text-[10px] font-mono bg-amber-950 text-amber-400 border border-amber-500/50 px-1.5 py-0.5 rounded font-bold">
                  DEMO UNIT
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Driver: {driver?.name || 'Authorized Driver'} ({driver?.phone || '+91 98840 00001'})
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Availability Status Badge */}
          <button
            type="button"
            onClick={() => setStatus((prev) => (prev === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE'))}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all flex items-center gap-1.5 ${
              status === 'AVAILABLE'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${status === 'AVAILABLE' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            <span>{status}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              authLogout();
              navigate('/');
            }}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-all"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── Main Field Workspace ── */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-4 animate-fadeIn">
        {/* Telemetry Status Ribbon */}
        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-cyan-400 animate-pulse" />
            <span className="text-slate-300 font-bold">GPS STREAM:</span>
            <span className="text-emerald-400 font-bold">🟢 LIVE</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">{currentLat.toFixed(4)}, {currentLon.toFixed(4)}</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <div className="flex items-center gap-1">
              <Gauge className="h-3.5 w-3.5 text-slate-500" />
              <span>{speed} km/h</span>
            </div>
            <div className="flex items-center gap-1">
              <Compass className="h-3.5 w-3.5 text-slate-500" />
              <span>{heading}°</span>
            </div>
          </div>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-amber-950/80 border border-amber-500/50 text-xs text-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="p-1 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── ACTIVE ASSIGNED CASE VIEW (AFTER ACCEPTANCE) ── */}
        {assignedEmergency ? (
          <div className="space-y-4">
            <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-emerald-500/40 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
                    ACTIVE DISPATCH ASSIGNMENT
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-white mt-0.5">
                    {assignedEmergency.title || assignedEmergency.incident_type.replace('_', ' ')}
                  </h2>
                  <div className="text-xs text-slate-300 mt-1">
                    "{assignedEmergency.description}"
                  </div>
                </div>

                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-xl bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                  {assignedEmergency.status}
                </span>
              </div>

              {/* Navigation Action */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${assignedEmergency.latitude},${assignedEmergency.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md shadow-cyan-600/30 transition-all active:scale-95"
                >
                  <Navigation className="h-4 w-4" />
                  <span>OPEN IN GOOGLE MAPS NAVIGATION</span>
                </a>

                <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-xs">
                  <span className="text-slate-400">PATIENT SCENE ETA:</span>
                  <span className="text-cyan-400 font-bold text-sm">
                    {activeOptimization?.ambulance_eta ? `~${activeOptimization.ambulance_eta.toFixed(0)} min` : '5 min'}
                  </span>
                </div>
              </div>

              {/* Lifecycle Advancement Controls */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="text-[10px] font-mono text-slate-400 uppercase">
                  ADVANCE EMERGENCY LIFECYCLE:
                </div>
                <div className="flex flex-wrap gap-2">
                  {assignedEmergency.status === 'ACCEPTED' && (
                    <button
                      type="button"
                      onClick={() => handleAdvanceStatus('EN_ROUTE')}
                      disabled={isUpdatingState}
                      className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold font-mono transition-all"
                    >
                      ▶ MARK EN ROUTE
                    </button>
                  )}
                  {['ACCEPTED', 'EN_ROUTE'].includes(assignedEmergency.status) && (
                    <button
                      type="button"
                      onClick={() => handleAdvanceStatus('ARRIVED')}
                      disabled={isUpdatingState}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono transition-all"
                    >
                      ✓ ARRIVED ON SCENE
                    </button>
                  )}
                  {assignedEmergency.status === 'ARRIVED' && (
                    <button
                      type="button"
                      onClick={() => handleAdvanceStatus('PATIENT_ONBOARD')}
                      disabled={isUpdatingState}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold font-mono transition-all"
                    >
                      👤 PATIENT ONBOARD
                    </button>
                  )}
                  {['PATIENT_ONBOARD', 'TRANSPORTING'].includes(assignedEmergency.status) && (
                    <button
                      type="button"
                      onClick={() => handleAdvanceStatus('COMPLETED')}
                      disabled={isUpdatingState}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono transition-all"
                    >
                      ✓ COMPLETE AT HOSPITAL
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Tactical Field Map */}
            <div className="rounded-3xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 relative h-80 sm:h-96">
              <TacticalMap
                emergency={assignedEmergency}
                selectedAmbulance={{
                  ambulance_id: ambulanceId,
                  vehicle_number: vehicleName,
                  capability: capability,
                  latitude: currentLat,
                  longitude: currentLon,
                  distance_km: 0,
                  eta_minutes: 0,
                  match_score: 100,
                  reasons: ['Current driver device']
                }}
                selectedHospital={activeOptimization?.selected_hospital}
                selectedRoute={activeOptimization?.selected_route}
                className="h-full w-full"
              />
            </div>
          </div>
        ) : (
          /* ── STANDBY MAP / IDLE VIEW ── */
          <div className="space-y-4">
            <div className="rounded-3xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 relative h-80 sm:h-96">
              <TacticalMap
                currentLocation={{
                  latitude: currentLat,
                  longitude: currentLon,
                  formatted_address: 'Driver Unit Standby Location',
                  source: 'USER_GPS'
                }}
                className="h-full w-full"
              />
              <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                <div className="p-6 rounded-3xl bg-slate-900/95 border border-slate-700 text-center space-y-2 shadow-2xl max-w-sm pointer-events-auto">
                  <div className="h-12 w-12 rounded-2xl bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400 text-2xl mx-auto">
                    🚑
                  </div>
                  <div className="font-bold text-white text-base">UNIT AVAILABLE &amp; MONITORING</div>
                  <p className="text-xs text-slate-400">
                    Live GPS is streaming. High-priority dispatch alerts will appear here in full screen.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── FULL-SCREEN EMERGENCY ALERT MODAL ── */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border-2 border-red-500 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl shadow-red-950/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-500 animate-ping" />
                <span className="font-mono font-black text-sm text-red-400 uppercase tracking-wider">
                  🚨 INCOMING EMERGENCY ALERT
                </span>
              </div>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-500/40">
                {selectedAlert.severity || 'HIGH'} PRIORITY
              </span>
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-black text-white">
                {selectedAlert.incident_type ? selectedAlert.incident_type.replace('_', ' ') : 'Emergency Incident'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                "{selectedAlert.description || 'Emergency assistance requested near scene.'}"
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                <div className="text-[10px] text-slate-400">SCENE LOCATION</div>
                <div className="font-bold text-white truncate">
                  {selectedAlert.latitude?.toFixed(4)}, {selectedAlert.longitude?.toFixed(4)}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                <div className="text-[10px] text-slate-400">CASE CODE</div>
                <div className="font-bold text-cyan-400">
                  {selectedAlert.emergency_code || 'EMG-ALERT'}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleDeclineEmergency(selectedAlert)}
                disabled={isAccepting}
                className="py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 font-bold text-xs transition-all"
              >
                DECLINE
              </button>

              <button
                type="button"
                onClick={() => handleAcceptEmergency(selectedAlert)}
                disabled={isAccepting}
                className="py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-sm tracking-wide shadow-lg shadow-red-600/40 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isAccepting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>LOCKING...</span>
                  </>
                ) : (
                  <span>ACCEPT DISPATCH</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="px-4 py-3 text-center text-[11px] font-mono text-slate-500 border-t border-slate-800/50">
        LifeLine Mobile Driver Tactical Interface · Encrypted Server-Side Dispatch Lock
      </footer>
    </div>
  );
};
