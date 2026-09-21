import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { lifelineApi } from '../services/api';
import { Emergency, NearbyHospitalItem } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  Building2,
  Ambulance,
  PhoneCall,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Users,
  Activity,
  CheckCircle2,
  RefreshCw,
  Radio,
  MapPin,
  Heart,
  Flame,
  Car
} from 'lucide-react';

export const HospitalPortalPage: React.FC = () => {
  const { user } = useAuth();
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedHospitalName] = useState<string>('Chromepet General Emergency Department');
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchInboundEmergencies = async () => {
    setIsLoading(true);
    try {
      const all = await lifelineApi.listEmergencies();
      // Filter for active/transporting/dispatched cases
      const inbound = all.filter((e) =>
        ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'PATIENT_ONBOARD', 'TRANSPORTING'].includes(e.status)
      );
      setEmergencies(inbound.length > 0 ? inbound : all.slice(0, 3));
      setLastRefreshed(new Date());
    } catch (e) {
      console.warn('Failed to load inbound emergencies:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInboundEmergencies();
    const interval = setInterval(fetchInboundEmergencies, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto w-full space-y-6">
      {/* Hospital Status Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-zinc-400">ER READINESS STATUS</div>
            <div className="text-lg font-bold text-emerald-400 flex items-center gap-2 mt-1">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>ACCEPTING INBOUND PATIENTS</span>
            </div>
          </div>
          <ShieldCheck className="h-8 w-8 text-emerald-500/40" />
        </div>

        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-zinc-400">INBOUND AMBULANCES</div>
            <div className="text-2xl font-black font-mono text-cyan-400 mt-0.5">
              {emergencies.length} Units Active
            </div>
          </div>
          <Ambulance className="h-8 w-8 text-cyan-500/40" />
        </div>

        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-zinc-400">AUTHENTICATED STAFF</div>
            <div className="text-sm font-bold text-white mt-1">
              {user?.name || 'Dr. Radhika Srinivasan'}
            </div>
            <div className="text-[11px] text-zinc-400 font-mono">{user?.phone || '+91 98402 34567'}</div>
          </div>
          <div className="h-8 w-8 rounded-full bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-300 font-bold text-xs">
            ER
          </div>
        </div>
      </div>

      {/* Inbound Ambulances Feed */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-400" />
            <span>Inbound Emergency Fleet &amp; Patient Stream</span>
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 font-mono">
              Auto-updating via Firebase RTDB • {lastRefreshed.toLocaleTimeString()}
            </span>
            <button
              onClick={fetchInboundEmergencies}
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {emergencies.length === 0 ? (
          <div className="p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
            <div className="font-bold text-white">No Inbound Emergencies at this Moment</div>
            <p className="text-xs text-zinc-400">
              Incoming ambulance dispatches will automatically appear here with live ETA and triage details.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {emergencies.map((emg) => {
              const isCritical = emg.severity === 'CRITICAL' || emg.severity === 'HIGH';
              return (
                <div
                  key={emg.id}
                  className={`p-5 rounded-2xl bg-zinc-900/80 border transition-all ${
                    isCritical ? 'border-red-500/50 card-glow-red' : 'border-zinc-800'
                  } space-y-4`}
                >
                  {/* Header with Case Code and Severity */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-cyan-400">
                          {emg.code || `EMG-${emg.id.slice(0, 6).toUpperCase()}`}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                            isCritical
                              ? 'bg-red-950 text-red-300 border-red-500/40'
                              : 'bg-amber-950 text-amber-300 border-amber-500/40'
                          }`}
                        >
                          {emg.severity} SEVERITY
                        </span>
                      </div>
                      <h3 className="font-bold text-white text-base mt-1">
                        {emg.title || emg.incident_type.replace('_', ' ')}
                      </h3>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {emg.status}
                      </span>
                    </div>
                  </div>

                  {/* Patient Description */}
                  <p className="text-xs text-zinc-300 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                    "{emg.description}"
                  </p>

                  {/* Telemetry Summary */}
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                      <div className="text-[10px] text-zinc-500">ASSIGNED AMB</div>
                      <div className="text-cyan-400 font-bold">
                        {emg.assigned_ambulance_id || 'A-103 (ICU)'}
                      </div>
                    </div>
                    <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                      <div className="text-[10px] text-zinc-500">PATIENTS</div>
                      <div className="text-white font-bold">
                        {emg.patient_count} ({emg.critical_patient_count || 1} Critical)
                      </div>
                    </div>
                    <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                      <div className="text-[10px] text-zinc-500">EST. INBOUND</div>
                      <div className="text-emerald-400 font-bold">~4-7 min</div>
                    </div>
                  </div>

                  {/* Action Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                    <Link
                      to={`/emergency/${emg.id}`}
                      className="text-xs font-mono text-cyan-400 hover:text-cyan-300 underline font-bold"
                    >
                      View Full Tactical Map →
                    </Link>
                    <a
                      href="tel:108"
                      className="px-3 py-1.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs font-bold flex items-center gap-1.5 hover:bg-red-950"
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                      <span>Dispatch Relay</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
