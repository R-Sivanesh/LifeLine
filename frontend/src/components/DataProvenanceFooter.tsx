import React from 'react';
import { DataSourceStatusResponse } from '../types';
import { ShieldCheck, Info, Radio, Database, MapPin, Activity, Cpu, Map } from 'lucide-react';

interface DataProvenanceFooterProps {
  statusData?: DataSourceStatusResponse | null;
}

export const DataProvenanceFooter: React.FC<DataProvenanceFooterProps> = ({ statusData }) => {
  const getTrafficStatusBadge = () => {
    const s = statusData?.traffic?.status;
    if (s === 'LIVE') {
      return <span className="text-emerald-300 font-bold">🟢 LIVE ({statusData?.traffic?.source || 'Routes'})</span>;
    }
    if (s === 'DEGRADED') {
      return <span className="text-amber-300 font-bold">⚠️ DEGRADED ROUTING</span>;
    }
    return <span className="text-amber-300 font-bold">🟡 DEMO / SYNTHESIZED</span>;
  };

  const getMapStatusBadge = () => {
    const s = statusData?.map?.status;
    if (s === 'CONFIGURED') {
      return <span className="text-emerald-300 font-bold">🟢 LIVE ({statusData?.map?.source || 'Map Provider'})</span>;
    }
    return <span className="text-amber-300 font-bold">⚪ UNCONFIGURED (Vector Radar)</span>;
  };

  const getAiStatusBadge = () => {
    const s = statusData?.ai_dispatcher?.status;
    if (s === 'LIVE') {
      return <span className="text-cyan-300 font-bold">⚡ LIVE (Gemini Dispatcher)</span>;
    }
    return <span className="text-amber-300 font-bold">🟡 LOCAL FALLBACK (Rule Engine)</span>;
  };

  const getHospitalStatusBadge = () => {
    const s = statusData?.hospitals?.status;
    if (s === 'LIVE') {
      return <span className="text-emerald-300 font-bold">🟢 LIVE (Google Places)</span>;
    }
    return <span className="text-zinc-300 font-bold">🟢 PUBLIC DATA (Verified Registry)</span>;
  };

  return (
    <div className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-3.5 shadow-xl font-mono text-xs">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        {/* Title & Audit Header */}
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-cyan-400" />
          <span className="font-bold text-white tracking-wider uppercase text-[11px]">
            DATA SOURCES PROVENANCE
          </span>
          <span className="text-[10px] text-zinc-500 hidden sm:inline">• Provenance Audited</span>
        </div>

        {/* Provenance Pills */}
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          {/* Map */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-700">
            <span className="text-zinc-400">MAP:</span>
            {getMapStatusBadge()}
          </div>

          {/* Traffic */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-700">
            <span className="text-zinc-400">TRAFFIC:</span>
            {getTrafficStatusBadge()}
          </div>

          {/* AI */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-700">
            <span className="text-zinc-400">AI:</span>
            {getAiStatusBadge()}
          </div>

          {/* Hospitals */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-700">
            <span className="text-zinc-400">HOSPITALS:</span>
            {getHospitalStatusBadge()}
          </div>

          {/* Ambulances */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-700">
            <span className="text-zinc-400">AMBULANCES:</span>
            <span className="text-amber-300 font-bold">🟡 DEMO TELEMETRY</span>
          </div>

          {/* Hospital Capacity */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-700">
            <span className="text-zinc-400">ICU/BEDS:</span>
            <span className="text-zinc-400 font-bold">⚪ UNKNOWN (Public API N/A)</span>
          </div>
        </div>
      </div>

      {/* Safety & Integrity Disclaimer */}
      <div className="mt-2 pt-2 border-t border-zinc-900 text-[10px] text-zinc-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
        <span>
          * Emergency Decision Support Prototype. Live external data utilized for traffic routing and hospital placement when configured.
        </span>
        <span className="text-zinc-400">
          LifeLine 2.0 • Real-Time Emergency Intelligence
        </span>
      </div>
    </div>
  );
};
