import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmergencyAssistantFlow } from '../components/EmergencyAssistantFlow';
import {
  Activity,
  ShieldCheck,
  PhoneCall,
  Car,
  Heart,
  Flame,
  UserCheck,
  HelpCircle,
  Clock,
  ArrowRight,
  Cpu,
  History,
  Radio,
  Navigation,
  Sparkles,
  Shield
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const [isEmergencyActive, setIsEmergencyActive] = useState<boolean>(false);
  const [selectedIncidentType, setSelectedIncidentType] = useState<string | undefined>(undefined);

  const handleStartEmergency = (incidentType?: string) => {
    setSelectedIncidentType(incidentType);
    setIsEmergencyActive(true);
  };

  const quickScenarios = [
    { label: 'Road Accident', type: 'ROAD_ACCIDENT', icon: Car, desc: 'Vehicle collision, bike crash, road injury' },
    { label: 'Heart / Chest Pain', type: 'CARDIAC_ARREST', icon: Heart, desc: 'Severe chest tightness, collapsed patient' },
    { label: 'Unconscious / Bleeding', type: 'TRAUMA_INJURY', icon: Activity, desc: 'Non-responsive, severe bleeding, trauma' },
    { label: 'Fire / Burn Injury', type: 'FIRE_BURN', icon: Flame, desc: 'Thermal burn, smoke inhalation, explosion' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-red-500/30 selection:text-red-200">
      {/* Minimal Top Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md px-4 sm:px-6 py-3 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 shadow-lg shadow-red-600/10">
              <Activity className="h-4 w-4 animate-pulse" />
            </div>
            <div>
              <span className="font-black tracking-wider text-base text-white font-mono">LIFELINE</span>
              <span className="text-[10px] text-zinc-400 block -mt-0.5">Emergency Assistance</span>
            </div>
          </div>

          <nav className="flex items-center gap-1.5 sm:gap-3 text-xs font-mono">
            <Link
              to="/history"
              className="px-2.5 py-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all flex items-center gap-1"
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cases</span>
            </Link>

            <Link
              to="/operations"
              className="px-2.5 py-1 rounded-lg text-amber-400/90 hover:text-amber-300 hover:bg-zinc-900 border border-amber-500/30 transition-all flex items-center gap-1"
            >
              <Cpu className="h-3.5 w-3.5" />
              <span>Operations / Demo</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center px-4 py-6 sm:py-10 max-w-4xl mx-auto w-full">
        {isEmergencyActive ? (
          <EmergencyAssistantFlow
            initialIncidentType={selectedIncidentType}
            onExitFlow={() => {
              setIsEmergencyActive(false);
              setSelectedIncidentType(undefined);
            }}
          />
        ) : (
          <div className="space-y-8 sm:space-y-12 animate-fadeIn">
            {/* Primary Hero Emergency Action */}
            <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-10 shadow-2xl text-center space-y-6 relative overflow-hidden">
              {/* Soft glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

              <div className="max-w-xl mx-auto space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/70 border border-red-500/40 text-red-400 text-xs font-mono font-bold">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span>24/7 EMERGENCY RESPONSE READY</span>
                </div>
                <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
                  Need urgent medical assistance?
                </h1>
                <p className="text-sm sm:text-base text-zinc-400">
                  Answer 2 quick questions to find the fastest appropriate ambulance, receiving hospital, and traffic-aware route.
                </p>
              </div>

              {/* Big Dominant CTA */}
              <div className="max-w-md mx-auto pt-2">
                <button
                  onClick={() => handleStartEmergency()}
                  className="w-full py-5 px-6 rounded-2xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-black text-lg sm:text-xl tracking-wider uppercase flex items-center justify-center gap-3 shadow-2xl shadow-red-600/50 border border-red-400 transition-all active:scale-[0.98] group"
                >
                  <span className="text-2xl animate-pulse">🚨</span>
                  <span>GET EMERGENCY HELP</span>
                  <ArrowRight className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {/* Quick Situational Triage Pills */}
              <div className="pt-4 border-t border-zinc-800/80">
                <div className="text-xs font-mono text-zinc-500 mb-3 uppercase">
                  Or select the emergency type:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {quickScenarios.map((sc) => {
                    const Icon = sc.icon;
                    return (
                      <button
                        key={sc.type}
                        onClick={() => handleStartEmergency(sc.type)}
                        className="p-3 rounded-xl bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-left transition-all active:scale-[0.98] flex flex-col gap-1.5 group"
                      >
                        <Icon className="h-4 w-4 text-cyan-400 group-hover:text-red-400 transition-colors" />
                        <span className="font-bold text-xs text-white leading-tight">{sc.label}</span>
                        <span className="text-[10px] text-zinc-500 leading-tight hidden sm:inline">{sc.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* "Not an Emergency?" / How LifeLine Works Section */}
            <div className="space-y-4">
              <div className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider text-center">
                HOW LIFELINE PROTECTS YOU
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-2">
                  <div className="h-8 w-8 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-bold text-sm">
                    1
                  </div>
                  <h3 className="font-bold text-sm text-white">Conversational AI Intake</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Understands voice and natural language in English, Tamil, and Tanglish. Asks only the minimum essential questions in seconds.
                  </p>
                </div>

                <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-2">
                  <div className="h-8 w-8 rounded-lg bg-red-950 border border-red-500/40 flex items-center justify-center text-red-400 font-bold text-sm">
                    2
                  </div>
                  <h3 className="font-bold text-sm text-white">Capability-Matched Fleet</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Matches Advanced Life Support (ALS) and ICU units for cardiac and critical trauma rather than naive nearest basic dispatch.
                  </p>
                </div>

                <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-2">
                  <div className="h-8 w-8 rounded-lg bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-sm">
                    3
                  </div>
                  <h3 className="font-bold text-sm text-white">Live Traffic Corridors</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Uses Google Routes with live traffic awareness to calculate fastest driving paths and dynamically reroutes around blockages.
                  </p>
                </div>
              </div>
            </div>

            {/* Direct Emergency Call Footer */}
            <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-zinc-400">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-400" />
                <span>LifeLine Decision Support • Standard Emergency Hotlines:</span>
              </div>
              <div className="flex items-center gap-3 font-bold text-white">
                <a href="tel:108" className="hover:text-red-400 transition-colors flex items-center gap-1">
                  <PhoneCall className="h-3.5 w-3.5 text-red-400" />
                  <span>Call 108 (Ambulance)</span>
                </a>
                <span className="text-zinc-600">|</span>
                <a href="tel:112" className="hover:text-cyan-400 transition-colors">
                  <span>Call 112 (National)</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
