import React, { useEffect, useState, useCallback } from 'react';
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
import { Header } from '../components/Header';
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
  AlertCircle,
  RefreshCw,
  Zap,
  ShieldAlert,
  Cpu,
  HelpCircle,
  CheckCircle2,
  Navigation,
  Activity,
  Radio,
  ArrowRight,
  SlidersHorizontal,
  Flame
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [appMode, setAppMode] = useState<'LIVE' | 'DEMO'>('LIVE');
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
  const [lifecycleState, setLifecycleState] = useState<EmergencyStatus>('INTAKE');

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

  // Load baseline infrastructure (hospitals, ambulances, incidents, provenance)
  const loadBaselineInfrastructure = async () => {
    try {
      setLoading(true);

      // Fetch data sources status
      try {
        const ds = await lifelineApi.getDataSourcesStatus();
        setDataStatus(ds);
      } catch (e) {
        console.warn('Failed to fetch data status:', e);
      }

      // Fetch road incidents, ambulances, hospitals
      const [incList, ambList, hospList] = await Promise.all([
        lifelineApi.getRoadIncidents(),
        lifelineApi.listAmbulances(),
        lifelineApi.listHospitals()
      ]);

      setIncidents(incList);
      setAllAmbulances(ambList);
      setAllHospitals(hospList);
    } catch (err) {
      console.error('Failed to load infrastructure data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBaselineInfrastructure();
  }, []);

  // Handle Dispatcher Action: [ FIND BEST RESPONSE ] (Only executes upon user click after intake)
  const handleStartResponseFromAi = async (state: EmergencyDispatcherState) => {
    try {
      setIsAnalyzing(true);
      setLifecycleState('ANALYZING');

      const targetLat = currentLocation?.latitude || state.latitude || 13.0380;
      const targetLon = currentLocation?.longitude || state.longitude || 80.2300;

      // 1. Create real emergency record with verified parameters
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

      // 2. Parallel optimization
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

  // Load Preset Accident Demo Scenario
  const handleLoadDemoScenario = async () => {
    try {
      setIsResetting(true);
      setAppMode('DEMO');
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

        const incList = await lifelineApi.getRoadIncidents();
        setIncidents(incList);

        setLifecycleState('PLAN_READY');
      }
    } catch (err) {
      console.error('Failed to load demo scenario:', err);
    } finally {
      setIsResetting(false);
    }
  };

  // Handle Simulate Blockage Hero Action (in Demo or Active mode)
  const handleSimulateBlockage = async () => {
    if (!emergency) return;
    try {
      setIsSimulatingBlockage(true);
      setIsRerouting(true);
      setLifecycleState('REROUTING');

      // 1. Inject a critical blockage near the current route corridor
      await lifelineApi.blockRouteDemo({
        latitude: emergency.latitude - 0.005,
        longitude: emergency.longitude - 0.008
      });

      // 2. Refresh active incidents
      const updatedIncidents = await lifelineApi.getRoadIncidents();
      setIncidents(updatedIncidents);

      // 3. Dynamic Rerouting calculation
      setTimeout(async () => {
        const reroute = await lifelineApi.triggerReroute(emergency.id);
        setRerouteResult(reroute);
        setIsRerouting(false);
        setIsSimulatingBlockage(false);

        // Notify AI Dispatcher Console
        setRerouteNotification(
          `Primary corridor became congested/blocked. Dynamic Reroute engaged: Switched to ${reroute.new_route?.name || 'Alternative Corridor'} (ETA ${reroute.new_eta_minutes.toFixed(0)} min).`
        );

        // Update active route in optimization state
        if (reroute.new_route && optimization) {
          setOptimization({
            ...optimization,
            selected_route: reroute.new_route,
            travel_eta: reroute.new_eta_minutes,
            total_estimated_time: roundTo1(optimization.ambulance_eta + reroute.new_eta_minutes)
          });
        }

        // Refresh explanations
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

  const roundTo1 = (num: number) => Math.round(num * 10) / 10;

  // Handle Reset Environment
  const handleResetEnvironment = async () => {
    try {
      setIsResetting(true);
      setRerouteResult(null);
      setRerouteNotification(null);
      setEmergency(null);
      setOptimization(null);
      setExplanation(null);
      setCurrentLocation(null);
      setLifecycleState('INTAKE');
      setAppMode('LIVE');
      await lifelineApi.resetDemo();
      await loadBaselineInfrastructure();
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
      <Header onResetDemo={handleResetEnvironment} isResetting={isResetting} />

      <main className="flex-1 p-3 sm:p-4 lg:p-6 max-w-[1700px] w-full mx-auto space-y-4">
        {/* Mode Selector & Status Header Bar */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs font-mono">
              <button
                onClick={() => {
                  setAppMode('LIVE');
                  if (emergency?.id.includes('demo')) {
                    setEmergency(null);
                    setOptimization(null);
                    setLifecycleState('INTAKE');
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded font-bold transition-all ${
                  appMode === 'LIVE'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>LIVE INTAKE</span>
              </button>

              <button
                onClick={handleLoadDemoScenario}
                className={`flex items-center gap-1.5 px-3 py-1 rounded font-bold transition-all ${
                  appMode === 'DEMO'
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Flame className="h-3.5 w-3.5" />
                <span>DEMO SIMULATION</span>
              </button>
            </div>

            <div className="text-xs font-mono text-zinc-400 hidden sm:flex items-center gap-2">
              <span className="text-zinc-600">|</span>
              {appMode === 'LIVE' ? (
                <span className="text-zinc-300">
                  {emergency ? `Active Incident: #${emergency.id.slice(0, 8)}` : 'System Standby • No active emergency created'}
                </span>
              ) : (
                <span className="text-amber-400 font-bold">
                  Demo Sandbox Active (Chromepet Scenario)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {appMode === 'LIVE' && !emergency && (
              <button
                onClick={handleLoadDemoScenario}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-950/60 hover:bg-amber-900 border border-amber-500/40 text-amber-400 font-mono text-xs font-bold transition-all"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>[ LOAD DEMO ACCIDENT SCENARIO ]</span>
              </button>
            )}

            <button
              onClick={handleResetEnvironment}
              disabled={isResetting}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-xs font-bold transition-all"
            >
              <RefreshCw className={`h-3 w-3 ${isResetting ? 'animate-spin' : ''}`} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Dynamic Route Alert Banner if triggered */}
        <RouteAlertBanner
          isRerouting={isRerouting}
          rerouteResult={rerouteResult}
          onDismiss={() => setRerouteResult(null)}
        />

        {/* TOP SECTION: Golden Minute Timeline Hero Counter */}
        <GoldenMinuteCounter
          totalMinutes={optimization?.total_estimated_time || 0}
          ambulanceEta={optimization?.ambulance_eta || 0}
          travelEta={optimization?.travel_eta || 0}
          confidence={optimization?.confidence || optimization?.confidence_breakdown}
          onSimulateBlockage={handleSimulateBlockage}
          isSimulatingBlockage={isSimulatingBlockage || isRerouting}
          isActive={Boolean(optimization)}
        />

        {/* Emergency Lifecycle State Tracker */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between overflow-x-auto text-[10px] font-mono">
          <div className="flex items-center gap-1.5 shrink-0 text-zinc-400 font-bold mr-2">
            <Activity className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
            <span>INCIDENT LIFECYCLE:</span>
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
                  {i < stateSteps.length - 1 && (
                    <span className="text-zinc-700">→</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* CENTER SECTION: Tactical Live Map (7 Cols) + AI Dispatcher Console (5 Cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Tactical Live Map */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            <div className="h-[480px] sm:h-[560px] w-full">
              <TacticalMap
                emergency={emergency}
                currentLocation={currentLocation}
                onLocationAcquired={(loc) => {
                  setCurrentLocation(loc);
                }}
                selectedAmbulance={optimization?.selected_ambulance}
                selectedHospital={optimization?.selected_hospital}
                selectedRoute={optimization?.selected_route}
                alternativeRoutes={optimization?.alternative_routes}
                incidents={incidents}
                allAmbulances={allAmbulances}
                allHospitals={allHospitals}
                onSelectRoute={(r) => {
                  if (optimization) {
                    setOptimization({
                      ...optimization,
                      selected_route: r,
                      travel_eta: r.adjusted_eta_minutes,
                      total_estimated_time: roundTo1(optimization.ambulance_eta + r.adjusted_eta_minutes)
                    });
                  }
                }}
                className="h-full w-full"
              />
            </div>

            {/* Green Wave Traffic Corridor Simulation */}
            <GreenCorridorSim />
          </div>

          {/* Right Column: LIFELINE DISPATCH AI Console */}
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

        {/* BOTTOM SECTION 1: Active Response Plan (Ambulance, Hospital, Route) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400 font-bold px-1">
            <span className="flex items-center gap-1.5 uppercase">
              <Zap className="h-3.5 w-3.5 text-amber-400" /> RECOMMENDED RESPONSE PLAN
            </span>
            <span className="text-[10px] text-zinc-500 font-normal">
              {optimization ? 'Triangulated Capability & Live Traffic Aware' : 'Awaiting Incident Dispatch'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Ambulance Panel */}
            <AmbulancePanel
              ambulance={optimization?.selected_ambulance || null}
              onWhyClick={() => openDecisionModal('ambulance')}
            />

            {/* Hospital Panel */}
            <HospitalPanel
              hospital={optimization?.selected_hospital || null}
              onWhyClick={() => openDecisionModal('hospital')}
            />

            {/* Route Panel */}
            <RoutePanel
              route={optimization?.selected_route || null}
              alternativeRoutes={optimization?.alternative_routes}
              onSelectRoute={(newR) => {
                if (optimization) {
                  setOptimization({
                    ...optimization,
                    selected_route: newR,
                    travel_eta: newR.adjusted_eta_minutes,
                    total_estimated_time: roundTo1(optimization.ambulance_eta + newR.adjusted_eta_minutes)
                  });
                }
              }}
              onWhyClick={() => openDecisionModal('route')}
            />
          </div>
        </div>

        {/* BOTTOM SECTION 2: Decision Transparency ("Why this decision?") */}
        {explanation && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 shadow-xl space-y-2.5 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wide">
                  DECISION TRANSPARENCY & RATIONALE
                </span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                Deterministic Optimization + Provenance Audited
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/70">
                <div className="text-[10px] font-mono font-bold text-cyan-400 uppercase mb-1">
                  🚑 WHY THIS AMBULANCE?
                </div>
                <p className="text-zinc-300 leading-relaxed text-[11px]">
                  {explanation.ambulance_reason}
                </p>
              </div>

              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/70">
                <div className="text-[10px] font-mono font-bold text-emerald-400 uppercase mb-1">
                  🏥 WHY THIS HOSPITAL?
                </div>
                <p className="text-zinc-300 leading-relaxed text-[11px]">
                  {explanation.hospital_reason}
                </p>
              </div>

              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/70">
                <div className="text-[10px] font-mono font-bold text-blue-400 uppercase mb-1">
                  🛣 WHY THIS ROUTE?
                </div>
                <p className="text-zinc-300 leading-relaxed text-[11px]">
                  {explanation.route_reason}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM SECTION 3: Data Sources Provenance Audit Footer */}
        <DataProvenanceFooter statusData={dataStatus} />
      </main>

      {/* Decision Modal */}
      <DecisionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        explanation={explanation}
        targetCategory={modalCategory}
      />
    </div>
  );
};
