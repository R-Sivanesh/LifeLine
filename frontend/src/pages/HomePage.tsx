import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmergencyAssistantFlow } from '../components/EmergencyAssistantFlow';
import { ActiveEmergencyView } from '../components/ActiveEmergencyView';
import { AuthRoleSelectorModal } from '../components/AuthRoleSelectorModal';
import { useAuth } from '../context/AuthContext';
import { lifelineApi } from '../services/api';
import { Emergency, OptimizationResult, UserRole, Driver } from '../types';
import {
  PhoneCall,
  ShieldCheck,
  Ambulance,
  Hospital,
  User,
  ArrowRight,
  RefreshCw,
  Car,
  Heart,
  Activity,
  Flame,
  AlertCircle
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, openAuthModal, isAuthModalOpen, authModalRole, closeAuthModal, login } = useAuth();

  // App Lifecycle States
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [activeEmergency, setActiveEmergency] = useState<Emergency | null>(null);
  const [activeOptimization, setActiveOptimization] = useState<OptimizationResult | null>(null);
  const [isPatientFlowActive, setIsPatientFlowActive] = useState<boolean>(false);
  const [selectedIncidentType, setSelectedIncidentType] = useState<string | undefined>(undefined);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);

  // ════════════════════════════════════════════════════════════
  // 1. STARTUP DECISION TREE: CHECK & RESTORE PATIENT SESSION
  // ════════════════════════════════════════════════════════════
  useEffect(() => {
    lifelineApi.getDemoStatus().then(res => setIsDemoMode(res.demo_mode)).catch(() => setIsDemoMode(true));

    const checkActiveSessionOnStartup = async () => {
      try {
        const sessionToken = localStorage.getItem('lifeline_session_token') || sessionStorage.getItem('lifeline_session_token');

        if (sessionToken) {
          const validation = await lifelineApi.validatePatientSession(sessionToken);

          if (validation.is_active && validation.emergency) {
            setActiveEmergency(validation.emergency);
            setIsPatientFlowActive(false);
          } else if (validation.status === 'COMPLETED' || validation.status === 'RESOLVED') {
            if (validation.emergency) {
              setActiveEmergency(validation.emergency);
            } else {
              lifelineApi.clearPatientSession();
            }
          } else {
            lifelineApi.clearPatientSession();
          }
        }
      } catch (err) {
        console.warn('[LifeLine Startup] Session validation check notice:', err);
      } finally {
        setIsInitializing(false);
      }
    };

    checkActiveSessionOnStartup();
  }, []);

  // ════════════════════════════════════════════════════════════
  // 2. ROLE CLICK HANDLERS
  // ════════════════════════════════════════════════════════════
  const handleSelectPatientRole = (incidentType?: string) => {
    setSelectedIncidentType(incidentType);
    setIsPatientFlowActive(true);
  };

  const handleRoleCardClick = (role: UserRole) => {
    if (isAuthenticated && user?.role === role) {
      if (role === 'DRIVER') navigate('/ambulance/tracker');
      else if (role === 'HOSPITAL_STAFF') navigate('/hospital/portal');
      else navigate('/operations');
    } else {
      openAuthModal(role);
    }
  };

  // ════════════════════════════════════════════════════════════
  // 3. RENDER: INITIALIZING LOADER
  // ════════════════════════════════════════════════════════════
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-4">
        <div className="h-14 w-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-xl">
          <img src="/logo-clean.png" alt="LifeLine" className="h-8 w-8 object-contain animate-pulse" />
        </div>
        <div className="mt-4 text-xs font-mono text-slate-400 flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-cyan-400" />
          <span>Synchronizing LifeLine session...</span>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // 4. RENDER: CONTINUOUS ACTIVE EMERGENCY TRACKER
  // ════════════════════════════════════════════════════════════
  if (activeEmergency) {
    return (
      <ActiveEmergencyView
        initialEmergency={activeEmergency}
        initialOptimization={activeOptimization || undefined}
        onExit={() => {
          setActiveEmergency(null);
          setActiveOptimization(null);
          setIsPatientFlowActive(false);
        }}
      />
    );
  }

  // ════════════════════════════════════════════════════════════
  // 5. RENDER: PATIENT EMERGENCY INTAKE ASSISTANT
  // ════════════════════════════════════════════════════════════
  if (isPatientFlowActive) {
    return (
      <EmergencyAssistantFlow
        initialIncidentType={selectedIncidentType}
        onEmergencyCreated={(emg, opt) => {
          setActiveEmergency(emg);
          setActiveOptimization(opt || null);
          setIsPatientFlowActive(false);
        }}
        onCancel={() => {
          setIsPatientFlowActive(false);
          setSelectedIncidentType(undefined);
        }}
      />
    );
  }

  // ════════════════════════════════════════════════════════════
  // 6. RENDER: CLEAN PUBLIC ENTRY EXPERIENCE
  // ════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-cyan-500/30 font-sans">
      {/* ── Top Brand Bar ── */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-center shadow-md">
            <img src="/logo-clean.png" alt="LifeLine" className="h-6 w-6 object-contain" />
          </div>
          <div>
            <div className="font-black tracking-tight text-lg text-white leading-none">
              LIFE<span className="text-cyan-400">LINE</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono tracking-wider mt-0.5">
              EMERGENCY COORDINATION
            </div>
          </div>
        </div>

        <a
          href="tel:108"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/70 border border-red-500/40 text-red-300 hover:bg-red-900/60 transition-all text-xs font-mono font-bold"
          title="Direct emergency dialer"
        >
          <PhoneCall className="h-3.5 w-3.5 text-red-400" />
          <span>DIAL 108</span>
        </a>
      </header>

      {/* ── Main Public Entry ── */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col justify-center space-y-8 animate-fadeIn">
        {/* Mission Statement */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Emergency response when <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-300">
              every minute matters.
            </span>
          </h1>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            Direct coordination between patients, verified emergency ambulance drivers, and receiving hospitals.
          </p>
        </div>

        {/* ── Primary Role Selection ── */}
        <div className="space-y-4">
          <div className="text-xs font-mono font-bold text-slate-400 text-center uppercase tracking-wider">
            How are you using LifeLine?
          </div>

          {/* 1. PATIENT EMERGENCY (DOMINANT ACTION) */}
          <button
            type="button"
            onClick={() => handleSelectPatientRole()}
            className="w-full text-left p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-red-950/80 via-slate-900 to-slate-950 border-2 border-red-500/60 hover:border-red-400 shadow-2xl shadow-red-950/50 transition-all duration-200 active:scale-[0.99] group relative overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-600/40 text-2xl group-hover:scale-105 transition-transform shrink-0">
                  🚨
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg sm:text-xl font-black text-white group-hover:text-red-300 transition-colors">
                      I NEED EMERGENCY HELP
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-red-900 text-red-200 border border-red-500/40">
                      NO LOGIN
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 mt-1">
                    Automatic GPS detection · Voice &amp; text intake · Instant verified dispatch
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-red-400 group-hover:translate-x-1 transition-transform shrink-0 hidden sm:block" />
            </div>
          </button>

          {/* 2. AMBULANCE DRIVER (FIELD OPERATIONS) */}
          <button
            type="button"
            onClick={() => handleRoleCardClick('DRIVER')}
            className="w-full text-left p-4 sm:p-5 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/50 shadow-lg transition-all active:scale-[0.99] group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-xl bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400 text-xl shrink-0 group-hover:scale-105 transition-transform">
                  🚑
                </div>
                <div>
                  <div className="font-bold text-sm sm:text-base text-white group-hover:text-cyan-300 transition-colors">
                    I'M AN AMBULANCE DRIVER
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Field operations · Live emergency alerts · GPS telemetry
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/70 border border-cyan-500/30 px-3 py-1.5 rounded-xl shrink-0">
                Driver Portal →
              </span>
            </div>
          </button>

          {/* 3. HOSPITAL ER STAFF (RECEIVING HOSPITAL) */}
          <button
            type="button"
            onClick={() => handleRoleCardClick('HOSPITAL_STAFF')}
            className="w-full text-left p-4 sm:p-5 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/50 shadow-lg transition-all active:scale-[0.99] group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-xl bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xl shrink-0 group-hover:scale-105 transition-transform">
                  🏥
                </div>
                <div>
                  <div className="font-bold text-sm sm:text-base text-white group-hover:text-emerald-300 transition-colors">
                    I'M HOSPITAL STAFF
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ER intake coordination · Inbound ambulance radar · Patient ETA
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-3 py-1.5 rounded-xl shrink-0">
                Hospital Portal →
              </span>
            </div>
          </button>
        </div>
      </main>

      {/* ── Footer / Protected Command Link ── */}
      <footer className="px-6 py-4 border-t border-slate-800/60 bg-slate-950/80 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
          <span>LifeLine Emergency Network</span>
        </div>

        <button
          onClick={() => handleRoleCardClick('OPERATOR')}
          className="text-slate-400 hover:text-slate-200 transition-colors text-xs font-mono underline"
        >
          Operations Center (Protected)
        </button>
      </footer>

      {/* ── Authentication Modal (Driver / Hospital) ── */}
      {isAuthModalOpen && (
        <AuthRoleSelectorModal
          isOpen={isAuthModalOpen}
          initialRole={authModalRole}
          onClose={closeAuthModal}
          onAuthSuccess={(loggedInUser: Driver) => {
            closeAuthModal();
            if (loggedInUser.role === 'DRIVER') navigate('/ambulance/tracker');
            else if (loggedInUser.role === 'HOSPITAL_STAFF') navigate('/hospital/portal');
            else navigate('/operations');
          }}
        />
      )}
    </div>
  );
};
