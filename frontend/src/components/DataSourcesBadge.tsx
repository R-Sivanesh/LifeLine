import React, { useState, useEffect } from 'react';
import { DataSourceStatusResponse } from '../types';
import { lifelineApi } from '../services/api';
import { ShieldCheck, Info, X, Radio, Activity, Navigation, Building2, Truck, AlertCircle } from 'lucide-react';

interface DataSourcesBadgeProps {
  statusData?: DataSourceStatusResponse | null;
}

export const DataSourcesBadge: React.FC<DataSourcesBadgeProps> = ({ statusData: propStatus }) => {
  const [status, setStatus] = useState<DataSourceStatusResponse | null>(propStatus || null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!propStatus) {
      lifelineApi.getDataSourcesStatus().then(setStatus).catch(console.warn);
    } else {
      setStatus(propStatus);
    }
  }, [propStatus]);

  return (
    <>
      <div
        onClick={() => setModalOpen(true)}
        className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-zinc-950/90 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1 rounded-lg text-[10px] font-mono cursor-pointer transition-all shadow-md group"
        title="Click to inspect live data source classifications"
      >
        <div className="flex items-center gap-1 text-zinc-400 group-hover:text-zinc-200">
          <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
          <span className="font-bold uppercase tracking-wider text-zinc-300">DATA AUDIT:</span>
        </div>

        {/* Traffic */}
        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${status?.traffic?.status === 'LIVE' ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-amber-950/60 border-amber-500/40 text-amber-300'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status?.traffic?.status === 'LIVE' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
          <span>{status?.traffic?.status === 'LIVE' ? 'LIVE TRAFFIC' : 'DEMO ROUTING'}</span>
        </span>

        {/* AI Dispatcher */}
        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${status?.ai_dispatcher?.status === 'LIVE' ? 'bg-cyan-950/60 border-cyan-500/40 text-cyan-300' : 'bg-amber-950/60 border-amber-500/40 text-amber-300'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status?.ai_dispatcher?.status === 'LIVE' ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'}`}></span>
          <span>{status?.ai_dispatcher?.status === 'LIVE' ? 'GEMINI DISPATCH' : 'RULE ENGINE'}</span>
        </span>

        {/* Places */}
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
          <span>{status?.hospitals?.status === 'LIVE' ? 'GOOGLE PLACES' : 'VERIFIED REGISTRY'}</span>
        </span>

        {/* Ambulance Telemetry */}
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
          <span>DEMO TELEMETRY</span>
        </span>

        {/* Hospital Capacity */}
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-500"></span>
          <span>CAPACITY UNKNOWN</span>
        </span>

        <Info className="h-3 w-3 text-zinc-500 group-hover:text-cyan-400 ml-0.5" />
      </div>

      {/* Audit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-700 rounded-2xl p-5 shadow-2xl text-zinc-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-cyan-400" />
                <div>
                  <h3 className="font-bold text-white font-mono text-sm uppercase">Data Source Integrity Audit</h3>
                  <p className="text-[11px] text-zinc-400">Honest classification of live vs simulated emergency telemetry</p>
                </div>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-emerald-500/30">
                <div className="flex items-center justify-between font-bold text-emerald-300 mb-1">
                  <span>ROAD TRAFFIC & CORRIDORS</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-500/40">LIVE EXTERNAL</span>
                </div>
                <p className="text-zinc-300 font-sans text-[11px]">
                  Real-time driving duration, distance, and multi-corridor geometry fetched via Google Routes API (Traffic Aware).
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-emerald-500/30">
                <div className="flex items-center justify-between font-bold text-emerald-300 mb-1">
                  <span>HOSPITAL LOCATIONS & PLACES</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-500/40">REAL PUBLIC DATA</span>
                </div>
                <p className="text-zinc-300 font-sans text-[11px]">
                  Verified hospital locations, addresses, and phone contacts discovered via Google Places API (New).
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-amber-500/30">
                <div className="flex items-center justify-between font-bold text-amber-300 mb-1">
                  <span>AMBULANCE TELEMETRY & AVAILABILITY</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 border border-amber-500/40">SIMULATED / DEMO</span>
                </div>
                <p className="text-zinc-300 font-sans text-[11px]">
                  Simulated municipal vehicle positions and ALS/ICU equipment configurations for Chennai response zone.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-700">
                <div className="flex items-center justify-between font-bold text-zinc-400 mb-1">
                  <span>ICU & BED OCCUPANCY</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-700">PUBLIC DATA UNAVAILABLE</span>
                </div>
                <p className="text-zinc-400 font-sans text-[11px]">
                  Real-time hospital bed queues and ICU occupancy are not published by public municipal APIs. LifeLine flags this data as unverified rather than fabricating certainty.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
