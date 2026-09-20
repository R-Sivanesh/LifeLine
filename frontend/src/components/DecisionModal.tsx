import React from 'react';
import { DecisionExplanation } from '../types';
import { X, HelpCircle, CheckCircle2, ShieldCheck, Navigation, Truck, Building2 } from 'lucide-react';

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
                SYSTEM DECISION EXPLANATION
              </h2>
              <p className="text-xs text-zinc-400">Transparent AI & algorithmic recommendation breakdown</p>
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
              <span>HOLISTIC GOLDEN MINUTE STRATEGY</span>
            </div>
            <p className="text-xs text-zinc-200 leading-relaxed font-sans">
              {explanation.overall_reason}
            </p>
          </div>

          {/* Ambulance Rationale */}
          <div className={`p-3.5 rounded-xl border ${targetCategory === 'ambulance' || targetCategory === 'all' ? 'bg-zinc-950/60 border-zinc-800' : 'opacity-60 border-zinc-800'}`}>
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold mb-1.5">
              <Truck className="h-4 w-4 text-cyan-400" />
              <span>AMBULANCE SELECTION RATIONALE</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {explanation.ambulance_reason}
            </p>
          </div>

          {/* Hospital Rationale */}
          <div className={`p-3.5 rounded-xl border ${targetCategory === 'hospital' || targetCategory === 'all' ? 'bg-zinc-950/60 border-zinc-800' : 'opacity-60 border-zinc-800'}`}>
            <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold mb-1.5">
              <Building2 className="h-4 w-4 text-emerald-400" />
              <span>HOSPITAL READINESS RATIONALE</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {explanation.hospital_reason}
            </p>
            <div className="mt-2 text-[10px] text-zinc-500 italic">
              * Based on simulated ER intake capacity and clinical capability tags.
            </div>
          </div>

          {/* Route Rationale */}
          <div className={`p-3.5 rounded-xl border ${targetCategory === 'route' || targetCategory === 'all' ? 'bg-zinc-950/60 border-zinc-800' : 'opacity-60 border-zinc-800'}`}>
            <div className="flex items-center gap-2 text-blue-400 font-mono text-xs font-bold mb-1.5">
              <Navigation className="h-4 w-4 text-blue-400" />
              <span>ROUTE & RISK EVALUATION</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {explanation.route_reason}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-zinc-800 flex justify-end">
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
