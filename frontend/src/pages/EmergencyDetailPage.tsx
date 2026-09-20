import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { lifelineApi } from '../services/api';
import { Header } from '../components/Header';
import { TacticalMap } from '../components/TacticalMap';
import { Emergency, OptimizationResult, DecisionExplanation, RoadIncident } from '../types';
import { ArrowLeft, CheckCircle2, Clock, MapPin, Users, Activity, ShieldAlert, Truck, Building2 } from 'lucide-react';

export const EmergencyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [emergency, setEmergency] = useState<Emergency | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [explanation, setExplanation] = useState<DecisionExplanation | null>(null);
  const [loading, setLoading] = useState(true);
  const [incidents, setIncidents] = useState<RoadIncident[]>([]);

  const loadDetail = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [emg, opt, exp, incs] = await Promise.all([
        lifelineApi.getEmergency(id),
        lifelineApi.optimizeEmergency(id),
        lifelineApi.getDecisionExplanation(id),
        lifelineApi.getRoadIncidents()
      ]);
      setEmergency(emg);
      setOptimization(opt);
      setExplanation(exp);
      setIncidents(incs);
    } catch (err) {
      console.error('Failed to load emergency detail:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [id]);

  const handleUpdateStatus = async (status: string) => {
    if (!id) return;
    try {
      const updated = await lifelineApi.updateEmergencyStatus(id, status);
      setEmergency(updated);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const statuses = ['ACTIVE', 'DISPATCHED', 'EN_ROUTE', 'ARRIVED', 'RESOLVED'];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <Header />

      <main className="flex-1 p-4 lg:p-6 max-w-6xl w-full mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <Link
              to="/history"
              className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-white font-mono">{emergency?.title || 'Emergency Case'}</h1>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                  ID: {id?.slice(0, 8)}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">Emergency Operations Dispatch Log</p>
            </div>
          </div>

          {/* Status Progression Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 bg-zinc-900 p-1.5 rounded-lg border border-zinc-800">
            {statuses.map((st) => (
              <button
                key={st}
                onClick={() => handleUpdateStatus(st)}
                className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold transition-all ${
                  emergency?.status === st
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Data & Decision Breakdown (6 cols) */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl space-y-4">
              <div className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider pb-2 border-b border-zinc-800">
                Incident Report
              </div>
              <p className="text-sm text-zinc-200 bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                "{emergency?.description}"
              </p>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                  <div className="text-[10px] text-zinc-500">SEVERITY</div>
                  <div className="text-red-400 font-bold text-sm">{emergency?.severity}</div>
                </div>
                <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                  <div className="text-[10px] text-zinc-500">TOTAL CASUALTIES</div>
                  <div className="text-white font-bold text-sm">
                    {emergency?.patient_count} ({emergency?.critical_patient_count} Critical)
                  </div>
                </div>
              </div>

              {/* Optimization Highlights */}
              {optimization && (
                <div className="space-y-2 pt-2 border-t border-zinc-800">
                  <div className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">
                    Golden Minute Plan
                  </div>
                  <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Assigned Ambulance:</span>
                      <span className="text-cyan-400 font-bold font-mono">
                        {optimization.selected_ambulance ? `${optimization.selected_ambulance.vehicle_number} (${optimization.ambulance_eta}m ETA)` : 'No Verified Live Unit'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Receiving Hospital:</span>
                      <span className="text-emerald-400 font-bold font-mono">
                        {optimization.selected_hospital.name} ({optimization.travel_eta}m ETA)
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-800 font-mono">
                      <span className="text-white font-bold">Estimated Response-to-Care:</span>
                      <span className="text-amber-400 font-black text-sm">
                        {optimization.total_estimated_time} MINUTES
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Holistic Explanation */}
              {explanation && (
                <div className="p-3 bg-cyan-950/30 border border-cyan-500/30 rounded-lg text-xs text-zinc-300 space-y-1">
                  <div className="font-mono font-bold text-cyan-300">Algorithmic Decision Justification:</div>
                  <p className="text-[11px] leading-relaxed text-zinc-300">{explanation.overall_reason}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Map (6 cols) */}
          <div className="lg:col-span-6 h-[460px]">
            <TacticalMap
              emergency={emergency}
              selectedAmbulance={optimization?.selected_ambulance}
              selectedHospital={optimization?.selected_hospital}
              selectedRoute={optimization?.selected_route}
              alternativeRoutes={optimization?.alternative_routes}
              incidents={incidents}
              className="h-full w-full"
            />
          </div>
        </div>
      </main>
    </div>
  );
};
