import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lifelineApi } from '../services/api';
import { Header } from '../components/Header';
import { Emergency, Severity } from '../types';
import { Clock, Users, ArrowRight, ShieldAlert, CheckCircle2, AlertCircle, PlusCircle, RefreshCw } from 'lucide-react';

export const HistoryPage: React.FC = () => {
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEmergencies = async () => {
    try {
      setLoading(true);
      const list = await lifelineApi.listEmergencies();
      setEmergencies(list);
    } catch (err) {
      console.error('Failed to load emergencies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmergencies();
  }, []);

  const getSeverityBadge = (sev: Severity) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      case 'HIGH':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'MEDIUM':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-6xl w-full mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight flex items-center gap-2">
              <Clock className="h-5 w-5 text-cyan-400" />
              EMERGENCY DISPATCH & INCIDENT LOGS
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Historical record of emergency calls, triage severities, and algorithmic routing dispatches
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadEmergencies}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <Link
              to="/emergency/new"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold font-mono tracking-wider uppercase shadow-lg shadow-red-600/20"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>New Intake</span>
            </Link>
          </div>
        </div>

        {/* Emergency Log List */}
        {loading ? (
          <div className="text-center py-12 text-zinc-500 font-mono text-xs">
            Loading dispatch history...
          </div>
        ) : emergencies.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-400 space-y-3">
            <AlertCircle className="h-8 w-8 mx-auto text-zinc-500" />
            <p className="text-sm">No emergency records found.</p>
            <Link
              to="/emergency/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-cyan-300 text-xs font-semibold"
            >
              Create First Emergency
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {emergencies.map((emg) => (
              <div
                key={emg.id}
                className="bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getSeverityBadge(emg.severity)}`}>
                      {emg.severity}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {emg.status}
                    </span>
                    <span className="text-[11px] text-cyan-400 font-mono font-bold uppercase">
                      {emg.incident_type.replace('_', ' ')}
                    </span>
                  </div>

                  <h3 className="font-bold text-white text-sm sm:text-base leading-snug">
                    {emg.title || 'Emergency Case'}
                  </h3>

                  <p className="text-xs text-zinc-300 line-clamp-1">
                    "{emg.description}"
                  </p>

                  <div className="flex items-center gap-4 text-[11px] text-zinc-400 font-mono pt-1">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3 text-zinc-500" />
                      {emg.patient_count} Patients ({emg.critical_patient_count} Critical)
                    </span>
                    <span>•</span>
                    <span>
                      GPS: {emg.latitude.toFixed(3)}, {emg.longitude.toFixed(3)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <Link
                    to={`/emergency/${emg.id}`}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-semibold border border-zinc-700 transition-all"
                  >
                    <span>View Dispatch</span>
                    <ArrowRight className="h-3.5 w-3.5 text-cyan-400" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
};
