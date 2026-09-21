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
  EmergencyDispatcherState,
  EmergencyStatus,
  DataSourceStatusResponse,
  LocationSearchResult,
  AnalyticsMetrics,
  AnalyticsHotspot,
  EmergencyAuditEvent,
  Driver
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
  SlidersHorizontal,
  BarChart3,
  Clock,
  ShieldCheck,
  Search,
  Filter,
  Users,
  Truck,
  Building2,
  TrendingDown,
  TrendingUp,
  MapPin,
  FileText
} from 'lucide-react';

export const OperationsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'COMMAND_CENTER' | 'ANALYTICS_AUDIT' | 'FLEET'>('COMMAND_CENTER');
  const [appMode, setAppMode] = useState<'LIVE' | 'DEMO'>('DEMO');
  const [loading, setLoading] = useState(true);
  const [emergency, setEmergency] = useState<Emergency | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LocationSearchResult | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [explanation, setExplanation] = useState<DecisionExplanation | null>(null);
  const [incidents, setIncidents] = useState<RoadIncident[]>([]);
  const [allAmbulances, setAllAmbulances] = useState<Ambulance[]>([]);
  const [allHospitals, setAllHospitals] = useState<Hospital[]>([]);
  const [allDrivers, setAllDrivers] = useState<Driver[]>([]);
  const [dataStatus, setDataStatus] = useState<DataSourceStatusResponse | null>(null);

  // Analytics & Audit State
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);
  const [hotspots, setHotspots] = useState<AnalyticsHotspot[]>([]);
  const [auditLogs, setAuditLogs] = useState<EmergencyAuditEvent[]>([]);
  const [auditFilter, setAuditFilter] = useState<string>('');
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

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

      try {
        const ds = await lifelineApi.getDataSourcesStatus();
        setDataStatus(ds);
      } catch (e) {
        console.warn('Failed to fetch data status:', e);
      }

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

      const [incList, ambList, hospList, drvList] = await Promise.all([
        lifelineApi.getRoadIncidents(),
        lifelineApi.listAmbulances(),
        lifelineApi.listHospitals(),
        lifelineApi.listDrivers().catch(() => [])
      ]);

      setIncidents(incList);
      setAllAmbulances(ambList);
      setAllHospitals(hospList);
      setAllDrivers(drvList);
      setLifecycleState('PLAN_READY');
    } catch (err) {
      console.error('Failed to load operations data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalyticsData = async () => {
    setIsLoadingAnalytics(true);
    try {
      const [m, h, logs] = await Promise.all([
        lifelineApi.getAnalyticsMetrics(),
        lifelineApi.getAnalyticsHotspots(),
        lifelineApi.getAuditLog({ limit: 40 })
      ]);
      setMetrics(m);
      setHotspots(h);
      setAuditLogs(logs);
    } catch (e) {
      console.warn('Analytics fetch error:', e);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    loadOperationsData();
  }, []);

  useEffect(() => {
    if (activeTab === 'ANALYTICS_AUDIT') {
      loadAnalyticsData();
    }
  }, [activeTab]);

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

      // Trigger dispatch alert
      if (opt.selected_ambulance) {
        await lifelineApi.alertDrivers(createdEmg.id, [opt.selected_ambulance.ambulance_id]).catch(() => {});
      }

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
          `Primary corridor congested. Emergency Priority Corridor engaged: Switched to ${reroute.new_route?.name || 'Alternative Corridor'} (ETA ${reroute.new_eta_minutes.toFixed(0)} min).`
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

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (!auditFilter.trim()) return true;
    const q = auditFilter.toLowerCase();
    return (
      log.event_type.toLowerCase().includes(q) ||
      log.description.toLowerCase().includes(q) ||
      log.emergency_id.toLowerCase().includes(q) ||
      log.actor_type.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 flex flex-col font-sans">
      {/* Operations Sub-Navigation Bar */}
      <div className="border-b border-zinc-800 bg-zinc-950/80 px-4 lg:px-6 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3 max-w-[1700px] mx-auto w-full">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span>Operations Command Workspace</span>
            </span>
          </div>

          {/* Center Tabs: Command Center vs Analytics vs Fleet */}
          <div className="flex items-center bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs font-mono">
            <button
              onClick={() => setActiveTab('COMMAND_CENTER')}
              className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'COMMAND_CENTER' ? 'bg-cyan-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Cpu className="h-3.5 w-3.5" />
              <span>COMMAND CENTER</span>
            </button>
            <button
              onClick={() => setActiveTab('ANALYTICS_AUDIT')}
              className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'ANALYTICS_AUDIT' ? 'bg-purple-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>ANALYTICS & AUDIT</span>
            </button>
            <button
              onClick={() => setActiveTab('FLEET')}
              className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'FLEET' ? 'bg-emerald-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Truck className="h-3.5 w-3.5" />
              <span>FLEET ({allAmbulances.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs font-mono">
              <button
                onClick={() => setAppMode('LIVE')}
                className={`px-3 py-1 rounded font-bold transition-all ${
                  appMode === 'LIVE' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                LIVE
              </button>
              <button
                onClick={() => setAppMode('DEMO')}
                className={`px-3 py-1 rounded font-bold transition-all ${
                  appMode === 'DEMO' ? 'bg-amber-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                DEMO
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
      </div>

      <main className="flex-1 p-3 sm:p-4 lg:p-6 max-w-[1700px] w-full mx-auto space-y-4">
        {/* ========================================================================= */}
        {/* TAB 1: COMMAND CENTER */}
        {/* ========================================================================= */}
        {activeTab === 'COMMAND_CENTER' && (
          <div className="space-y-4 animate-fadeIn">
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
              confidence={optimization?.confidence}
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
                  Triangulated Capability &amp; Live Traffic Aware
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
                      DECISION TRANSPARENCY &amp; AUDIT TRAIL
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
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: OPERATIONAL ANALYTICS & IMMUTABLE AUDIT LOG */}
        {/* ========================================================================= */}
        {activeTab === 'ANALYTICS_AUDIT' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Header & Refresh */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-purple-400" />
                  <span>Durable Operational Analytics &amp; Immutable Audit Trail</span>
                </h2>
                <p className="text-xs text-zinc-400 font-mono">
                  Calculated from permanent PostgreSQL event transactions · Zero fabricated claims
                </p>
              </div>
              <button
                onClick={loadAnalyticsData}
                disabled={isLoadingAnalytics}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-300 hover:text-white"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingAnalytics ? 'animate-spin' : ''}`} />
                <span>Refresh KPIs</span>
              </button>
            </div>

            {/* KPI Metric Cards */}
            {metrics ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase">Avg Response Time</span>
                  <div className="text-2xl font-black text-amber-400 font-mono">
                    {metrics.avg_ambulance_response_time_minutes.toFixed(1)} <span className="text-xs text-zinc-400">min</span>
                  </div>
                  <div className="text-[10px] text-zinc-500">Dispatch to Scene Arrival</div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase">Driver Acceptance Rate</span>
                  <div className="text-2xl font-black text-emerald-400 font-mono">
                    {metrics.driver_acceptance_rate_percent.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-zinc-500">First-attempt alerts won</div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase">Avg Acceptance Speed</span>
                  <div className="text-2xl font-black text-cyan-400 font-mono">
                    {metrics.avg_driver_acceptance_time_seconds.toFixed(0)} <span className="text-xs text-zinc-400">sec</span>
                  </div>
                  <div className="text-[10px] text-zinc-500">Alert chime to Accept tap</div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase">Corridor Time Saved</span>
                  <div className="text-2xl font-black text-purple-400 font-mono">
                    ~{metrics.corridor_time_saved_avg_minutes.toFixed(1)} <span className="text-xs text-zinc-400">min</span>
                  </div>
                  <div className="text-[10px] text-zinc-500">Live Traffic Rerouting</div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase">Active Fleet Units</span>
                  <div className="text-2xl font-black text-white font-mono">
                    {metrics.fleet_active_count} / {metrics.fleet_total_count}
                  </div>
                  <div className="text-[10px] text-zinc-500">Utilization: {metrics.fleet_utilization_percent.toFixed(0)}%</div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase">GPS Freshness Pool</span>
                  <div className="text-2xl font-black text-emerald-400 font-mono">
                    {metrics.gps_freshness_percent.toFixed(0)}%
                  </div>
                  <div className="text-[10px] text-zinc-500">Telemetry &lt; 60s latency</div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase">Total Emergencies</span>
                  <div className="text-2xl font-black text-white font-mono">
                    {metrics.total_emergencies}
                  </div>
                  <div className="text-[10px] text-zinc-500">{metrics.active_emergencies} currently active</div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase">No-Ambulance Rate</span>
                  <div className="text-2xl font-black text-rose-400 font-mono">
                    {metrics.no_ambulance_rate_percent.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-zinc-500">Honest out-of-range cases</div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-zinc-500 font-mono text-xs">Loading analytics...</div>
            )}

            {/* Spatial Hotspots & Demand Clusters */}
            {hotspots.length > 0 && (
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono font-bold text-white uppercase flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-cyan-400" />
                    <span>Emergency Spatial Clusters (Hotspots)</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">Top demand areas in Chennai zone</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {hotspots.map((hs, i) => (
                    <div key={i} className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-between text-xs font-mono">
                      <div>
                        <div className="font-bold text-white">{hs.location_label || `Cluster #${i + 1}`}</div>
                        <div className="text-[10px] text-zinc-500">{hs.latitude.toFixed(3)}, {hs.longitude.toFixed(3)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-amber-400">{hs.incident_count} Incidents</div>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-950 text-red-300 border border-red-500/40 font-bold">
                          {hs.primary_severity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Searchable Immutable Audit Log Table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-mono font-bold text-white uppercase">
                    Immutable PostgreSQL Audit Log
                  </span>
                  <span className="text-[10px] font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-400">
                    {filteredAuditLogs.length} Events
                  </span>
                </div>

                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    value={auditFilter}
                    onChange={(e) => setAuditFilter(e.target.value)}
                    placeholder="Filter by event, actor, ID..."
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400 pr-8 font-mono"
                  />
                  <Search className="h-3.5 w-3.5 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono divide-y divide-zinc-800">
                  <thead>
                    <tr className="text-[10px] text-zinc-500 uppercase bg-zinc-950/60">
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Event Type</th>
                      <th className="py-2.5 px-3">Actor</th>
                      <th className="py-2.5 px-3">Emergency ID</th>
                      <th className="py-2.5 px-3">Description &amp; Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredAuditLogs.length > 0 ? (
                      filteredAuditLogs.map((log) => {
                        let badgeColor = 'bg-zinc-800 text-zinc-300';
                        if (log.event_type.includes('ACCEPTED') || log.event_type.includes('COMPLETED')) badgeColor = 'bg-emerald-950 text-emerald-300 border-emerald-500/40 border';
                        else if (log.event_type.includes('DECLINED') || log.event_type.includes('CANCELLED')) badgeColor = 'bg-red-950 text-red-300 border-red-500/40 border';
                        else if (log.event_type.includes('ALERTED') || log.event_type.includes('REROUTE')) badgeColor = 'bg-amber-950 text-amber-300 border-amber-500/40 border';
                        else if (log.event_type.includes('CREATED')) badgeColor = 'bg-cyan-950 text-cyan-300 border-cyan-500/40 border';

                        return (
                          <tr key={log.id} className="hover:bg-zinc-950/40 transition-colors">
                            <td className="py-2.5 px-3 text-zinc-400 text-[11px] whitespace-nowrap">
                              {new Date(log.created_at).toLocaleTimeString()}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeColor}`}>
                                {log.event_type}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-zinc-300 text-[11px]">
                              {log.actor_type} {log.actor_id ? `(${log.actor_id.slice(0, 8)})` : ''}
                            </td>
                            <td className="py-2.5 px-3 text-cyan-400 text-[11px]">
                              {log.emergency_id.slice(0, 10)}
                            </td>
                            <td className="py-2.5 px-3 text-zinc-300 text-[11px]">
                              {log.description}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-zinc-500">
                          No audit events matching query.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: FLEET & DRIVERS MANAGEMENT */}
        {/* ========================================================================= */}
        {activeTab === 'FLEET' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                  <Truck className="h-5 w-5 text-emerald-400" />
                  <span>Registered Ambulance Fleet &amp; Authorized Drivers</span>
                </h2>
                <p className="text-xs text-zinc-400 font-mono">
                  Only verified, live-connected ambulances are eligible for algorithmic dispatch
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allAmbulances.map((amb) => {
                const linkedDriver = allDrivers.find((d) => d.assigned_ambulance_id === amb.id || d.assigned_ambulance_id === amb.vehicle_number);
                return (
                  <div key={amb.id} className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-black text-lg">
                          🚑
                        </div>
                        <div>
                          <div className="font-bold text-sm text-white">{amb.vehicle_number}</div>
                          <div className="text-xs font-mono text-zinc-400">ID: {amb.id} • {amb.capability}</div>
                        </div>
                      </div>

                      <span
                        className={`text-xs px-2.5 py-1 rounded-full border font-mono font-bold ${
                          amb.status === 'AVAILABLE'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                            : amb.status === 'EN_ROUTE'
                            ? 'bg-amber-950 text-amber-300 border-amber-500/50'
                            : 'bg-zinc-950 text-zinc-500 border-zinc-800'
                        }`}
                      >
                        {amb.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-zinc-800">
                      <div>
                        <span className="text-zinc-500 block text-[10px]">CURRENT DRIVER</span>
                        <span className="text-zinc-200">{linkedDriver?.name || 'Unassigned'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px]">EQUIPMENT POOL</span>
                        <span className="text-cyan-400">{amb.equipment?.length || 0} Critical Items</span>
                      </div>
                    </div>
                  </div>
                );
              })}
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
