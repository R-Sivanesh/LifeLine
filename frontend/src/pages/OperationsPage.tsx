import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lifelineApi } from '../services/api';
import {
  Emergency,
  OptimizationResult,
  DecisionExplanation,
  RerouteResult,
  RoadIncident,
  Ambulance,
  Hospital,
  RouteOption,
  EmergencyDispatcherState,
  EmergencyStatus,
  DataSourceStatusResponse,
  LocationSearchResult
} from '../types';
import { TacticalMap } from '../components/TacticalMap';
import { AiDispatcherConsole } from '../components/AiDispatcherConsole';
import { AmbulancePanel } from '../components/AmbulancePanel';
import { HospitalPanel } from '../components/HospitalPanel';
import { RoutePanel } from '../components/RoutePanel';
import { GoldenMinuteCounter } from '../components/GoldenMinuteCounter';
import { DecisionModal } from '../components/DecisionModal';
import { RouteAlertBanner } from '../components/RouteAlertBanner';
import { GreenCorridorSim } from '../components/GreenCorridorSim';
import { DataProvenanceFooter } from '../components/DataProvenanceFooter';
import {
  Activity,
  RefreshCw,
  Zap,
  ShieldAlert,
  Cpu,
  HelpCircle,
  CheckCircle2,
  Navigation,
  Radio,
  ArrowRight,
  Flame,
  ArrowLeft,
  SlidersHorizontal
} from 'lucide-react';

export const OperationsPage: React.FC = () => {
  const [appMode, setAppMode] = useState<'LIVE' | 'DEMO'>('DEMO');
  const [loading, setLoading] = useState(true);
  const [emergency, setEmergency] = useState<Emergency | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LocationSearchResult | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [explanation, setExplanation] = useState<DecisionExplanation | null>(null);
  const [incidents, setIncidents] = useState<RoadIncident[]>([]);
  const [allAmbulances, setAllAmbulances] = useState<Ambulance[]>([]);
  const [allHospitals, setAllHospitals] = useState<Hospital[]>([]);
  const [dataStatus, setDataStatus] = useState<DataSourceStatusResponse | null>(null);

  // Emergency Lifecycle State Machine
  const [lifecycleState, setLifecycleState] = useState<EmergencyStatus>('PLAN_READY');

  // Simulation & Reroute state
  const [isRerouting, setIsRerouting] = useState(false);
  const [rerouteResult, setRerouteResult] = useState<RerouteResult | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isSimulatingBlockage, setIsSimulatingBlockage] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [rerouteNotification, setRerouteNotification] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState<'ambulance' | 'hospital' | 'route' | 'all'>('all');

  // Load Baseline Data & Demo Scenario on Initial Mount
  const loadOperationsData = async () => {
    try {
      setLoading(true);

      // Fetch data sources status
      try {
        const ds = await lifelineApi.getDataSourcesStatus();
        setDataStatus(ds);
      } catch (e) {
        console.warn('Failed to fetch data status:', e);
      }

      // Seed & Fetch Demo Scenario
      await lifelineApi.seedDemo();
      const emgList = await lifelineApi.listEmergencies();
      if (emgList.length > 0) {
        const demoEmg = emgList[0];
        setEmergency(demoEmg);
        setCurrentLocation({
          formatted_address: 'Chromepet Railway Bridge Corridor, Chennai',
          latitude: demoEmg.latitude,
          longitude: demoEmg.longitude,
          source: 'DEMO',
          place_name: 'Chromepet Demo Scene'
        });

        const opt = await lifelineApi.optimizeEmergency(demoEmg.id);
        setOptimization(opt);

        const exp = await lifelineApi.getDecisionExplanation(demoEmg.id);
        setExplanation(exp);
      }

      const [incList, ambList, hospList] = await Promise.all([
        lifelineApi.getRoadIncidents(),
        lifelineApi.listAmbulances(),
        lifelineApi.listHospitals()
      ]);

      setIncidents(incList);
      setAllAmbulances(ambList);
      setAllHospitals(hospList);
      setLifecycleState('PLAN_READY');
    } catch (err) {
      console.error('Failed to load operations data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOperationsData();
  }, []);

  // Handle Dispatcher Action: [ FIND BEST RESPONSE ]
  const handleStartResponseFromAi = async (state: EmergencyDispatcherState) => {
    try {
      setIsAnalyzing(true);
      setLifecycleState('ANALYZING');

      const targetLat = currentLocation?.latitude || state.latitude || 13.0380;
      const targetLon = currentLocation?.longitude || state.longitude || 80.2300;

      const createdEmg = await lifelineApi.createEmergency({
        description: state.location_description
          ? `${(state.incident_type || 'EMERGENCY').replace('_', ' ')}: ${state.location_description}`
          : 'Emergency intake verified by dispatcher AI.',
        latitude: targetLat,
        longitude: targetLon,
        patient_count: state.patient_count || 1,
        critical_patient_count: state.critical_patient_count || 0,
        severity: state.severity || 'MEDIUM',
        incident_type: state.incident_type || 'ROAD_ACCIDENT'
      });

      setEmergency(createdEmg);

      const opt = await lifelineApi.optimizeEmergency(createdEmg.id);
      setOptimization(opt);

      const exp = await lifelineApi.getDecisionExplanation(createdEmg.id);
      setExplanation(exp);

      setLifecycleState('DISPATCHED');
    } catch (err) {
      console.error('Failed to process AI dispatch:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle Simulate Blockage Action
  const handleSimulateBlockage = async () => {
    if (!emergency) return;
    try {
      setIsSimulatingBlockage(true);
      setIsRerouting(true);
      setLifecycleState('REROUTING');

      await lifelineApi.blockRouteDemo({
        latitude: emergency.latitude - 0.005,
        longitude: emergency.longitude - 0.008
      });

      const updatedIncidents = await lifelineApi.getRoadIncidents();
      setIncidents(updatedIncidents);

      setTimeout(async () => {
        const reroute = await lifelineApi.triggerReroute(emergency.id);
        setRerouteResult(reroute);
        setIsRerouting(false);
        setIsSimulatingBlockage(false);

        setRerouteNotification(
          `Primary corridor became congested/blocked. Dynamic Reroute engaged: Switched to ${reroute.new_route?.name || 'Alternative Corridor'} (ETA ${reroute.new_eta_minutes.toFixed(0)} min).`
        );

        if (reroute.new_route && optimization) {
          setOptimization({
            ...optimization,
            selected_route: reroute.new_route,
            travel_eta: reroute.new_eta_minutes,
            total_estimated_time: Math.round((optimization.ambulance_eta + reroute.new_eta_minutes) * 10) / 10
          });
        }

        const updatedExp = await lifelineApi.getDecisionExplanation(emergency.id);
        setExplanation(updatedExp);
        setLifecycleState('EN_ROUTE');
      }, 1200);
    } catch (err) {
      console.error('Failed to simulate blockage:', err);
      setIsRerouting(false);
      setIsSimulatingBlockage(false);
    }
  };

  const handleResetEnvironment = async () => {
    try {
      setIsResetting(true);
      setRerouteResult(null);
      setRerouteNotification(null);
      await lifelineApi.resetDemo();
      await loadOperationsData();
    } catch (err) {
      console.error('Failed to reset environment:', err);
    } finally {
      setIsResetting(false);
    }
  };

  const openDecisionModal = (cat: 'ambulance' | 'hospital' | 'route' | 'all') => {
    setModalCategory(cat);
    setModalOpen(true);
  };

  const stateSteps: EmergencyStatus[] = [
    'INTAKE',
    'INFORMATION_SUFFICIENT',
    'ANALYZING',
    'PLAN_READY',
    'DISPATCHED',
    'EN_ROUTE',
    'REROUTING'
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Operations Navigation Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-md px-4 lg:px-6 py-3 sticky top-0 z-40">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 max-w-[1700px] mx-auto w-full">
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="relative h-8 w-8 rounded-full bg-zinc-950 border border-zinc-700/80 p-0.5 flex items-center justify-center shadow-lg shadow-red-500/10 group-hover:border-red-500/60 transition-all shrink-0">
                <img
                  src="/logo-clean.png"
                  alt="LifeLine Logo"
                  className="h-full w-full object-contain drop-shadow-[0_0_8px_rgba(239,68,68,0.35)]"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-white font-mono">LIFELINE</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-500/40">
                    OPERATIONS CENTER
                  </span>
                </div>
                <p className="text-[10px] text-zinc-400 font-mono">Telemetry & Tactical Dispatch Console</p>
              </div>
            </Link>

            <Link
              to="/"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold font-mono transition-all shadow-lg shadow-red-600/30"
            >
              <span>🚨 Public Emergency UI</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs font-mono">
              <button
                onClick={() => setAppMode('LIVE')}
                className={`px-3 py-1 rounded font-bold transition-all ${
                  appMode === 'LIVE' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                LIVE TELEMETRY
              </button>
              <button
                onClick={() => setAppMode('DEMO')}
                className={`px-3 py-1 rounded font-bold transition-all ${
                  appMode === 'DEMO' ? 'bg-amber-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                DEMO SIMULATION
              </button>
            </div>

            <button
              onClick={handleResetEnvironment}
              disabled={isResetting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-xs font-bold transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isResetting ? 'animate-spin' : ''}`} />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-4 lg:p-6 max-w-[1700px] w-full mx-auto space-y-4">
        {/* Dynamic Route Alert Banner */}
        <RouteAlertBanner
          isRerouting={isRerouting}
          rerouteResult={rerouteResult}
          onDismiss={() => setRerouteResult(null)}
        />

        {/* TOP SECTION: Golden Minute Timeline Hero */}
        <GoldenMinuteCounter
          totalMinutes={optimization?.total_estimated_time || 0}
          ambulanceEta={optimization?.ambulance_eta || 0}
          travelEta={optimization?.travel_eta || 0}
          confidence={optimization?.confidence || optimization?.confidence_breakdown}
          onSimulateBlockage={handleSimulateBlockage}
          isSimulatingBlockage={isSimulatingBlockage || isRerouting}
          isActive={Boolean(optimization)}
        />

        {/* Incident Lifecycle Step Bar */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between overflow-x-auto text-[10px] font-mono">
          <div className="flex items-center gap-1.5 shrink-0 text-zinc-400 font-bold mr-2">
            <Activity className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
            <span>OPERATIONAL LIFECYCLE:</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {stateSteps.map((st, i) => {
              const isCurrent = lifecycleState === st;
              const isPassed = stateSteps.indexOf(lifecycleState) >= i;
              return (
                <div key={st} className="flex items-center gap-1">
                  <span
                    className={`px-2 py-0.5 rounded font-bold transition-all ${
                      isCurrent
                        ? 'bg-red-600 text-white shadow-md shadow-red-600/40 border border-red-400'
                        : isPassed
                        ? 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                        : 'bg-zinc-950 text-zinc-600 border border-zinc-900'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </span>
                  {i < stateSteps.length - 1 && <span className="text-zinc-700">→</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* CENTER SECTION: Tactical Live Map + AI Dispatcher Console */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 flex flex-col space-y-4">
            <div className="h-[480px] sm:h-[560px] w-full">
              <TacticalMap
                emergency={emergency}
                currentLocation={currentLocation}
                onLocationAcquired={(loc) => setCurrentLocation(loc)}
                selectedAmbulance={optimization?.selected_ambulance}
                selectedHospital={optimization?.selected_hospital}
                selectedRoute={optimization?.selected_route}
                alternativeRoutes={optimization?.alternative_routes}
                incidents={incidents}
                allAmbulances={allAmbulances}
                allHospitals={allHospitals}
                className="h-full w-full"
              />
            </div>

            <GreenCorridorSim />
          </div>

          <div className="lg:col-span-5 flex flex-col space-y-4">
            <AiDispatcherConsole
              onStartResponse={handleStartResponseFromAi}
              isAnalyzing={isAnalyzing}
              currentLocation={currentLocation}
              activeSeverity={emergency?.severity || 'MEDIUM'}
              rerouteNotification={rerouteNotification}
              onClearRerouteNotification={() => setRerouteNotification(null)}
            />
          </div>
        </div>

        {/* BOTTOM SECTION 1: Active Response Plan */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400 font-bold px-1">
            <span className="flex items-center gap-1.5 uppercase">
              <Zap className="h-3.5 w-3.5 text-amber-400" /> RECOMMENDED RESPONSE CORRIDOR
            </span>
            <span className="text-[10px] text-zinc-500 font-normal">
              Triangulated Capability & Live Traffic Aware
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AmbulancePanel
              ambulance={optimization?.selected_ambulance || null}
              onWhyClick={() => openDecisionModal('ambulance')}
            />
            <HospitalPanel
              hospital={optimization?.selected_hospital || null}
              onWhyClick={() => openDecisionModal('hospital')}
            />
            <RoutePanel
              route={optimization?.selected_route || null}
              alternativeRoutes={optimization?.alternative_routes}
              onWhyClick={() => openDecisionModal('route')}
            />
          </div>
        </div>

        {/* BOTTOM SECTION 2: Decision Transparency */}
        {explanation && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 shadow-xl space-y-2.5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wide">
                  DECISION TRANSPARENCY & AUDIT TRAIL
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/70">
                <div className="text-[10px] font-mono font-bold text-cyan-400 uppercase mb-1">
                  🚑 WHY THIS AMBULANCE?
                </div>
                <p className="text-zinc-300 leading-relaxed text-[11px]">{explanation.ambulance_reason}</p>
              </div>

              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/70">
                <div className="text-[10px] font-mono font-bold text-emerald-400 uppercase mb-1">
                  🏥 WHY THIS HOSPITAL?
                </div>
                <p className="text-zinc-300 leading-relaxed text-[11px]">{explanation.hospital_reason}</p>
              </div>

              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/70">
                <div className="text-[10px] font-mono font-bold text-blue-400 uppercase mb-1">
                  🛣 WHY THIS ROUTE?
                </div>
                <p className="text-zinc-300 leading-relaxed text-[11px]">{explanation.route_reason}</p>
              </div>
            </div>
          </div>
        )}

        <DataProvenanceFooter statusData={dataStatus} />
      </main>

      <DecisionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        explanation={explanation}
        targetCategory={modalCategory}
      />
    </div>
  );
};
