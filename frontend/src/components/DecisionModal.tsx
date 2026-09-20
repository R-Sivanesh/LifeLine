import React from 'react';
import { DecisionExplanation } from '../types';
import { X, HelpCircle, CheckCircle2, ShieldCheck, Navigation, Truck, Building2, Database, AlertCircle } from 'lucide-react';

interface DecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  explanation: DecisionExplanation | null;
  targetCategory?: 'ambulance' | 'hospital' | 'route' | 'all';
}

export const DecisionModal: React.FC<DecisionModalProps> = ({
  isOpen,
  onClose,
  explanation,
  targetCategory = 'all'
}) => {
  if (!isOpen || !explanation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-2xl p-6 shadow-2xl text-zinc-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-mono tracking-wide">
                LIFELINE 2.0 DECISION INTELLIGENCE
              </h2>
              <p className="text-xs text-zinc-400">Deterministic scoring & live data provenance audit</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-4 space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Overall Strategy */}
          <div className="bg-gradient-to-r from-cyan-950/40 via-zinc-900 to-zinc-900 border border-cyan-500/30 p-3.5 rounded-xl">
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold mb-1">
              <ShieldCheck className="h-4 w-4" />
              <span>SYNCHRONIZED RESPONSE STRATEGY</span>
            </div>
            <p className="text-xs text-zinc-200 leading-relaxed font-sans">
              {explanation.overall_reason}
            </p>
          </div>

          {/* Ambulance Rationale */}
          <div className={`p-3.5 rounded-xl border ${targetCategory === 'ambulance' || targetCategory === 'all' ? 'bg-zinc-950/60 border-zinc-800' : 'opacity-60 border-zinc-800'}`}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold">
                <Truck className="h-4 w-4 text-cyan-400" />
                <span>AMBULANCE SELECTION RATIONALE</span>
              </div>
              <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                PROVENANCE: DEMO FLEET GPS
              </span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {explanation.ambulance_reason}
            </p>
          </div>

          {/* Hospital Rationale */}
          <div className={`p-3.5 rounded-xl border ${targetCategory === 'hospital' || targetCategory === 'all' ? 'bg-zinc-950/60 border-zinc-800' : 'opacity-60 border-zinc-800'}`}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold">
                <Building2 className="h-4 w-4 text-emerald-400" />
                <span>HOSPITAL MATCHING & READINESS</span>
              </div>
              <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/30">
                PROVENANCE: GOOGLE PLACES API
              </span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {explanation.hospital_reason}
            </p>
            <div className="mt-2 text-[10px] text-zinc-500 italic bg-zinc-900/90 p-2 rounded border border-zinc-800">
              * Bed count & ER queue capacity are estimated/simulated because no public municipal real-time hospital intake API currently exists.
            </div>
          </div>

          {/* Route Rationale */}
          <div className={`p-3.5 rounded-xl border ${targetCategory === 'route' || targetCategory === 'all' ? 'bg-zinc-950/60 border-zinc-800' : 'opacity-60 border-zinc-800'}`}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 text-blue-400 font-mono text-xs font-bold">
                <Navigation className="h-4 w-4 text-blue-400" />
                <span>ROUTE DYNAMICS & TRAFFIC RISK</span>
              </div>
              <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-500/30">
                PROVENANCE: GOOGLE ROUTES API (TRAFFIC-AWARE)
              </span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {explanation.route_reason}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-mono">
            <Database className="h-3.5 w-3.5 text-zinc-400" />
            <span>Real-time Data Provenance Enforced</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-all border border-zinc-600"
          >
            Close Explanation
          </button>
        </div>
      </div>
    </div>
  );
};
