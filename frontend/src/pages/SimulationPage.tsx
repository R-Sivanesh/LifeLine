import React, { useState, useEffect } from 'react';
import { lifelineApi } from '../services/api';
import { Header } from '../components/Header';
import { MapboxMap } from '../components/MapboxMap';
import { RouteAlertBanner } from '../components/RouteAlertBanner';
import { GreenCorridorSim } from '../components/GreenCorridorSim';
import {
  Emergency,
  OptimizationResult,
  DecisionExplanation,
  RerouteResult,
  RoadIncident
} from '../types';
import {
  Play,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Cpu,
  ChevronRight,
  ChevronLeft,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Layers,
  HelpCircle
} from 'lucide-react';

export const SimulationPage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [emergency, setEmergency] = useState<Emergency | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [explanation, setExplanation] = useState<DecisionExplanation | null>(null);
  const [incidents, setIncidents] = useState<RoadIncident[]>([]);
  const [rerouteResult, setRerouteResult] = useState<RerouteResult | null>(null);
  const [isRerouting, setIsRerouting] = useState(false);

  // 11 Steps of the Hackathon Demo
  const demoSteps = [
    {
      step: 1,
      title: 'Initialize Dashboard & Demo Mode',
      desc: 'Initialize the LifeLine mission control grid with simulated ambulances, trauma hospitals, and road networks.',
      actionLabel: 'Reset & Initialize Demo',
      action: async () => {
        setLoading(true);
        await lifelineApi.resetDemo();
        const emg = await lifelineApi.createHeroEmergency();
        setEmergency(emg);
        const [opt, exp, incs] = await Promise.all([
          lifelineApi.optimizeEmergency(emg.id),
          lifelineApi.getDecisionExplanation(emg.id),
          lifelineApi.getRoadIncidents()
        ]);
        setOptimization(opt);
        setExplanation(exp);
        setIncidents(incs);
        setRerouteResult(null);
        setLoading(false);
      }
    },
    {
      step: 2,
      title: 'Incoming Emergency Report',
      desc: 'Natural language report received: "Three people injured in a road accident near the railway bridge. One person is unconscious."',
      actionLabel: 'Load Emergency',
      action: async () => {
        if (!emergency) {
          const emg = await lifelineApi.createHeroEmergency();
          setEmergency(emg);
        }
      }
    },
    {
      step: 3,
      title: 'AI Severity & Incident Extraction',
      desc: 'OpenAI NLP parses report into structured JSON: Type: ROAD_ACCIDENT, Patients: 3 (1 Critical), Severity: CRITICAL.',
      actionLabel: 'Extract Structured Metrics',
      action: async () => {
        if (emergency) {
          await lifelineApi.analyzeEmergency(emergency.id);
        }
      }
    },
    {
      step: 4,
      title: 'Smart Ambulance Matching',
      desc: 'Ranks candidate vehicles. Recommends A-102 (Advanced ALS, 6m ETA) over closer Basic transport due to critical trauma support.',
      actionLabel: 'Review Ambulance Rationale',
      action: async () => {}
    },
    {
      step: 5,
      title: 'Hospital Readiness & Trauma Check',
      desc: 'Evaluates receiving facilities. Matches City Trauma Center for Level-1 trauma capability, active ICU, and open beds.',
      actionLabel: 'Review Hospital Readiness',
      action: async () => {}
    },
    {
      step: 6,
      title: 'Mapbox Route & Risk Calculation',
      desc: 'Calculates routes: Route A (8m, HIGH risk collision), Route B (10m, LOW risk clear corridor), Route C (12m, MEDIUM risk). Selects Route B.',
      actionLabel: 'Calculate Routes & Risk',
      action: async () => {}
    },
    {
      step: 7,
      title: 'Golden Minute Total Care Optimization',
      desc: 'Computes overall timeline: Ambulance ETA (6m) + Route Transit (10m) = 16 min estimated time to appropriate care.',
      actionLabel: 'Review Golden Minute Plan',
      action: async () => {}
    },
    {
      step: 8,
      title: 'Simulate Road Blockage (Hero Trigger)',
      desc: 'Simulate sudden flash blockage (e.g. water main burst / road collapse) on active Route B corridor.',
      actionLabel: 'Inject Active Road Blockage',
      action: async () => {
        if (!emergency) return;
        setIsRerouting(true);
        await lifelineApi.blockRouteDemo();
        const incs = await lifelineApi.getRoadIncidents();
        setIncidents(incs);
        setTimeout(async () => {
          const reroute = await lifelineApi.triggerReroute(emergency.id);
          setRerouteResult(reroute);
          if (reroute.new_route && optimization) {
            setOptimization({
              ...optimization,
              selected_route: reroute.new_route,
              travel_eta: reroute.new_eta_minutes,
              total_estimated_time: Math.round((optimization.ambulance_eta + reroute.new_eta_minutes) * 10) / 10
            });
          }
          setIsRerouting(false);
          setCurrentStep(10);
        }, 1200);
      }
    },
    {
      step: 9,
      title: 'Disruption Detected & Recalculating',
      desc: 'LifeLine dynamically detects compromised corridor and queries alternative Mapbox trajectories.',
      actionLabel: 'Analyzing Alternatives',
      action: async () => {}
    },
    {
      step: 10,
      title: 'Dynamic Reroute Execution',
      desc: 'Selects safest alternative (Route C, ETA 10m). Logs route event and updates tactical telemetry in real-time.',
      actionLabel: 'Inspect Reroute Result',
      action: async () => {}
    },
    {
      step: 11,
      title: 'Complete Transparent Decision Chain',
      desc: 'Hero demonstration complete: Emergency → AI Severity → Ambulance Match → Hospital Match → Route Risk → Dynamic Reroute → Appropriate Care.',
      actionLabel: 'Finish & Inspect Overview',
      action: async () => {}
    }
  ];

  useEffect(() => {
    // Initial load
    demoSteps[0].action();
  }, []);

  const activeStepObj = demoSteps[currentStep - 1];

  const handleNext = async () => {
    if (currentStep < demoSteps.length) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      await demoSteps[nextStep - 1].action();
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <Header />

      <main className="flex-1 p-4 lg:p-6 max-w-[1700px] w-full mx-auto space-y-6">
        {/* Banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-cyan-400 animate-ping"></span>
              <h1 className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight">
                DEMO SANDBOX & HERO WALKTHROUGH
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Step-by-step interactive 11-stage judge demo runner with live simulation controls
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-400">Step {currentStep} of {demoSteps.length}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrev}
                disabled={currentStep === 1}
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 disabled:opacity-40 text-zinc-300"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={handleNext}
                disabled={currentStep === demoSteps.length}
                className="p-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Step Progress Bar */}
        <div className="grid grid-cols-11 gap-1 bg-zinc-900/60 p-2 rounded-xl border border-zinc-800 overflow-x-auto">
          {demoSteps.map((s) => (
            <button
              key={s.step}
              onClick={async () => {
                setCurrentStep(s.step);
                await s.action();
              }}
              className={`py-1.5 px-2 rounded text-[10px] font-mono font-bold transition-all text-center ${
                s.step === currentStep
                  ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                  : s.step < currentStep
                  ? 'bg-zinc-800 text-zinc-300'
                  : 'bg-zinc-950 text-zinc-600'
              }`}
            >
              #{s.step}
            </button>
          ))}
        </div>

        {/* Dynamic Alert Banner */}
        <RouteAlertBanner
          isRerouting={isRerouting}
          rerouteResult={rerouteResult}
          onDismiss={() => setRerouteResult(null)}
        />

        {/* Hero Interactive Split Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Step Details & Interactive Triggers (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-cyan-400 uppercase tracking-widest">
                  STAGE {activeStepObj.step} OF 11
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300">
                  Interactive Demo
                </span>
              </div>

              <h2 className="text-lg font-bold text-white tracking-tight">
                {activeStepObj.title}
              </h2>

              <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800/80">
                {activeStepObj.desc}
              </p>

              {/* Action Trigger Button */}
              <button
                onClick={activeStepObj.action}
                disabled={loading || isRerouting}
                className="w-full py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-bold font-mono text-xs uppercase tracking-wider transition-all shadow-lg shadow-cyan-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading || isRerouting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                <span>{activeStepObj.actionLabel}</span>
              </button>

              {/* Step Key Metrics Summary */}
              {optimization && (
                <div className="pt-3 border-t border-zinc-800 grid grid-cols-3 gap-2 text-center text-xs font-mono">
                  <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                    <div className="text-[10px] text-zinc-500">AMBULANCE</div>
                    <div className="text-cyan-400 font-bold">{optimization.selected_ambulance.vehicle_number}</div>
                    <div className="text-[10px] text-zinc-400">{optimization.ambulance_eta}m ETA</div>
                  </div>
                  <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                    <div className="text-[10px] text-zinc-500">HOSPITAL</div>
                    <div className="text-emerald-400 font-bold line-clamp-1">{optimization.selected_hospital.name}</div>
                    <div className="text-[10px] text-zinc-400">{optimization.travel_eta}m ETA</div>
                  </div>
                  <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                    <div className="text-[10px] text-zinc-500">GOLDEN MINUTE</div>
                    <div className="text-amber-400 font-bold">{optimization.total_estimated_time} MIN</div>
                    <div className="text-[10px] text-zinc-400">Total Care</div>
                  </div>
                </div>
              )}
            </div>

            {/* Decision Chain Visualizer */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl text-xs space-y-2 font-mono">
              <div className="text-zinc-400 font-bold uppercase text-[11px] mb-1">
                Optimized Decision Chain:
              </div>
              <div className="space-y-1.5 text-zinc-300 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="text-red-400">① Emergency:</span>
                  <span>Critical Road Accident (3 Patients, 1 Critical)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">② Ambulance:</span>
                  <span>A-102 (Advanced ALS, 6m)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">③ Hospital:</span>
                  <span>City Trauma Center (Trauma Capable + ICU)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-400">④ Route:</span>
                  <span>{optimization?.selected_route?.name || 'Route B'} ({optimization?.travel_eta || 10}m)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-amber-400">⑤ Total Care:</span>
                  <span>~{optimization?.total_estimated_time || 16} Min (Golden Minute Minimized)</span>
                </div>
              </div>
            </div>

            {/* Green Wave Corridor Simulation widget */}
            <GreenCorridorSim />
          </div>

          {/* Right: Tactical Map Simulation View (7 cols) */}
          <div className="lg:col-span-7 h-[580px] w-full">
            <MapboxMap
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
