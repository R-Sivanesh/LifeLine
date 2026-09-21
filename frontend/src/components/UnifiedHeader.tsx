import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Ambulance,
  Building2,
  Cpu,
  History,
  LogOut,
  Radio,
  ShieldCheck,
  User,
  ArrowLeft
} from 'lucide-react';

export const UnifiedHeader: React.FC = () => {
  const { user, isAuthenticated, logout, openAuthModal } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = () => {
    logout();
    navigate('/');
  };

  const getRoleMeta = () => {
    if (!user) return { title: 'Emergency Response', badge: 'PUBLIC', badgeClass: 'bg-zinc-900 text-zinc-400 border-zinc-700', color: 'text-red-400' };
    switch (user.role) {
      case 'DRIVER':
        return {
          title: 'Ambulance Driver Portal',
          badge: 'DRIVER',
          badgeClass: 'bg-cyan-950 text-cyan-300 border-cyan-500/40',
          icon: Ambulance
        };
      case 'HOSPITAL_STAFF':
        return {
          title: 'Hospital ER Portal',
          badge: 'HOSPITAL STAFF',
          badgeClass: 'bg-emerald-950 text-emerald-300 border-emerald-500/40',
          icon: Building2
        };
      case 'OPERATOR':
      case 'ADMIN':
        return {
          title: 'Operations Command',
          badge: 'OPS ADMIN',
          badgeClass: 'bg-amber-950 text-amber-300 border-amber-500/40',
          icon: Cpu
        };
      default:
        return {
          title: 'LifeLine Portal',
          badge: 'VERIFIED',
          badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700',
          icon: ShieldCheck
        };
    }
  };

  const roleMeta = getRoleMeta();
  const Icon = roleMeta.icon || ShieldCheck;

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-md sticky top-0 z-30 font-sans">
      <div className="px-4 py-3 flex items-center justify-between gap-3 max-w-6xl mx-auto">
        {/* Brand & Workspace Identity */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="h-9 w-9 rounded-xl bg-zinc-900 border border-zinc-700 p-1 flex items-center justify-center shadow-lg group-hover:border-cyan-500/50 transition-all">
              <img src="/logo-clean.png" alt="LifeLine" className="h-full w-full object-contain drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-sm text-white tracking-wider">LIFELINE</span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${roleMeta.badgeClass}`}>
                  {roleMeta.badge}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 font-sans hidden sm:block">
                {roleMeta.title}
              </div>
            </div>
          </Link>
        </div>

        {/* Role-Aware Navigation Links */}
        <nav className="flex items-center gap-1.5 sm:gap-2">
          {isAuthenticated && user && (
            <>
              {user.role === 'DRIVER' && (
                <Link
                  to="/ambulance/tracker"
                  className={`h-9 px-3 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                    location.pathname.includes('/ambulance')
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-500/50'
                      : 'border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <Radio className="h-3.5 w-3.5" />
                  <span>GPS Tracker</span>
                </Link>
              )}

              {user.role === 'HOSPITAL_STAFF' && (
                <Link
                  to="/hospital/portal"
                  className={`h-9 px-3 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                    location.pathname.includes('/hospital')
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                      : 'border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Inbound ER</span>
                </Link>
              )}

              {(user.role === 'OPERATOR' || user.role === 'ADMIN') && (
                <Link
                  to="/operations"
                  className={`h-9 px-3 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                    location.pathname.includes('/operations')
                      ? 'bg-amber-950 text-amber-300 border-amber-500/50'
                      : 'border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <Cpu className="h-3.5 w-3.5" />
                  <span>Operations</span>
                </Link>
              )}

              <Link
                to="/history"
                className={`h-9 px-3 rounded-xl border text-xs font-mono flex items-center gap-1.5 transition-all ${
                  location.pathname === '/history'
                    ? 'bg-zinc-800 text-white border-zinc-600'
                    : 'border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`}
              >
                <History className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cases</span>
              </Link>

              {/* User Identity Pill */}
              <div className="hidden md:flex items-center gap-2 pl-2 border-l border-zinc-800">
                <div className="text-right">
                  <div className="text-xs font-bold text-white leading-tight truncate max-w-[140px]">{user.name}</div>
                  <div className="text-[10px] font-mono text-zinc-500">{user.phone || user.email}</div>
                </div>
              </div>

              {/* Sign Out Button */}
              <button
                onClick={handleSignOut}
                className="h-9 px-3 rounded-xl bg-zinc-900 hover:bg-red-950 border border-zinc-800 hover:border-red-500/50 text-zinc-400 hover:text-red-300 transition-all text-xs flex items-center gap-1.5"
                title="Sign out of LifeLine"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </>
          )}

          {!isAuthenticated && (
            <>
              <button
                onClick={() => openAuthModal()}
                className="h-9 px-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold font-mono flex items-center gap-1.5 transition-all"
              >
                <User className="h-3.5 w-3.5 text-cyan-400" />
                <span>Portal Login</span>
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};
