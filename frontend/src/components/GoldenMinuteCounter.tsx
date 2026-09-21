import React from 'react';
import { Timer, ArrowRight, ShieldAlert, ShieldCheck, AlertTriangle, RefreshCw, Radio } from 'lucide-react';
import { DecisionConfidenceBreakdown } from '../types';

interface GoldenMinuteCounterProps {
  totalMinutes: number;
  ambulanceEta: number;
  travelEta: number;
  confidence?: DecisionConfidenceBreakdown | null;
  onSimulateBlockage: () => void;
  isSimulatingBlockage?: boolean;
  isActive?: boolean;
}

export const GoldenMinuteCounter: React.FC<GoldenMinuteCounterProps> = ({
  totalMinutes,
  ambulanceEta,
  travelEta,
  confidence,
  onSimulateBlockage,
  isSimulatingBlockage,
  isActive = true
}) => {
  const getConfidenceBadge = () => {
    if (!isActive || totalMinutes <= 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
          <Radio className="h-3 w-3 text-cyan-400 animate-pulse" />
          STANDBY
        </span>
      );
    }

    const level = confidence?.level || 'HIGH';
    switch (level) {
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/70 text-emerald-400 border border-emerald-500/40" title={confidence?.known_factors?.join(', ') || confidence?.rationale || 'High confidence based on live telemetry & routes'}>
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            CONFIDENCE: HIGH
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/70 text-amber-400 border border-amber-500/40" title={confidence?.known_factors?.join(', ') || confidence?.rationale || 'Medium confidence'}>
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            CONFIDENCE: MEDIUM
          </span>
        );
      case 'LOW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950/70 text-red-400 border border-red-500/40" title={confidence?.unknown_factors?.join(', ') || confidence?.rationale || 'Low confidence - missing signals'}>
            <ShieldAlert className="h-3 w-3 text-red-400" />
            CONFIDENCE: LOW
          </span>
        );
    }
  };

  return (
    <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-4 sm:p-5 shadow-2xl relative overflow-hidden">
      {/* Background ambient glow */}
      <div className={`absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 ${isActive && totalMinutes > 0 ? 'bg-amber-500/10' : 'bg-cyan-500/5'} rounded-full blur-2xl pointer-events-none`}></div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Metric Header & Giant Number */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`h-6 w-6 rounded ${isActive && totalMinutes > 0 ? 'bg-amber-950/60 border-amber-500/30 text-amber-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'} border flex items-center justify-center`}>
              <Timer className="h-3.5 w-3.5" />
            </div>
            <span className={`text-xs font-mono font-bold tracking-wider ${isActive && totalMinutes > 0 ? 'text-amber-400' : 'text-zinc-400'} uppercase`}>
              GOLDEN MINUTE TIMELINE
            </span>
            {getConfidenceBadge()}
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {isActive && totalMinutes > 0
              ? 'Synchronized emergency dispatch timeline across live routing & hospital matching'
              : 'System in intake standby. Complete AI intake or load scenario to calculate response.'}
          </p>

          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-4xl sm:text-5xl font-black font-mono text-white tracking-tight">
              {isActive && totalMinutes > 0 ? totalMinutes.toFixed(0) : '--'}
            </span>
            <span className={`text-base sm:text-lg font-bold font-mono ${isActive && totalMinutes > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
              MINUTES
            </span>
            {isActive && totalMinutes > 0 ? (
              <span className="text-[11px] text-zinc-400 ml-2 hidden sm:inline">
                (Ambulance: {ambulanceEta.toFixed(0)}m + Transit: {travelEta.toFixed(0)}m)
              </span>
            ) : (
              <span className="text-[11px] text-zinc-500 ml-2 hidden sm:inline">
                (Awaiting Incident Dispatch)
              </span>
            )}
          </div>
        </div>

        {/* Timeline Sequence Pill */}
        <div className="flex items-center gap-1.5 sm:gap-2 bg-zinc-950/80 border border-zinc-800 p-2 sm:p-2.5 rounded-lg text-[11px] font-mono w-full md:w-auto justify-between md:justify-start">
          <div className="flex flex-col items-center">
            <span className="text-zinc-500 text-[9px]">SCENE ETA</span>
            <span className={isActive && totalMinutes > 0 ? "text-cyan-400 font-bold" : "text-zinc-500 font-bold"}>
              {isActive && totalMinutes > 0 ? `${ambulanceEta.toFixed(0)} min` : '--'}
            </span>
          </div>
          <ArrowRight className="h-3 w-3 text-zinc-600 shrink-0" />
          <div className="flex flex-col items-center">
            <span className="text-zinc-500 text-[9px]">TRIAGE</span>
            <span className={isActive && totalMinutes > 0 ? "text-zinc-300 font-bold" : "text-zinc-500 font-bold"}>
              {isActive && totalMinutes > 0 ? '1-2 min' : '--'}
            </span>
          </div>
          <ArrowRight className="h-3 w-3 text-zinc-600 shrink-0" />
          <div className="flex flex-col items-center">
            <span className="text-zinc-500 text-[9px]">HOSPITAL ETA</span>
            <span className={isActive && totalMinutes > 0 ? "text-emerald-400 font-bold" : "text-zinc-500 font-bold"}>
              {isActive && totalMinutes > 0 ? `${travelEta.toFixed(0)} min` : '--'}
            </span>
          </div>
        </div>

        {/* Action button if active */}
        {isActive && totalMinutes > 0 && (
          <div className="w-full md:w-auto">
            <button
              onClick={onSimulateBlockage}
              disabled={isSimulatingBlockage}
              className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-xs tracking-wider uppercase transition-all shadow-lg shadow-red-600/30 border border-red-400 disabled:opacity-50"
            >
              {isSimulatingBlockage ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Simulating...</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4 text-white animate-pulse" />
                  <span>[ SIMULATE BLOCKAGE ]</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
