import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LiveAmbulanceStatus, AmbulanceCapability } from '../types';
import { publishAmbulanceGPS, getAmbulanceFreshness } from '../services/firebase';
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
  PhoneCall
} from 'lucide-react';

export const AmbulanceTrackerPage: React.FC = () => {
  const navigate = useNavigate();

  // Unit Configuration State
  const [ambulanceId, setAmbulanceId] = useState<string>('A-103');
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
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [lastUpdatedTimestamp, setLastUpdatedTimestamp] = useState<number | null>(null);
  const [transmissionCount, setTransmissionCount] = useState<number>(0);

  // Stale age ticker
  const [ageDisplay, setAgeDisplay] = useState<string>('Not started');

  const watchIdRef = useRef<number | null>(null);
  const lastPublishedTimeRef = useRef<number>(0);
  const MIN_UPDATE_INTERVAL_MS = 5000; // 5 seconds throttle

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

  // Transmit location update
  const transmitLocation = useCallback(
    async (coords: GeolocationCoordinates) => {
      const now = Date.now();
      setLatitude(coords.latitude);
      setLongitude(coords.longitude);
      setAccuracy(coords.accuracy);
      setSpeed(coords.speed !== null ? Math.round(coords.speed * 3.6) : 0); // Convert m/s to km/h
      setHeading(coords.heading !== null ? Math.round(coords.heading) : 0);
      setLastUpdatedTimestamp(now);
      setGpsStatus('CONNECTED');
      setGpsError(null);

      // Throttle Firebase / Backend transmissions to every 5-10s
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
            accuracy: coords.accuracy
          });
          setTransmissionCount((prev) => prev + 1);
        } catch (e) {
          console.warn('Telemetry transmit error:', e);
        }
      }
    },
    [ambulanceId, vehicleName, capability, status]
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

    // Transmit OFFLINE status update
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
        accuracy
      });
      setLastUpdatedTimestamp(Date.now());
      setTransmissionCount((prev) => prev + 1);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-start p-4 sm:p-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-xs font-mono text-zinc-400 hover:text-white transition-all bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>BACK TO LIFELINE</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-[11px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
              Ambulance Gateway
            </span>
          </div>
        </div>

        {/* Header Hero */}
        <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-2">
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
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  LIFELINE AMBULANCE
                </h1>
                <div className="text-xs font-mono text-zinc-400">
                  Mobile Unit Real-Time GPS Telemetry Transmitter
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Configuration Panel */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
            1. Unit Identity & Readiness
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-mono text-zinc-400 block mb-1">Ambulance ID</label>
              <input
                type="text"
                value={ambulanceId}
                disabled={isTracking}
                onChange={(e) => setAmbulanceId(e.target.value.toUpperCase())}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-cyan-400 focus:outline-none focus:border-cyan-400 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-[11px] font-mono text-zinc-400 block mb-1">Capability</label>
              <select
                value={capability}
                disabled={isTracking}
                onChange={(e) => setCapability(e.target.value as AmbulanceCapability)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-400 disabled:opacity-60"
              >
                <option value="ICU">Mobile ICU Unit</option>
                <option value="ADVANCED">Advanced ALS Unit</option>
                <option value="BASIC">Basic BLS Unit</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-mono text-zinc-400 block mb-1.5">
              Unit Operational Status
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['AVAILABLE', 'EN_ROUTE', 'ON_SCENE', 'OFFLINE'] as LiveAmbulanceStatus[]).map(
                (st) => {
                  const isCurrent = status === st;
                  let colorClass = 'bg-zinc-950 border-zinc-800 text-zinc-400';
                  if (isCurrent) {
                    if (st === 'AVAILABLE') colorClass = 'bg-emerald-950 border-emerald-500 text-emerald-300 font-bold';
                    else if (st === 'EN_ROUTE') colorClass = 'bg-amber-950 border-amber-500 text-amber-300 font-bold';
                    else if (st === 'ON_SCENE') colorClass = 'bg-blue-950 border-blue-500 text-blue-300 font-bold';
                    else colorClass = 'bg-red-950 border-red-500 text-red-300 font-bold';
                  }

                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleStatusChange(st)}
                      className={`py-2 px-2 rounded-xl border text-xs font-mono transition-all text-center ${colorClass}`}
                    >
                      {st}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </div>

        {/* GPS Controls & Primary Action Button */}
        <div className="space-y-4">
          {!isTracking ? (
            <button
              onClick={handleStartTracking}
              className="w-full py-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:from-emerald-700 active:to-teal-700 text-white font-black text-base tracking-wider uppercase flex items-center justify-center gap-3 shadow-2xl shadow-emerald-600/30 border border-emerald-400 transition-all active:scale-[0.98]"
            >
              <Play className="h-6 w-6 fill-white" />
              <span>START LIVE TRACKING</span>
            </button>
          ) : (
            <button
              onClick={handleStopTracking}
              className="w-full py-5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:from-red-700 active:to-rose-700 text-white font-black text-base tracking-wider uppercase flex items-center justify-center gap-3 shadow-2xl shadow-red-600/40 border border-red-400 transition-all active:scale-[0.98]"
            >
              <Square className="h-6 w-6 fill-white" />
              <span>STOP TRACKING</span>
            </button>
          )}

          {gpsError && (
            <div className="p-3 bg-red-950/70 border border-red-500/50 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{gpsError}</span>
            </div>
          )}
        </div>

        {/* Live Telemetry Display */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl space-y-4 font-mono">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <span className="text-xs text-zinc-400 font-bold uppercase flex items-center gap-2">
              <Radio className={`h-4 w-4 ${isTracking ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'}`} />
              <span>GPS Stream Status</span>
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
                ? 'CONNECTED'
                : gpsStatus === 'ACQUIRING'
                ? 'ACQUIRING SATELLITES...'
                : gpsStatus === 'DENIED'
                ? 'PERMISSION DENIED'
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
              <div className="text-zinc-500 text-[10px] uppercase">Accuracy (Radius)</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {accuracy !== null ? `± ${accuracy.toFixed(1)} m` : '—'}
              </div>
            </div>

            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
              <div className="text-zinc-500 text-[10px] uppercase">Speed</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {speed !== null ? `${speed} km/h` : '0 km/h'}
              </div>
            </div>
          </div>

          {/* Freshness & Transmission info */}
          <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
            <span>Last Update: {ageDisplay}</span>
            <span className="text-zinc-500">Transmitted: {transmissionCount} updates</span>
          </div>
        </div>

        {/* Data Provenance & Safety Note */}
        <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl text-xs text-zinc-400 space-y-1">
          <div className="font-bold text-zinc-300">Data Provenance Guarantee:</div>
          <p>
            Coordinates transmitted by this device are marked <strong>LIVE_GPS</strong> in LifeLine.
            If GPS stream pauses for &gt;30s, the system automatically tags the vehicle as{' '}
            <span className="text-amber-400 font-bold">STALE</span> and prevents false dispatch recommendations.
          </p>
        </div>
      </div>
    </div>
  );
};
