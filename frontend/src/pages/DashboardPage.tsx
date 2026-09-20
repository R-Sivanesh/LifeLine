import React, { useEffect, useState } from 'react';
import { lifelineApi } from '../services/api';
import {
  Emergency,
  OptimizationResult,
  DecisionExplanation,
  RerouteResult,
  RoadIncident,
  Ambulance,
  Hospital,
  RouteOption
} from '../types';
import { Header } from '../components/Header';
import { MapboxMap } from '../components/MapboxMap';
import { EmergencyCard } from '../components/EmergencyCard';
import { AmbulancePanel } from '../components/AmbulancePanel';
import { HospitalPanel } from '../components/HospitalPanel';
import { RoutePanel } from '../components/RoutePanel';
import { GoldenMinuteCounter } from '../components/GoldenMinuteCounter';
import { DecisionModal } from '../components/DecisionModal';
import { RouteAlertBanner } from '../components/RouteAlertBanner';
import { GreenCorridorSim } from '../components/GreenCorridorSim';
import { AlertCircle, RefreshCw, Zap, ShieldAlert, Cpu } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [emergency, setEmergency] = useState<Emergency | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [explanation, setExplanation] = useState<DecisionExplanation | null>(null);
  const [incidents, setIncidents] = useState<RoadIncident[]>([]);
  const [allAmbulances, setAllAmbulances] = useState<Ambulance[]>([]);
  const [allHospitals, setAllHospitals] = useState<Hospital[]>([]);

  // Simulation & Reroute state
  const [isRerouting, setIsRerouting] = useState(false);
  const [rerouteResult, setRerouteResult] = useState<RerouteResult | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isSimulatingBlockage, setIsSimulatingBlockage] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState<'ambulance' | 'hospital' | 'route' | 'all'>('all');

  // Load initial active emergency and optimization plan
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // Fetch emergencies
      let emgList = await lifelineApi.listEmergencies();
      let activeEmg = emgList.length > 0 ? emgList[0] : null;

      if (!activeEmg) {
        // Create hero demo emergency if none exist
        activeEmg = await lifelineApi.createHeroEmergency();
      }

      setEmergency(activeEmg);

      // Fetch related optimization plan
      const opt = await lifelineApi.optimizeEmergency(activeEmg.id);
      setOptimization(opt);

      // Fetch decision explanation
      const exp = await lifelineApi.getDecisionExplanation(activeEmg.id);
      setExplanation(exp);

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
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Handle Simulate Blockage Hero Action
  const handleSimulateBlockage = async () => {
    if (!emergency) return;
    try {
      setIsSimulatingBlockage(true);
      setIsRerouting(true);

      // 1. Inject a critical blockage near the current route corridor
      await lifelineApi.blockRouteDemo({
        latitude: emergency.latitude - 0.005,
        longitude: emergency.longitude - 0.008
      });

      // 2. Refresh active incidents
      const updatedIncidents = await lifelineApi.getRoadIncidents();
      setIncidents(updatedIncidents);

      // Artificial 1.5s delay to show tactical "Recalculating..." telemetry
      setTimeout(async () => {
        const reroute = await lifelineApi.triggerReroute(emergency.id);
        setRerouteResult(reroute);
        setIsRerouting(false);
        setIsSimulatingBlockage(false);

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
      }, 1400);
    } catch (err) {
      console.error('Failed to simulate blockage:', err);
      setIsRerouting(false);
      setIsSimulatingBlockage(false);
    }
  };

  const roundTo1 = (num: number) => Math.round(num * 10) / 10;

  // Handle Reset Demo Environment
  const handleResetDemo = async () => {
    try {
      setIsResetting(true);
      setRerouteResult(null);
      await lifelineApi.resetDemo();
      await loadDashboardData();
    } catch (err) {
      console.error('Failed to reset demo:', err);
    } finally {
      setIsResetting(false);
    }
  };

  // Re-run AI Analysis
  const handleAnalyzeEmergency = async () => {
    if (!emergency) return;
    try {
      setIsAnalyzing(true);
      const analysis = await lifelineApi.analyzeEmergency(emergency.id);
      // Re-fetch emergency and optimization
      const updatedEmg = await lifelineApi.getEmergency(emergency.id);
      setEmergency(updatedEmg);
      const opt = await lifelineApi.optimizeEmergency(emergency.id);
      setOptimization(opt);
    } catch (err) {
      console.error('Failed to analyze:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const openDecisionModal = (cat: 'ambulance' | 'hospital' | 'route' | 'all') => {
    setModalCategory(cat);
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <Header onResetDemo={handleResetDemo} isResetting={isResetting} />

      <main className="flex-1 p-4 lg:p-6 max-w-[1700px] w-full mx-auto space-y-4">
        {/* Dynamic Route Alert Banner if triggered */}
        <RouteAlertBanner
          isRerouting={isRerouting}
          rerouteResult={rerouteResult}
          onDismiss={() => setRerouteResult(null)}
        />

        {/* Golden Minute Response Optimizer Hero Counter */}
        {optimization && (
          <GoldenMinuteCounter
            totalMinutes={optimization.total_estimated_time}
            ambulanceEta={optimization.ambulance_eta}
            travelEta={optimization.travel_eta}
            onSimulateBlockage={handleSimulateBlockage}
            isSimulatingBlockage={isSimulatingBlockage || isRerouting}
          />
        )}

        {/* Main 2-Column Tactical Mission Control Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Tactical Live Map (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            <div className="h-[480px] sm:h-[580px] w-full">
              <MapboxMap
                emergency={emergency}
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

            {/* Green Wave Corridor Simulation */}
            <GreenCorridorSim />
          </div>

          {/* Right Column: Emergency & Decision Panels (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col space-y-4">
            {/* Active Emergency Intake Card */}
            {emergency ? (
              <EmergencyCard
                emergency={emergency}
                onAnalyze={handleAnalyzeEmergency}
                isAnalyzing={isAnalyzing}
              />
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-zinc-400">
                <AlertCircle className="h-6 w-6 mx-auto mb-2 text-zinc-500" />
                No active emergencies. Click "Reset Demo" to load demo scenario.
              </div>
            )}

            {/* Smart Ambulance Recommendation Panel */}
            <AmbulancePanel
              ambulance={optimization?.selected_ambulance || null}
              onWhyClick={() => openDecisionModal('ambulance')}
            />

            {/* Hospital Ready Check Panel */}
            <HospitalPanel
              hospital={optimization?.selected_hospital || null}
              onWhyClick={() => openDecisionModal('hospital')}
            />

            {/* Route Risk & Alternatives Panel */}
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
      </main>

      {/* Decision Transparency Modal */}
      <DecisionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        explanation={explanation}
        targetCategory={modalCategory}
      />
    </div>
  );
};
