import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { UnifiedHeader } from './UnifiedHeader';
import { AuthRoleSelectorModal } from './AuthRoleSelectorModal';
import { ErrorBoundary } from './ErrorBoundary';
import { lifelineApi } from '../services/api';
import {
  ShieldCheck,
  RefreshCw,
  Ambulance,
  Building2,
  Cpu,
  ArrowLeft,
  AlertTriangle,
  Play,
  UserCheck
} from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, isLoading, login, logout, isAuthModalOpen, closeAuthModal, openAuthModal } = useAuth();
  const navigate = useNavigate();
  const [isDemoSubmitting, setIsDemoSubmitting] = useState<boolean>(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);

  // Check demo mode setting
  useEffect(() => {
    lifelineApi.getDemoStatus().then((res) => {
      setIsDemoMode(res.demo_mode);
    }).catch(() => {
      setIsDemoMode(true);
    });
  }, []);

  const primaryRole = allowedRoles && allowedRoles.length > 0 ? allowedRoles[0] : 'DRIVER';
  const isDriverRoute = allowedRoles?.includes('DRIVER');
  const isHospitalRoute = allowedRoles?.includes('HOSPITAL_STAFF');

  // Handle one-click demo login from unauthenticated screen
  const handleQuickDemoLogin = async () => {
    setIsDemoSubmitting(true);
    try {
      if (isHospitalRoute) {
        const res = await lifelineApi.demoLogin({ role: 'HOSPITAL_STAFF', demo_id: 'staff-demo-001' });
        if (res.driver) {
          login(res.driver, res.token);
        }
      } else {
        const res = await lifelineApi.demoLogin({ role: 'DRIVER', demo_id: 'drv-demo-001' });
        if (res.driver) {
          login(res.driver, res.token);
        }
      }
    } catch (e) {
      console.warn('Quick demo login error:', e);
      openAuthModal(primaryRole);
    } finally {
      setIsDemoSubmitting(false);
    }
  };

  // 1. Session Loading State (NEVER show blank screen)
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col font-sans">
        <UnifiedHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-md mx-auto">
          <div className="h-16 w-16 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center mx-auto shadow-2xl">
            <img src="/logo-clean.png" alt="LifeLine" className="h-10 w-10 object-contain drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-black text-white tracking-wider">LIFE LINE</h1>
            <p className="text-xs text-zinc-400 font-mono flex items-center justify-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-cyan-400" />
              <span>Checking your session...</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated State (Role-Specific Branded Login UI)
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col font-sans">
        <UnifiedHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6 max-w-md mx-auto w-full">
          <div className={`h-16 w-16 rounded-2xl flex items-center justify-center mx-auto shadow-2xl ${
            isHospitalRoute
              ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-400'
              : 'bg-cyan-950/80 border border-cyan-500/50 text-cyan-400'
          }`}>
            {isHospitalRoute ? (
              <Building2 className="h-8 w-8" />
            ) : (
              <Ambulance className="h-8 w-8" />
            )}
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold bg-zinc-900 px-2.5 py-1 rounded-full border border-zinc-800">
              LIFE LINE PORTAL
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {isHospitalRoute
                ? 'Hospital staff access requires authentication.'
                : isDriverRoute
                ? 'Driver access requires authentication.'
                : 'Workspace access requires authentication.'}
            </h2>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto">
              Please sign in with your verified credentials or continue with a dedicated demo account.
            </p>
          </div>

          <div className="space-y-3 w-full pt-1">
            <button
              onClick={() => openAuthModal(primaryRole)}
              className="w-full py-4 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold text-sm shadow-xl shadow-cyan-600/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <UserCheck className="h-4 w-4" />
              <span>CONTINUE WITH GOOGLE</span>
            </button>

            {isDemoMode && (
              <button
                onClick={handleQuickDemoLogin}
                disabled={isDemoSubmitting}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs flex items-center justify-center gap-2 border border-amber-400/60 shadow-lg shadow-amber-600/20 transition-all active:scale-[0.98]"
              >
                {isDemoSubmitting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-white" />
                    <span>{isHospitalRoute ? 'USE DEMO HOSPITAL' : 'USE DEMO DRIVER'}</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={() => navigate('/')}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white text-xs font-mono font-bold flex items-center justify-center gap-1.5 border border-zinc-800 transition-all"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>RETURN TO LIFE LINE</span>
            </button>
          </div>
        </div>

        <AuthRoleSelectorModal
          isOpen={isAuthModalOpen}
          initialRole={primaryRole}
          onClose={closeAuthModal}
          onAuthSuccess={(verifiedUser) => {
            const token = localStorage.getItem('lifeline_driver_token') || 'll_auth_verified';
            login(verifiedUser, token);
            closeAuthModal();
          }}
        />
      </div>
    );
  }

  // 3. Role Authorization Validation
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col font-sans">
        <UnifiedHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-5 max-w-md mx-auto w-full">
          <div className="h-16 w-16 rounded-2xl bg-amber-950/80 border border-amber-500/50 flex items-center justify-center text-amber-400 mx-auto shadow-xl">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-white">Access Unauthorized for this Role</h2>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Your authenticated account (<span className="font-bold text-white">{user.name}</span>, role: <span className="font-mono text-cyan-400 font-bold">{user.role}</span>) does not have access permissions for this workspace.
            </p>
          </div>
          <div className="space-y-2.5 w-full">
            <button
              onClick={() => openAuthModal(primaryRole)}
              className="w-full py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-lg"
            >
              SWITCH TO AUTHORIZED ROLE
            </button>
            <button
              onClick={() => {
                logout();
                navigate('/');
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold border border-zinc-700 transition-all"
            >
              SIGN OUT
            </button>
          </div>
        </div>

        <AuthRoleSelectorModal
          isOpen={isAuthModalOpen}
          initialRole={primaryRole}
          onClose={closeAuthModal}
          onAuthSuccess={(verifiedUser) => {
            const token = localStorage.getItem('lifeline_driver_token') || 'll_auth_verified';
            login(verifiedUser, token);
            closeAuthModal();
          }}
        />
      </div>
    );
  }

  // 4. Authenticated & Authorized -> Render wrapped in ErrorBoundary
  return (
    <ErrorBoundary fallbackTitle="Something went wrong loading this workspace.">
      <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col font-sans">
        <UnifiedHeader />
        <div className="flex-1 flex flex-col">
          {children}
        </div>
      </div>
    </ErrorBoundary>
  );
};
