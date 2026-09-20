import React, { useState } from 'react';
import { Radio, Zap, Shield, Check, Clock, AlertCircle } from 'lucide-react';

export const GreenCorridorSim: React.FC = () => {
  const [corridorActive, setCorridorActive] = useState(false);

  const intersections = [
    { name: 'Anna Salai / Cathedral Rd Junction', normalDelay: '1.5 min', priorityDelay: '0.3 min', distance: '1.2 km' },
    { name: 'Mount Road / Guindy Radial Interchange', normalDelay: '1.5 min', priorityDelay: '0.4 min', distance: '2.8 km' },
    { name: 'Saidapet Bridge / Emergency Intake Link', normalDelay: '1.0 min', priorityDelay: '0.3 min', distance: '4.1 km' }
  ];

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-5 shadow-2xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Zap className="h-3.5 w-3.5" />
            </div>
            <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
              EMERGENCY PRIORITY LANE (GREEN WAVE SIMULATION)
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Simulated dynamic intersection traffic signal coordination along active ambulance corridor
          </p>
        </div>

        <button
          onClick={() => setCorridorActive(!corridorActive)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all border ${
            corridorActive
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-600/30'
              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
          }`}
        >
          <Radio className={`h-3.5 w-3.5 ${corridorActive ? 'animate-ping' : ''}`} />
          <span>{corridorActive ? 'PRIORITY CORRIDOR ACTIVE' : 'ACTIVATE GREEN WAVE'}</span>
        </button>
      </div>

      {/* Intersections Flow */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {intersections.map((item, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-lg border text-xs transition-all ${
              corridorActive
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-100'
                : 'bg-zinc-950/60 border-zinc-800 text-zinc-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] text-zinc-400">INTERSECTION #{idx + 1}</span>
              <div className="flex items-center gap-1">
                <span className={`h-2.5 w-2.5 rounded-full ${corridorActive ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`}></span>
                <span className="font-mono text-[10px] font-bold">
                  {corridorActive ? 'PREEMPTED GREEN' : 'NORMAL CYCLE'}
                </span>
              </div>
            </div>

            <div className="font-semibold text-white text-xs mb-2 leading-snug">{item.name}</div>

            <div className="flex items-center justify-between text-[11px] pt-2 border-t border-zinc-800/80 font-mono">
              <span className="text-zinc-400">Signal Delay:</span>
              <span className={corridorActive ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                {corridorActive ? item.priorityDelay : item.normalDelay}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Delay Summary Comparison */}
      <div className="mt-4 p-3 rounded-lg bg-zinc-950/80 border border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono">
            <span className="text-zinc-400">Standard Traffic Delay:</span>
            <span className="text-red-400 font-bold">+4.0 min</span>
          </div>
          <span className="text-zinc-600">→</span>
          <div className="flex items-center gap-1.5 font-mono">
            <span className="text-zinc-400">Simulated Corridor Delay:</span>
            <span className="text-emerald-400 font-bold">{corridorActive ? '+1.0 min' : '+4.0 min'}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-emerald-400 font-mono font-bold">
          <Clock className="h-3.5 w-3.5" />
          <span>{corridorActive ? 'SAVING ~3.0 MINUTES IN GOLDEN HOUR' : 'READY FOR ACTIVATION'}</span>
        </div>
      </div>

      <div className="mt-2 text-[10px] text-zinc-500 italic text-right">
        * Simulation only — no real traffic infrastructure connected.
      </div>
    </div>
  );
};
