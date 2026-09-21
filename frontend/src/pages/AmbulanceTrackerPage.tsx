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
  const { user: authUser, login: authLogin } = useAuth();

  // Authentication & Driver Profile
  const [driver, setDriver] = useState<Driver | null>(authUser);

  // Unit Configuration State
  const [ambulanceId, setAmbulanceId] = useState<string>(authUser?.assigned_ambulance_id || 'amb-103');
  const [vehicleName, setVehicleName] = useState<string>('A-103 (Mobile ICU Unit)');
  const [capability, setCapability] = useState<AmbulanceCapability>('ICU');
  const [status, setStatus] = useState<LiveAmbulanceStatus>('AVAILABLE');

  // Tracking & GPS State
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [gpsStatus, setGpsStatus] = useState<
    'IDLE' | 'ACQUIRING' | 'CONNECTED' | 'DENIED' | 'UNAVAILABLE'
  >('IDLE');
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Telemetry Snapshot
  const [latitude, setLatitude] = useState<number | null>(13.0080);
  const [longitude, setLongitude] = useState<number | null>(80.2015);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [lastUpdatedTimestamp, setLastUpdatedTimestamp] = useState<number | null>(null);
  const [transmissionCount, setTransmissionCount] = useState<number>(0);

  // Stale age ticker
  const [ageDisplay, setAgeDisplay] = useState<string>('Not started');

  // Realtime Dispatch Alert State
  const [activeAlert, setActiveAlert] = useState<DriverAlertItem | null>(null);
  const [isAccepting, setIsAccepting] = useState<boolean>(false);
  const [concurrencyNotice, setConcurrencyNotice] = useState<string | null>(null);

  // Active Assigned Emergency Navigation State
  const [activeEmergency, setActiveEmergency] = useState<Emergency | null>(null);
  const [activeOptimization, setActiveOptimization] = useState<OptimizationResult | null>(null);
  const [lifecycleStage, setLifecycleStage] = useState<string>('AVAILABLE');

  const watchIdRef = useRef<number | null>(null);
  const lastPublishedTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const MIN_UPDATE_INTERVAL_MS = 4000;

  // Real-time age ticker
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdatedTimestamp) {
        const fresh = getAmbulanceFreshness(lastUpdatedTimestamp);
        setAgeDisplay(fresh.text);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdatedTimestamp]);



  // Play audio chime when emergency alert arrives
  const playAlertChime = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.setValueAtTime(587.33, ctx.currentTime + 0.15); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {
      // Audio autoplay policy notice
    }
  };

  // Subscribe to real-time driver dispatch alerts
  useEffect(() => {
    const driverId = driver?.id || 'drv-101';
    const unsubscribe = subscribeToDriverAlerts(driverId, (alert) => {
      if (alert && alert.status === 'PENDING') {
        setActiveAlert(alert);
        playAlertChime();
      } else if (!alert && activeAlert) {
        // Alert was cancelled or claimed by another driver
        setActiveAlert(null);
      }
    });
    return () => unsubscribe();
  }, [driver, activeAlert]);

  // Transmit location update
  const transmitLocation = useCallback(
    async (coords: GeolocationCoordinates) => {
      const now = Date.now();
      setLatitude(coords.latitude);
      setLongitude(coords.longitude);
      setAccuracy(coords.accuracy);
      setSpeed(coords.speed !== null ? Math.round(coords.speed * 3.6) : 0);
      setHeading(coords.heading !== null ? Math.round(coords.heading) : 0);
      setLastUpdatedTimestamp(now);
      setGpsStatus('CONNECTED');
      setGpsError(null);

      if (now - lastPublishedTimeRef.current >= MIN_UPDATE_INTERVAL_MS) {
        lastPublishedTimeRef.current = now;
        try {
          await publishAmbulanceGPS({
            id: ambulanceId,
            vehicle_number: vehicleName,
            capability,
            status,
            latitude: coords.latitude,
            longitude: coords.longitude,
            speed: coords.speed !== null ? Math.round(coords.speed * 3.6) : null,
            heading: coords.heading !== null ? Math.round(coords.heading) : null,
            accuracy: coords.accuracy,
            driver_id: driver?.id,
            driver_name: driver?.name
          });
          setTransmissionCount((prev) => prev + 1);
        } catch (e) {
          console.warn('Telemetry transmit error:', e);
        }
      }
    },
    [ambulanceId, vehicleName, capability, status, driver]
  );

  // Start Live Tracking Watcher
  const handleStartTracking = () => {
    if (!navigator.geolocation) {
      setGpsStatus('UNAVAILABLE');
      setGpsError('Geolocation is not supported by your mobile browser.');
      return;
    }

    setGpsStatus('ACQUIRING');
    setGpsError(null);
    setIsTracking(true);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        transmitLocation(position.coords);
      },
      (error) => {
        console.warn('Geolocation watch error:', error);
        if (error.code === error.PERMISSION_DENIED) {
          setGpsStatus('DENIED');
          setGpsError('GPS permission was denied. Please allow location access in your browser settings.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setGpsStatus('UNAVAILABLE');
          setGpsError('GPS position unavailable. Ensure device location is enabled.');
        } else {
          setGpsStatus('UNAVAILABLE');
          setGpsError(`GPS error: ${error.message}`);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 12000
      }
    );

    watchIdRef.current = watchId;
  };

  // Stop Live Tracking Watcher
  const handleStopTracking = async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setGpsStatus('IDLE');

    if (latitude && longitude) {
      try {
        await publishAmbulanceGPS({
          id: ambulanceId,
          vehicle_number: vehicleName,
          capability,
          status: 'OFFLINE',
          latitude,
          longitude,
          speed: 0,
          heading: 0,
          accuracy
        });
      } catch (e) {
        // Ignore
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Update status changes immediately
  const handleStatusChange = async (newStatus: LiveAmbulanceStatus) => {
    setStatus(newStatus);
    if (driver) {
      try {
        await lifelineApi.updateDriverStatus(driver.id, {
          status: newStatus,
          latitude: latitude || undefined,
          longitude: longitude || undefined
        });
      } catch (e) {
        // Ignore
      }
    }
    if (isTracking && latitude && longitude) {
      await publishAmbulanceGPS({
        id: ambulanceId,
        vehicle_number: vehicleName,
        capability,
        status: newStatus,
        latitude,
        longitude,
        speed,
        heading,
        accuracy,
        driver_id: driver?.id,
        driver_name: driver?.name
      });
      setLastUpdatedTimestamp(Date.now());
      setTransmissionCount((prev) => prev + 1);
    }
  };

  // Atomic Driver Acceptance
  const handleAcceptAlert = async () => {
    if (!activeAlert || !driver) return;
    setIsAccepting(true);
    setConcurrencyNotice(null);

    try {
      const res = await lifelineApi.acceptDispatch({
        emergency_id: activeAlert.emergency_id,
        driver_id: driver.id,
        ambulance_id: ambulanceId,
        latitude: latitude || undefined,
        longitude: longitude || undefined
      });

      if (res.success && res.status === 'ACCEPTED') {
        setStatus('EN_ROUTE');
        setLifecycleStage('EN_ROUTE');
        setActiveAlert(null);

        // Fetch complete emergency & optimization for navigation
        const emg = await lifelineApi.getEmergency(res.emergency_id);
        const opt = await lifelineApi.optimizeEmergency(res.emergency_id);
        setActiveEmergency(emg);
        setActiveOptimization(opt);
      } else if (res.status === 'ALREADY_ASSIGNED') {
        setConcurrencyNotice(res.message || 'Another unit accepted this emergency first.');
        setTimeout(() => {
          setActiveAlert(null);
          setConcurrencyNotice(null);
        }, 3500);
      } else {
        setConcurrencyNotice(res.message || 'Dispatch acceptance failed.');
      }
    } catch (e: any) {
      console.error('Accept error:', e);
      setConcurrencyNotice(e.response?.data?.detail || 'Dispatch acceptance error. Please retry.');
    } finally {
      setIsAccepting(false);
    }
  };

  // Driver Decline
  const handleDeclineAlert = async () => {
    if (!activeAlert || !driver) return;
    try {
      await lifelineApi.declineDispatch({
        emergency_id: activeAlert.emergency_id,
        driver_id: driver.id,
        reason: 'DRIVER_DECLINED'
      });
      setActiveAlert(null);
    } catch (e) {
      setActiveAlert(null);
    }
  };

  // Stage Transitions during Active Response
  const handleStageTransition = async (targetStage: string) => {
    if (!activeEmergency || !driver) return;
    try {
      await lifelineApi.transitionEmergencyState({
        emergency_id: activeEmergency.id,
        target_status: targetStage,
        driver_id: driver.id,
        ambulance_id: ambulanceId,
        latitude: latitude || undefined,
        longitude: longitude || undefined
      });
      setLifecycleStage(targetStage);
      if (targetStage === 'COMPLETED' || targetStage === 'CANCELLED') {
        setActiveEmergency(null);
        setActiveOptimization(null);
        setStatus('AVAILABLE');
      }
    } catch (e) {
      console.warn('Transition error:', e);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto p-4 sm:p-6 space-y-6">

        {/* Driver Profile Header */}
        <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 rounded-2xl bg-zinc-950 border border-cyan-500/40 p-1 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
                <img
                  src="/logo-clean.png"
                  alt="LifeLine Logo"
                  className="h-full w-full object-contain drop-shadow-[0_0_10px_rgba(6,182,212,0.4)]"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">
                    {driver ? driver.name : 'DRIVER CONSOLE'}
                  </h1>
                  <span className="text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded">
                    VERIFIED
                  </span>
                </div>
                <div className="text-xs font-mono text-zinc-400">
                  {vehicleName} • {capability}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── ACTIVE EMERGENCY ASSIGNMENT NAVIGATION VIEW ── */}
        {activeEmergency && activeOptimization && (
          <div className="bg-gradient-to-b from-red-950/80 via-zinc-900 to-zinc-950 border-2 border-red-500 rounded-3xl p-5 shadow-2xl space-y-4 animate-fadeIn card-glow-red">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-500 animate-ping" />
                <span className="text-xs font-mono font-black text-red-400 uppercase tracking-wider">
                  ACTIVE MISSION: {activeEmergency.code || activeEmergency.id.slice(0, 8)}
                </span>
              </div>
              <span className="text-xs font-mono bg-red-950 text-red-300 border border-red-500/50 px-2 py-0.5 rounded font-bold">
                {lifecycleStage}
              </span>
            </div>

            {/* Emergency Details */}
            <div className="space-y-1">
              <h2 className="text-lg font-black text-white">{activeEmergency.title || activeEmergency.incident_type}</h2>
              <p className="text-xs text-zinc-300 bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
                "{activeEmergency.description}"
              </p>
            </div>

            {/* Navigation Tactical Map */}
            <div className="h-56 rounded-2xl overflow-hidden border border-zinc-700 relative">
              <TacticalMap
                emergency={activeEmergency}
                selectedAmbulance={activeOptimization.selected_ambulance}
                selectedHospital={activeOptimization.selected_hospital}
                selectedRoute={activeOptimization.selected_route}
                className="h-full w-full"
              />
            </div>

            {/* Receiving Hospital & Call Button */}
            <div className="p-3 bg-zinc-950 rounded-xl border border-emerald-500/40 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono text-emerald-400 font-bold uppercase">RECEIVING HOSPITAL</div>
                <div className="text-sm font-bold text-white truncate max-w-[200px]">
                  {activeOptimization.selected_hospital.name}
                </div>
              </div>
              {activeOptimization.selected_hospital.phone && (
                <a
                  href={`tel:${activeOptimization.selected_hospital.phone}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                  <span>CALL</span>
                </a>
              )}
            </div>

            {/* Mission Stage Progression Buttons */}
            <div className="space-y-2">
              <div className="text-[11px] font-mono text-zinc-400 uppercase">Mission Progression:</div>
              <div className="grid grid-cols-2 gap-2">
                {lifecycleStage === 'EN_ROUTE' && (
                  <button
                    onClick={() => handleStageTransition('ARRIVED')}
                    className="py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider col-span-2 shadow-lg"
                  >
                    📍 ARRIVED AT SCENE
                  </button>
                )}
                {lifecycleStage === 'ARRIVED' && (
                  <button
                    onClick={() => handleStageTransition('PATIENT_ONBOARD')}
                    className="py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase tracking-wider col-span-2 shadow-lg"
                  >
                    👤 PATIENT ONBOARD
                  </button>
                )}
                {lifecycleStage === 'PATIENT_ONBOARD' && (
                  <button
                    onClick={() => handleStageTransition('TRANSPORTING')}
                    className="py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-wider col-span-2 shadow-lg"
                  >
                    🚑 TRANSPORTING TO HOSPITAL
                  </button>
                )}
                {lifecycleStage === 'TRANSPORTING' && (
                  <button
                    onClick={() => handleStageTransition('COMPLETED')}
                    className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider col-span-2 shadow-lg"
                  >
                    ✓ HANDOVER COMPLETED
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── UNIT OPERATIONAL READINESS & STATUS ── */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
            Unit Operational Status
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['AVAILABLE', 'EN_ROUTE', 'ON_SCENE', 'OFFLINE'] as LiveAmbulanceStatus[]).map((st) => {
              const isCurrent = status === st;
              let colorClass = 'bg-zinc-950 border-zinc-800 text-zinc-400';
              if (isCurrent) {
                if (st === 'AVAILABLE') colorClass = 'bg-emerald-950 border-emerald-500 text-emerald-300 font-bold card-glow-emerald';
                else if (st === 'EN_ROUTE') colorClass = 'bg-amber-950 border-amber-500 text-amber-300 font-bold';
                else if (st === 'ON_SCENE') colorClass = 'bg-blue-950 border-blue-500 text-blue-300 font-bold';
                else colorClass = 'bg-red-950 border-red-500 text-red-300 font-bold';
              }

              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleStatusChange(st)}
                  className={`py-2.5 px-2 rounded-xl border text-xs font-mono transition-all text-center ${colorClass}`}
                >
                  {st}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── GPS STREAM CONTROLS ── */}
        <div className="space-y-4">
          {!isTracking ? (
            <button
              onClick={handleStartTracking}
              className="w-full py-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:from-emerald-700 active:to-teal-700 text-white font-black text-base tracking-wider uppercase flex items-center justify-center gap-3 shadow-2xl shadow-emerald-600/30 border border-emerald-400 transition-all active:scale-[0.98]"
            >
              <Play className="h-6 w-6 fill-white" />
              <span>START CONTINUOUS GPS TRACKING</span>
            </button>
          ) : (
            <button
              onClick={handleStopTracking}
              className="w-full py-5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:from-red-700 active:to-rose-700 text-white font-black text-base tracking-wider uppercase flex items-center justify-center gap-3 shadow-2xl shadow-red-600/40 border border-red-400 transition-all active:scale-[0.98]"
            >
              <Square className="h-6 w-6 fill-white" />
              <span>STOP LIVE GPS</span>
            </button>
          )}

          {gpsError && (
            <div className="p-3 bg-red-950/70 border border-red-500/50 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{gpsError}</span>
            </div>
          )}
        </div>

        {/* ── LIVE TELEMETRY SNAPSHOT ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl space-y-4 font-mono">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <span className="text-xs text-zinc-400 font-bold uppercase flex items-center gap-2">
              <Radio className={`h-4 w-4 ${isTracking ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'}`} />
              <span>GPS Telemetry Pool</span>
            </span>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full border font-bold ${
                gpsStatus === 'CONNECTED'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                  : gpsStatus === 'ACQUIRING'
                  ? 'bg-amber-950 text-amber-300 border-amber-500/50 animate-pulse'
                  : 'bg-zinc-950 text-zinc-500 border-zinc-800'
              }`}
            >
              {gpsStatus === 'CONNECTED'
                ? 'LIVE BROADCASTING'
                : gpsStatus === 'ACQUIRING'
                ? 'ACQUIRING SATELLITES...'
                : 'OFFLINE / STANDBY'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
              <div className="text-zinc-500 text-[10px] uppercase">Latitude</div>
              <div className="text-base font-bold text-cyan-300 mt-0.5 truncate">
                {latitude !== null ? latitude.toFixed(6) : '—'}
              </div>
            </div>

            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
              <div className="text-zinc-500 text-[10px] uppercase">Longitude</div>
              <div className="text-base font-bold text-cyan-300 mt-0.5 truncate">
                {longitude !== null ? longitude.toFixed(6) : '—'}
              </div>
            </div>

            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
              <div className="text-zinc-500 text-[10px] uppercase">Speed</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {speed !== null ? `${speed} km/h` : '0 km/h'}
              </div>
            </div>

            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
              <div className="text-zinc-500 text-[10px] uppercase">Accuracy</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {accuracy !== null ? `± ${accuracy.toFixed(1)} m` : '—'}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
            <span>Freshness: {ageDisplay}</span>
            <span className="text-zinc-500">Transmitted: {transmissionCount} pings</span>
          </div>
        </div>

        {/* ── FULL-SCREEN INCOMING DISPATCH MODAL ── */}
        {activeAlert && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-zinc-950 border-2 border-red-500 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 card-glow-red relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-red-600 via-amber-500 to-red-600 animate-pulse" />

              <div className="text-center space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950 border border-red-500 text-red-400 text-xs font-mono font-bold animate-pulse">
                  <Bell className="h-4 w-4" />
                  <span>EMERGENCY DISPATCH INCOMING</span>
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight">
                  {activeAlert.incident_type || 'Critical Emergency'}
                </h2>
                <div className="text-xs font-mono text-zinc-400">
                  Case ID: {activeAlert.emergency_code || activeAlert.emergency_id.slice(0, 8)}
                </div>
              </div>

              {concurrencyNotice && (
                <div className="p-3.5 bg-amber-950/90 border border-amber-500 rounded-xl text-xs text-amber-200 font-bold flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
                  <span>{concurrencyNotice}</span>
                </div>
              )}

              <div className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800 space-y-3 text-xs font-mono">
                <div className="text-zinc-300 font-sans text-sm">
                  "{activeAlert.description || 'Emergency assistance requested. Immediate ambulance required.'}"
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800">
                  <div>
                    <span className="text-zinc-500 block">SEVERITY</span>
                    <span className="text-red-400 font-bold text-sm">{activeAlert.severity || 'CRITICAL'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">DESTINATION</span>
                    <span className="text-emerald-400 font-bold">Verified Places Hospital</span>
                  </div>
                </div>
              </div>

              {/* Accept & Decline Buttons with Atomic Server Concurrency */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={handleDeclineAlert}
                  disabled={isAccepting}
                  className="py-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 border border-zinc-700"
                >
                  <X className="h-5 w-5 text-zinc-400" />
                  <span>DECLINE</span>
                </button>

                <button
                  onClick={handleAcceptAlert}
                  disabled={isAccepting}
                  className="py-4 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xl shadow-red-600/50 border border-red-400"
                >
                  {isAccepting ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-5 w-5 text-white" />
                      <span>ACCEPT DISPATCH</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

    </div>
  );
};
