import React from 'react';
import { HospitalRecommendation } from '../types';
import { Building2, CheckCircle2, HelpCircle, AlertCircle } from 'lucide-react';

interface HospitalPanelProps {
  hospital: HospitalRecommendation | null;
  onWhyClick: () => void;
}

export const HospitalPanel: React.FC<HospitalPanelProps> = ({ hospital, onWhyClick }) => {
  if (!hospital) {
    return (
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 text-center text-zinc-500 text-xs">
        Matching ready hospital...
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl flex flex-col justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <span className="text-[11px] font-mono font-bold tracking-wider text-emerald-400 uppercase">DESTINATION HOSPITAL</span>
          </div>
          <button
            onClick={onWhyClick}
            className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/50 hover:bg-emerald-900/50 border border-emerald-500/40 px-2 py-0.5 rounded transition-all"
            title="Inspect why this hospital was chosen"
          >
            <HelpCircle className="h-3 w-3" />
            <span>[ WHY? ]</span>
          </button>
        </div>

        {/* Title and Capabilities */}
        <div className="flex items-baseline justify-between gap-2 mt-1">
          <div>
            <h3 className="font-bold text-white text-base tracking-tight">{hospital.name}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {hospital.trauma_capable && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950/50 text-red-300 border border-red-500/40">
                  TRAUMA CAPABLE
                </span>
              )}
              {hospital.icu_available && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950/50 text-purple-300 border border-purple-500/40">
                  ICU READY
                </span>
              )}
              <span className="text-[11px] text-zinc-400 font-mono">
                Simulated Beds: <strong className="text-emerald-400">{hospital.available_beds}</strong>
              </span>
            </div>
          </div>

          {/* ETA Display */}
          <div className="text-right">
            <div className="text-[10px] text-zinc-400 uppercase font-mono">TRANSIT ETA</div>
            <div className="text-2xl font-black font-mono text-emerald-400 leading-none mt-0.5">
              {hospital.eta_minutes.toFixed(0)} <span className="text-xs font-normal text-zinc-400">MIN</span>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">Readiness: {hospital.match_score}%</div>
          </div>
        </div>

        {/* Suitability Highlights */}
        <div className="mt-3 space-y-1">
          {hospital.reasons.slice(0, 2).map((reason, idx) => (
            <div key={idx} className="flex items-center gap-1.5 text-[11px] text-zinc-300">
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
              <span className="line-clamp-1">{reason}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 text-[10px] text-zinc-500 italic">
        * Simulated Hospital Capacity & Status
      </div>
    </div>
  );
};
