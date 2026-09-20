import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmergencyAssistantFlow } from '../components/EmergencyAssistantFlow';
import {
  Activity,
  PhoneCall,
  Car,
  Heart,
  Flame,
  ArrowRight,
  Cpu,
  History,
  Radio,
  Shield,
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const [isEmergencyActive, setIsEmergencyActive] = useState<boolean>(false);
  const [selectedIncidentType, setSelectedIncidentType] = useState<string | undefined>(undefined);

  const handleStartEmergency = (incidentType?: string) => {
    setSelectedIncidentType(incidentType);
    setIsEmergencyActive(true);
  };

  const quickScenarios = [
    { label: 'Road Accident',         type: 'ROAD_ACCIDENT',   icon: Car,      desc: 'Collision, bike crash, road injury',   color: 'text-orange-400' },
    { label: 'Heart / Chest Pain',    type: 'CARDIAC_ARREST',  icon: Heart,    desc: 'Severe tightness, collapsed patient',  color: 'text-red-400'    },
    { label: 'Unconscious / Bleeding',type: 'TRAUMA_INJURY',   icon: Activity, desc: 'Non-responsive, severe trauma',        color: 'text-rose-400'   },
    { label: 'Fire / Burn Injury',    type: 'FIRE_BURN',       icon: Flame,    desc: 'Burns, smoke, explosion injury',       color: 'text-amber-400'  },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">

      {/* ── Sticky Mobile-First Header ── */}
      <header
        className="border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-md sticky top-0 z-30"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="px-4 py-3 flex items-center justify-between gap-2 max-w-lg mx-auto">
          {/* Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="h-9 w-9 rounded-xl bg-red-600/20 border border-red-500/50 flex items-center justify-center shadow-lg shadow-red-600/20">
              <Activity className="h-5 w-5 text-red-500 animate-pulse" />
            </div>
            <div>
              <span className="font-black tracking-wider text-sm text-white font-mono leading-none">LIFELINE</span>
              <span className="text-[10px] text-zinc-500 block leading-tight">Emergency Assistance</span>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-1.5">
            <Link
              to="/ambulance/tracker"
              className="h-10 px-3 rounded-xl text-cyan-400 border border-cyan-500/30 hover:bg-zinc-900 transition-all flex items-center gap-1.5 text-xs font-mono"
              title="Ambulance GPS Tracker"
            >
              <Radio className="h-4 w-4" />
              <span className="hidden sm:inline">GPS</span>
            </Link>
            <Link
              to="/history"
              className="h-10 px-3 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all flex items-center gap-1.5 text-xs font-mono"
              title="Case History"
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Cases</span>
            </Link>
            <Link
              to="/operations"
              className="h-10 px-3 rounded-xl text-amber-400/90 border border-amber-500/30 hover:bg-zinc-900 transition-all flex items-center gap-1.5 text-xs font-mono"
              title="Operations / Demo"
            >
              <Cpu className="h-4 w-4" />
              <span className="hidden sm:inline">Ops</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col px-4 py-5 sm:py-8 max-w-lg mx-auto w-full gap-5">
        {isEmergencyActive ? (
          <EmergencyAssistantFlow
            initialIncidentType={selectedIncidentType}
            onExitFlow={() => {
              setIsEmergencyActive(false);
              setSelectedIncidentType(undefined);
            }}
          />
        ) : (
          <div className="space-y-5 animate-fadeIn">

            {/* ── Hero Emergency Card ── */}
            <div className="relative bg-gradient-to-b from-zinc-900 to-zinc-950 border border-red-500/40 card-glow-red rounded-3xl p-5 sm:p-8 shadow-2xl text-center space-y-5 overflow-hidden">
              {/* Ambient glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-40 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/80 border border-red-500/50 text-red-400 text-xs font-mono font-bold">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span>24/7 EMERGENCY RESPONSE</span>
                </div>
                <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                  Need urgent<br className="sm:hidden" /> medical help?
                </h1>
                <p className="text-sm text-zinc-400 max-w-xs mx-auto">
                  Answer 2 quick questions. We'll find the fastest ambulance &amp; hospital.
                </p>
              </div>

              {/* Primary CTA */}
              <button
                onClick={() => handleStartEmergency()}
                className="relative w-full py-5 px-4 rounded-2xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-black text-xl tracking-wider uppercase flex items-center justify-center gap-3 shadow-2xl shadow-red-600/50 border-2 border-red-400 transition-all active:scale-[0.97] group"
              >
                <span className="text-2xl animate-pulse">🚨</span>
                <span>GET EMERGENCY HELP</span>
                <ArrowRight className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
              </button>

              {/* Quick Scenario Tiles */}
              <div className="pt-3 border-t border-zinc-800 space-y-3">
                <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
                  Or tap the emergency type:
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {quickScenarios.map((sc) => {
                    const Icon = sc.icon;
                    return (
                      <button
                        key={sc.type}
                        onClick={() => handleStartEmergency(sc.type)}
                        className="p-4 rounded-2xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-700 hover:border-zinc-600 text-left transition-all active:scale-[0.97] flex flex-col gap-2 min-h-[88px] group"
                      >
                        <Icon className={`h-5 w-5 ${sc.color} group-hover:scale-110 transition-transform`} />
                        <span className="font-bold text-sm text-white leading-tight">{sc.label}</span>
                        <span className="text-[11px] text-zinc-500 leading-snug">{sc.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Emergency Hotlines ── */}
            <div className="grid grid-cols-2 gap-3">
              <a
                href="tel:108"
                className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-red-950/60 border-2 border-red-500/60 text-red-300 font-bold text-base transition-all active:scale-[0.97] hover:bg-red-950"
              >
                <PhoneCall className="h-5 w-5 text-red-400" />
                <span>Call 108</span>
              </a>
              <a
                href="tel:112"
                className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-zinc-900 border-2 border-zinc-600 text-zinc-300 font-bold text-base transition-all active:scale-[0.97] hover:bg-zinc-800"
              >
                <PhoneCall className="h-5 w-5 text-zinc-400" />
                <span>Call 112</span>
              </a>
            </div>

            {/* ── How It Works ── */}
            <div className="space-y-3">
              <div className="text-xs font-mono font-bold text-zinc-500 uppercase tracking-wider text-center">
                HOW LIFELINE WORKS
              </div>
              <div className="space-y-2.5">
                {[
                  { n: '1', color: 'bg-cyan-950 border-cyan-500/50 text-cyan-400',     title: 'AI Intake in Seconds',      body: 'Speak or type in English, Tamil, or Tanglish. Only essential questions.' },
                  { n: '2', color: 'bg-red-950 border-red-500/50 text-red-400',        title: 'Capability-Matched Fleet',  body: 'ALS/ICU ambulances for cardiac and critical cases — not just the nearest basic unit.' },
                  { n: '3', color: 'bg-emerald-950 border-emerald-500/50 text-emerald-400', title: 'Live Traffic Corridors', body: 'Google Routes with real-time traffic calculates fastest paths and auto-reroutes.' },
                ].map((item) => (
                  <div key={item.n} className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 flex items-start gap-3">
                    <div className={`h-8 w-8 shrink-0 rounded-lg border flex items-center justify-center font-bold text-sm ${item.color}`}>
                      {item.n}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white">{item.title}</h3>
                      <p className="text-xs text-zinc-400 leading-relaxed mt-0.5">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Footer Trust Note ── */}
            <div className="flex items-center justify-center gap-2 py-3 text-[11px] font-mono text-zinc-600 text-center">
              <Shield className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>Real hospitals via Google Places · Live traffic via Google Routes</span>
            </div>

          </div>
        )}
      </main>
    </div>
  );
};
