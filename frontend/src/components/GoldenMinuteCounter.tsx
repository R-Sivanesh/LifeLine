import React from 'react';
import { Timer, ArrowRight, ShieldAlert, Sparkles, RefreshCw } from 'lucide-react';

interface GoldenMinuteCounterProps {
  totalMinutes: number;
  ambulanceEta: number;
  travelEta: number;
  onSimulateBlockage: () => void;
  isSimulatingBlockage?: boolean;
}

export const GoldenMinuteCounter: React.FC<GoldenMinuteCounterProps> = ({
  totalMinutes,
  ambulanceEta,
  travelEta,
  onSimulateBlockage,
  isSimulatingBlockage
}) => {
  return (
    <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-4 sm:p-5 shadow-2xl relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Metric Header & Giant Number */}
        <div>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Timer className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-mono font-bold tracking-wider text-amber-400 uppercase">
              GOLDEN MINUTE OPTIMIZATION
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Estimated response-to-appropriate-care timeline (Prototype optimization)
          </p>

          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-4xl sm:text-5xl font-black font-mono text-white tracking-tight">
              {totalMinutes.toFixed(0)}
            </span>
            <span className="text-base sm:text-lg font-bold font-mono text-amber-400">MINUTES</span>
            <span className="text-[11px] text-zinc-400 ml-2 hidden sm:inline">
              (Ambulance: {ambulanceEta.toFixed(0)}m + Transit: {travelEta.toFixed(0)}m)
            </span>
          </div>
        </div>

        {/* Timeline Sequence Pill */}
        <div className="flex items-center gap-1.5 sm:gap-2 bg-zinc-950/80 border border-zinc-800 p-2 sm:p-2.5 rounded-lg text-[11px] font-mono w-full md:w-auto justify-between md:justify-start">
          <div className="flex flex-col items-center">
            <span className="text-zinc-500 text-[9px]">SCENE ETA</span>
            <span className="text-cyan-400 font-bold">{ambulanceEta.toFixed(0)} min</span>
          </div>
          <ArrowRight className="h-3 w-3 text-zinc-600 shrink-0" />
          <div className="flex flex-col items-center">
            <span className="text-zinc-500 text-[9px]">TRIAGE</span>
            <span className="text-zinc-300 font-bold">1-2 min</span>
          </div>
          <ArrowRight className="h-3 w-3 text-zinc-600 shrink-0" />
          <div className="flex flex-col items-center">
            <span className="text-zinc-500 text-[9px]">HOSPITAL ETA</span>
            <span className="text-emerald-400 font-bold">{travelEta.toFixed(0)} min</span>
          </div>
        </div>

        {/* Hero Trigger Action: SIMULATE BLOCKAGE */}
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
      </div>
    </div>
  );
};
