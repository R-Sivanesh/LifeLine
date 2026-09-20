import React from 'react';
import { AmbulanceRecommendation } from '../types';
import { Truck, CheckCircle2, HelpCircle, ShieldCheck } from 'lucide-react';

interface AmbulancePanelProps {
  ambulance: AmbulanceRecommendation | null;
  onWhyClick: () => void;
}

export const AmbulancePanel: React.FC<AmbulancePanelProps> = ({ ambulance, onWhyClick }) => {
  if (!ambulance) {
    return (
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 text-center text-zinc-500 text-xs">
        Finding suitable emergency ambulance...
      </div>
    );
  }

  const getCapColor = (cap: string) => {
    switch (cap) {
      case 'ICU':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'ADVANCED':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      default:
        return 'bg-zinc-700/30 text-zinc-300 border-zinc-600';
    }
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl flex flex-col justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Truck className="h-3.5 w-3.5" />
            </div>
            <span className="text-[11px] font-mono font-bold tracking-wider text-cyan-400 uppercase">AMBULANCE DISPATCH</span>
          </div>
          <button
            onClick={onWhyClick}
            className="flex items-center gap-1 text-[11px] font-bold text-cyan-400 bg-cyan-950/50 hover:bg-cyan-900/50 border border-cyan-500/40 px-2 py-0.5 rounded transition-all"
            title="Inspect why this ambulance was chosen"
          >
            <HelpCircle className="h-3 w-3" />
            <span>[ WHY? ]</span>
          </button>
        </div>

        {/* Title and Capability */}
        <div className="flex items-baseline justify-between gap-2 mt-1">
          <div>
            <h3 className="font-bold text-white text-base tracking-tight">{ambulance.vehicle_number}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getCapColor(ambulance.capability)}`}>
                {ambulance.capability} ALS
              </span>
              <span className="text-[11px] text-zinc-400 font-mono">Match: <strong className="text-emerald-400">{ambulance.match_score}%</strong></span>
            </div>
          </div>

          {/* ETA Display */}
          <div className="text-right">
            <div className="text-[10px] text-zinc-400 uppercase font-mono">ETA TO SCENE</div>
            <div className="text-2xl font-black font-mono text-cyan-400 leading-none mt-0.5">
              {ambulance.eta_minutes.toFixed(0)} <span className="text-xs font-normal text-zinc-400">MIN</span>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{ambulance.distance_km.toFixed(1)} km away</div>
          </div>
        </div>

        {/* Primary Suitability Highlights */}
        <div className="mt-3 space-y-1">
          {ambulance.reasons.slice(0, 2).map((reason, idx) => (
            <div key={idx} className="flex items-center gap-1.5 text-[11px] text-zinc-300">
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
              <span className="line-clamp-1">{reason}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
