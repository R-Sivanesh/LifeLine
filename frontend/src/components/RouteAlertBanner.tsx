import React from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, X, ShieldAlert } from 'lucide-react';
import { RerouteResult } from '../types';

interface RouteAlertBannerProps {
  isRerouting: boolean;
  rerouteResult: RerouteResult | null;
  onDismiss?: () => void;
}

export const RouteAlertBanner: React.FC<RouteAlertBannerProps> = ({
  isRerouting,
  rerouteResult,
  onDismiss
}) => {
  if (isRerouting) {
    return (
      <div className="bg-red-950/90 border-2 border-red-500 text-white p-4 rounded-xl shadow-2xl animate-pulse-glow flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-red-600 flex items-center justify-center shrink-0">
            <RefreshCw className="h-5 w-5 animate-spin text-white" />
          </div>
          <div>
            <div className="font-mono font-black text-sm tracking-wider text-red-300 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              <span>⚠ ROUTE DISRUPTION DETECTED</span>
            </div>
            <p className="text-xs text-zinc-200 mt-0.5">
              Road blockage detected on current route. Recalculating safe alternative corridor...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!rerouteResult) return null;

  return (
    <div className="bg-gradient-to-r from-emerald-950/90 via-zinc-900 to-zinc-900 border-2 border-emerald-500 text-white p-4 rounded-xl shadow-2xl animate-fadeIn flex items-center justify-between gap-3">
      <div className="flex items-start sm:items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="font-mono font-black text-sm tracking-wider text-emerald-300 flex items-center gap-2">
            <span>✓ NEW ROUTE SELECTED</span>
            <span className="text-xs font-normal text-zinc-300">
              (ETA: <strong className="text-emerald-400">{rerouteResult.new_eta_minutes.toFixed(0)} min</strong>)
            </span>
          </div>
          <p className="text-xs text-zinc-200 mt-0.5">
            <strong className="text-cyan-400 font-mono">[ WHY? ]</strong> {rerouteResult.reason}
          </p>
        </div>
      </div>

      {onDismiss && (
        <button
          onClick={onDismiss}
          className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
