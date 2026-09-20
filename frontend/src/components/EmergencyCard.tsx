import React from 'react';
import { Emergency, Severity } from '../types';
import { AlertCircle, Users, MapPin, Clock, Sparkles } from 'lucide-react';

interface EmergencyCardProps {
  emergency: Emergency;
  onAnalyze?: () => void;
  isAnalyzing?: boolean;
}

export const EmergencyCard: React.FC<EmergencyCardProps> = ({ emergency, onAnalyze, isAnalyzing }) => {
  const getSeverityBadge = (sev: Severity) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse';
      case 'HIGH':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'MEDIUM':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    }
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl relative overflow-hidden">
      {/* Top Banner */}
      <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-red-500 animate-ping"></div>
          <span className="text-[11px] font-mono font-bold tracking-wider text-red-400 uppercase">ACTIVE EMERGENCY</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${getSeverityBadge(emergency.severity)}`}>
            {emergency.severity}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
            {emergency.status}
          </span>
        </div>
      </div>

      {/* Main Title & Description */}
      <div className="mb-3">
        <h2 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug">
          {emergency.title || 'Emergency Incident'}
        </h2>
        <p className="text-xs text-zinc-300 mt-1 leading-relaxed bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/60 font-sans">
          "{emergency.description}"
        </p>
      </div>

      {/* Structured Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <div className="bg-zinc-950/50 border border-zinc-800/70 p-2 rounded-lg flex items-center gap-2">
          <Users className="h-4 w-4 text-zinc-400 shrink-0" />
          <div>
            <div className="text-[10px] text-zinc-400">Casualties</div>
            <div className="font-bold text-white font-mono">
              {emergency.patient_count} Total <span className="text-red-400">({emergency.critical_patient_count} Crit)</span>
            </div>
          </div>
        </div>

        <div className="bg-zinc-950/50 border border-zinc-800/70 p-2 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-zinc-400 shrink-0" />
          <div>
            <div className="text-[10px] text-zinc-400">Incident Type</div>
            <div className="font-bold text-cyan-300 font-mono text-[11px]">
              {emergency.incident_type.replace('_', ' ')}
            </div>
          </div>
        </div>

        <div className="bg-zinc-950/50 border border-zinc-800/70 p-2 rounded-lg flex items-center gap-2 col-span-2 sm:col-span-1">
          <MapPin className="h-4 w-4 text-zinc-400 shrink-0" />
          <div>
            <div className="text-[10px] text-zinc-400">GPS Coordinates</div>
            <div className="font-mono text-[11px] text-zinc-200">
              {emergency.latitude.toFixed(4)}, {emergency.longitude.toFixed(4)}
            </div>
          </div>
        </div>
      </div>

      {/* AI Structured Extraction trigger if available */}
      {onAnalyze && (
        <div className="mt-3 pt-2 border-t border-zinc-800/60 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>AI Incident Extraction Active</span>
          </div>
          <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1"
          >
            {isAnalyzing ? 'Re-analyzing...' : 'Re-run NLP Extraction'}
          </button>
        </div>
      )}
    </div>
  );
};
