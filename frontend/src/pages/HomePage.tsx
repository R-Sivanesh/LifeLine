import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmergencyAssistantFlow } from '../components/EmergencyAssistantFlow';
import { ActiveEmergencyView } from '../components/ActiveEmergencyView';
import { AuthRoleSelectorModal } from '../components/AuthRoleSelectorModal';
import { useAuth } from '../context/AuthContext';
import { lifelineApi } from '../services/api';
import { Emergency, OptimizationResult, UserRole } from '../types';
import {
  PhoneCall,
  ShieldCheck,
  Building2,
  Ambulance,
  Lock,
  User,
  ArrowRight,
  RefreshCw,
  Radio,
  Car,
  Heart,
  Activity,
  Flame
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
        const savedSession = localStorage.getItem('lifeline_patient_session');
        const sessionToken = localStorage.getItem('lifeline_session_token') || sessionStorage.getItem('lifeline_session_token');

        if (sessionToken) {
          // Validate existing session with backend
          const validation = await lifelineApi.validatePatientSession(sessionToken);

          if (validation.is_active && validation.emergency) {
            // Restore patient directly into ACTIVE EMERGENCY screen
            setActiveEmergency(validation.emergency);
            setIsPatientFlowActive(false);
          } else if (validation.status === 'COMPLETED' || validation.status === 'RESOLVED') {
            if (validation.emergency) {
              setActiveEmergency(validation.emergency);
            } else {
              lifelineApi.clearPatientSession();
            }
          } else {
            // Session expired or cancelled -> clear
            lifelineApi.clearPatientSession();
          }
        }
      } catch (err) {
        console.warn('[LifeLine Startup] Session validation network notice:', err);
        // If network error occurred but local session exists, prepare fallback
        const savedSession = localStorage.getItem('lifeline_patient_session');
        if (savedSession) {
          try {
            const parsed = JSON.parse(savedSession);
            if (parsed.emergency_id) {
              // Restore placeholder emergency in reconnecting mode
              setActiveEmergency({
                id: parsed.emergency_id,
                code: parsed.session_code || `EMG-${parsed.emergency_id.slice(0, 5).toUpperCase()}`,
                description: 'Emergency Assistance in Progress',
                incident_type: parsed.incident_type || 'ROAD_ACCIDENT',
                latitude: 12.9516,
                longitude: 80.1462,
                patient_count: 1,
                critical_patient_count: 0,
                severity: 'HIGH',
                status: 'SEARCHING'
              });
            }
          } catch (parseErr) {
            console.warn('Fallback parse error:', parseErr);
          }
        }
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

  // Quick preset emergency categories
  const quickScenarios = [
    { label: 'Road Accident',         type: 'ROAD_ACCIDENT',   icon: Car,      desc: 'Vehicle collision, bike crash, trauma', color: 'text-orange-400' },
    { label: 'Heart / Chest Pain',    type: 'CARDIAC_ARREST',  icon: Heart,    desc: 'Severe chest tightness, cardiac arrest', color: 'text-red-400'    },
    { label: 'Unconscious / Trauma',  type: 'TRAUMA_INJURY',   icon: Activity, desc: 'Non-responsive, severe injury or fall',  color: 'text-rose-400'   },
    { label: 'Fire / Burn Emergency', type: 'FIRE_BURN',       icon: Flame,    desc: 'Severe burns, smoke inhalation',        color: 'text-amber-400'  },
  ];

  // ════════════════════════════════════════════════════════════
  // 3. RENDER: INITIALIZING LOADER
  // ════════════════════════════════════════════════════════════
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center font-sans">
        <div className="relative h-16 w-16 rounded-full bg-zinc-900 border border-zinc-700/80 p-1 flex items-center justify-center shadow-2xl shadow-red-600/30">
          <img src="/logo-clean.png" alt="LifeLine" className="h-full w-full object-contain animate-pulse" />
        </div>
        <div className="mt-4 text-xs font-mono text-zinc-400 flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-cyan-400" />
          <span>Synchronizing LifeLine session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* ── Single App Shell Header ── */}
      <header
        className="border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md sticky top-0 z-30"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="px-4 py-3 flex items-center justify-between gap-3 max-w-lg mx-auto">
          {/* Brand Logo & Title */}
          <div
            onClick={() => {
              if (!activeEmergency) {
                setIsPatientFlowActive(false);
                setSelectedIncidentType(undefined);
              }
            }}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="relative h-9 w-9 rounded-full bg-zinc-950 border border-zinc-700/80 p-0.5 flex items-center justify-center shadow-lg shadow-red-600/20 group-hover:border-cyan-500/50 transition-all">
              <img
                src="/logo-clean.png"
                alt="LifeLine"
                className="h-full w-full object-contain drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]"
              />
            </div>
            <div>
              <span className="font-black tracking-widest text-sm text-white font-mono leading-none">LIFELINE</span>
              <span className="text-[10px] text-zinc-400 block leading-tight">Emergency Response</span>
            </div>
          </div>

          {/* User / Sign In status */}
          <div className="flex items-center gap-2">
            {isAuthenticated && user ? (
              <button
                onClick={() => handleRoleCardClick(user.role)}
                className="h-9 px-3 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold flex items-center gap-1.5 hover:bg-cyan-900/60 transition-all"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="truncate max-w-[110px]">{user.name.split(' ')[0]}</span>
              </button>
            ) : (
              <button
                onClick={() => openAuthModal()}
                className="h-9 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <Lock className="h-3.5 w-3.5 text-cyan-400" />
                <span>Portal Login</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Unified View ── */}
      <main className="flex-1 flex flex-col px-4 py-5 sm:py-6 max-w-lg mx-auto w-full gap-5">
        {/* CASE A: Active Emergency Session Found & Restored */}
        {activeEmergency ? (
          <ActiveEmergencyView
            emergency={activeEmergency}
            initialOptimization={activeOptimization}
            onExit={() => {
              setActiveEmergency(null);
              setIsPatientFlowActive(false);
              lifelineApi.clearPatientSession();
            }}
          />
        ) : isPatientFlowActive ? (
          /* CASE B: Patient Emergency Assistance Intake Flow */
          <EmergencyAssistantFlow
            initialIncidentType={selectedIncidentType}
            onExitFlow={() => {
              setIsPatientFlowActive(false);
              setSelectedIncidentType(undefined);
            }}
            onEmergencyCreated={(createdEmg, opt) => {
              setActiveEmergency(createdEmg);
              if (opt) setActiveOptimization(opt);
              setIsPatientFlowActive(false);
            }}
          />
        ) : (
          /* CASE C: Clean Unified LifeLine First-Entry Screen */
          <div className="space-y-6 animate-fadeIn">
            {/* Header / Intro */}
            <div className="text-center space-y-1.5 pt-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold tracking-wider mb-1">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>ONE UNIFIED RESPONSE SYSTEM</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                How are you using LifeLine?
              </h1>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                Select your role below to start assistance or access your operational workspace.
              </p>
            </div>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* 3 PRIMARY USER-FACING ROLE CARDS                           */}
            {/* ════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 gap-3.5">
              {/* CARD 1: 👤 USER / PATIENT (No login required) */}
              <button
                onClick={() => handleSelectPatientRole()}
                className="w-full p-5 rounded-3xl bg-gradient-to-r from-red-950/90 via-zinc-950 to-zinc-950 hover:from-red-900/90 border-2 border-red-500/60 hover:border-red-400 transition-all text-left flex items-center justify-between group active:scale-[0.98] shadow-xl shadow-red-600/20 card-glow-red"
              >
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-red-600 flex items-center justify-center text-white text-2xl shadow-lg shadow-red-600/40 group-hover:scale-105 transition-transform shrink-0">
                    👤
                  </div>
                  <div>
                    <div className="font-black text-base sm:text-lg text-white flex items-center gap-2">
                      <span>USER / PATIENT</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-500/40 font-bold">
                        No login required
                      </span>
                    </div>
                    <div className="text-xs text-zinc-300 font-medium mt-1">
                      Get emergency assistance
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Instant dispatch with automatic GPS location.
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-red-400 group-hover:translate-x-1.5 transition-transform shrink-0" />
              </button>

              {/* CARD 2: 🚑 AMBULANCE / DRIVER */}
              <button
                onClick={() => handleRoleCardClick('DRIVER')}
                className="w-full p-5 rounded-3xl bg-zinc-900/80 hover:bg-zinc-900 border border-cyan-500/40 hover:border-cyan-400 transition-all text-left flex items-center justify-between group active:scale-[0.98] shadow-lg shadow-cyan-600/10"
              >
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-cyan-950/90 border border-cyan-500/50 flex items-center justify-center text-cyan-400 text-2xl group-hover:scale-105 transition-transform shrink-0">
                    🚑
                  </div>
                  <div>
                    <div className="font-black text-base sm:text-lg text-white flex items-center gap-2">
                      <span>AMBULANCE / DRIVER</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                        Google + OTP
                      </span>
                      {isDemoMode && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/40 font-bold">
                          Demo Driver
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-300 font-medium mt-1">
                      Respond to emergency requests
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Accept dispatches &amp; stream live telemetry.
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-zinc-400 group-hover:text-cyan-400 group-hover:translate-x-1.5 transition-transform shrink-0" />
              </button>

              {/* CARD 3: 🏥 HOSPITAL / STAFF */}
              <button
                onClick={() => handleRoleCardClick('HOSPITAL_STAFF')}
                className="w-full p-5 rounded-3xl bg-zinc-900/80 hover:bg-zinc-900 border border-emerald-500/40 hover:border-emerald-400 transition-all text-left flex items-center justify-between group active:scale-[0.98] shadow-lg shadow-emerald-600/10"
              >
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-emerald-950/90 border border-emerald-500/50 flex items-center justify-center text-emerald-400 text-2xl group-hover:scale-105 transition-transform shrink-0">
                    🏥
                  </div>
                  <div>
                    <div className="font-black text-base sm:text-lg text-white flex items-center gap-2">
                      <span>HOSPITAL / STAFF</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                        Google + OTP
                      </span>
                      {isDemoMode && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/40 font-bold">
                          Demo Hospital
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-300 font-medium mt-1">
                      Manage incoming emergencies
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Track inbound ambulances &amp; prepare ER beds.
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-zinc-400 group-hover:text-emerald-400 group-hover:translate-x-1.5 transition-transform shrink-0" />
              </button>
            </div>

            {/* Quick Emergency Category Taps (For Fast Patient Access) */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-4 sm:p-5 space-y-3">
              <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider font-bold">
                Quick Patient Emergency Start:
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {quickScenarios.map((sc) => {
                  const Icon = sc.icon;
                  return (
                    <button
                      key={sc.type}
                      onClick={() => handleSelectPatientRole(sc.type)}
                      className="p-3 rounded-2xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-left transition-all active:scale-[0.97] flex flex-col gap-1 min-h-[76px] group"
                    >
                      <Icon className={`h-5 w-5 ${sc.color} group-hover:scale-110 transition-transform`} />
                      <span className="font-bold text-xs text-white leading-tight">{sc.label}</span>
                      <span className="text-[10px] text-zinc-500 leading-snug truncate">{sc.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Emergency Direct Dial Hotlines (108 / 112) */}
            <div className="grid grid-cols-2 gap-3">
              <a
                href="tel:108"
                className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-red-950/70 border border-red-500/50 text-red-300 font-bold text-sm transition-all active:scale-[0.97] hover:bg-red-950"
              >
                <PhoneCall className="h-4 w-4 text-red-400" />
                <span>Call 108</span>
              </a>
              <a
                href="tel:112"
                className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-sm transition-all active:scale-[0.97] hover:bg-zinc-800"
              >
                <PhoneCall className="h-4 w-4 text-zinc-400" />
                <span>Call 112</span>
              </a>
            </div>

            {/* Footer Trust & Architecture Note */}
            <div className="flex items-center justify-center gap-2 py-2 text-[11px] font-mono text-zinc-500 text-center">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>Verified Google Places Directory · Live Routes · Deterministic Dispatch</span>
            </div>
          </div>
        )}
      </main>

      {/* ── Global Unified Auth Modal (Google + Mobile OTP) ── */}
      <AuthRoleSelectorModal
        isOpen={isAuthModalOpen}
        initialRole={authModalRole}
        onClose={closeAuthModal}
        onSelectPatient={() => {
          closeAuthModal();
          handleSelectPatientRole();
        }}
        onAuthSuccess={(verifiedUser) => {
          const token = localStorage.getItem('lifeline_driver_token') || 'll_auth_verified';
          login(verifiedUser, token);
          closeAuthModal();
        }}
      />
    </div>
  );
};

export default HomePage;
