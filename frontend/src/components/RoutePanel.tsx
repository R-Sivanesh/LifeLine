import React, { useState } from 'react';
import { RouteOption } from '../types';
import { Navigation, AlertTriangle, Layers, ChevronDown, ChevronUp, Check, ShieldAlert } from 'lucide-react';

interface RoutePanelProps {
  route: RouteOption | null;
  alternativeRoutes?: RouteOption[];
  onSelectRoute?: (route: RouteOption) => void;
  onWhyClick: () => void;
}

export const RoutePanel: React.FC<RoutePanelProps> = ({
  route,
  alternativeRoutes = [],
  onSelectRoute,
  onWhyClick
}) => {
  const [showAllRoutes, setShowAllRoutes] = useState(false);

  if (!route) {
    return (
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 text-center text-zinc-500 text-xs">
        Calculating optimal transit corridors...
      </div>
    );
  }

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'BLOCKED':
        return 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse';
      case 'HIGH':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'MEDIUM':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    }
  };

  const allAvailableRoutes = [route, ...alternativeRoutes];

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl flex flex-col justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-blue-950/60 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Navigation className="h-3.5 w-3.5" />
            </div>
            <span className="text-[11px] font-mono font-bold tracking-wider text-blue-400 uppercase">SELECTED ROUTE</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAllRoutes(!showAllRoutes)}
              className="flex items-center gap-1 text-[11px] font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 px-2 py-0.5 rounded transition-all"
            >
              <Layers className="h-3 w-3 text-blue-400" />
              <span>[ VIEW ROUTES ]</span>
              {showAllRoutes ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            <button
              onClick={onWhyClick}
              className="flex items-center gap-1 text-[11px] font-bold text-blue-400 bg-blue-950/50 hover:bg-blue-900/50 border border-blue-500/40 px-2 py-0.5 rounded transition-all"
            >
              <span>[ WHY? ]</span>
            </button>
          </div>
        </div>

        {/* Selected Route Info */}
        <div className="flex items-baseline justify-between gap-2 mt-1">
          <div>
            <h3 className="font-bold text-white text-base tracking-tight">{route.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getRiskBadge(route.risk_level)}`}>
                RISK: {route.risk_level}
              </span>
              <span className="text-[11px] text-zinc-400 font-mono">Distance: {route.distance_km.toFixed(1)} km</span>
            </div>
          </div>

          {/* Travel ETA */}
          <div className="text-right">
            <div className="text-[10px] text-zinc-400 uppercase font-mono">TRANSIT DURATION</div>
            <div className="text-2xl font-black font-mono text-blue-400 leading-none mt-0.5">
              {route.adjusted_eta_minutes.toFixed(0)} <span className="text-xs font-normal text-zinc-400">MIN</span>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
              Base: {route.duration_minutes.toFixed(0)}m
            </div>
          </div>
        </div>

        {/* Incidents on Route Alert */}
        {route.incidents && route.incidents.length > 0 && (
          <div className="mt-2.5 p-2 rounded-lg bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Active incident nearby:</span> {route.incidents[0].description} (+delay applied)
            </div>
          </div>
        )}
      </div>

      {/* Alternative Routes Drawer */}
      {showAllRoutes && (
        <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1.5 animate-fadeIn">
          <div className="text-[10px] font-mono uppercase text-zinc-400 font-bold mb-1">
            Calculated Route Alternatives
          </div>
          {allAvailableRoutes.map((r) => {
            const isSelected = r.id === route.id;
            return (
              <div
                key={r.id}
                onClick={() => onSelectRoute && onSelectRoute(r)}
                className={`p-2 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                  isSelected
                    ? 'bg-blue-950/40 border-blue-500/50 text-white'
                    : 'bg-zinc-950/40 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isSelected && <Check className="h-3.5 w-3.5 text-blue-400" />}
                  <div>
                    <span className="font-semibold">{r.name}</span>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      {r.distance_km.toFixed(1)} km • Base: {r.duration_minutes.toFixed(0)}m
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${getRiskBadge(r.risk_level)}`}>
                    {r.risk_level}
                  </span>
                  <span className="font-mono font-bold text-white text-sm">
                    {r.adjusted_eta_minutes.toFixed(0)}m
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
