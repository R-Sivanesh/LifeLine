import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { UnifiedHeader } from './UnifiedHeader';
import { AuthRoleSelectorModal } from './AuthRoleSelectorModal';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, login, isAuthModalOpen, closeAuthModal, openAuthModal } = useAuth();

  // If not authenticated, open auth modal and render fallback container
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
        <UnifiedHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-5 max-w-md mx-auto">
          <div className="h-16 w-16 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-cyan-400 mx-auto shadow-2xl">
            <img src="/logo-clean.png" alt="LifeLine" className="h-10 w-10 object-contain" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Authentication Required</h2>
            <p className="text-xs text-zinc-400 mt-1">
              Please sign in with your verified Google credentials and Mobile OTP to access this LifeLine workspace.
            </p>
          </div>
          <button
            onClick={() => openAuthModal(allowedRoles ? allowedRoles[0] : undefined)}
            className="w-full py-3.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm shadow-lg transition-all active:scale-[0.98]"
          >
            Authenticate with LifeLine
          </button>
        </div>

        <AuthRoleSelectorModal
          isOpen={true}
          initialRole={allowedRoles ? allowedRoles[0] : undefined}
          onClose={() => {}}
          onAuthSuccess={(verifiedUser) => {
            const token = localStorage.getItem('lifeline_driver_token') || 'll_auth_verified';
            login(verifiedUser, token);
          }}
        />
      </div>
    );
  }

  // Role validation
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
        <UnifiedHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-md mx-auto">
          <div className="text-3xl">⚠️</div>
          <h2 className="text-lg font-bold text-white">Access Unauthorized for this Role</h2>
          <p className="text-xs text-zinc-400">
            Your authenticated account ({user.name}, role: <span className="font-mono text-cyan-400">{user.role}</span>) is not authorized for this specific workspace.
          </p>
          <button
            onClick={() => openAuthModal(allowedRoles[0])}
            className="py-2.5 px-4 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold"
          >
            Switch to Authorized Role
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <UnifiedHeader />
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
};
