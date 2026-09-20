import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, ShieldAlert, Cpu, History, RefreshCw, PlusCircle, Radio } from 'lucide-react';

interface HeaderProps {
  onResetDemo?: () => void;
  isResetting?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onResetDemo, isResetting }) => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dispatcher Center', icon: Activity },
    { path: '/emergency/new', label: 'New Intake', icon: PlusCircle },
    { path: '/simulation', label: 'Demo Sandbox', icon: Cpu },
    { path: '/history', label: 'Dispatch Log', icon: History },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md px-4 lg:px-6 py-3">
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Brand & Status */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="h-9 w-9 rounded-lg bg-red-600/20 border border-red-500/50 flex items-center justify-center text-red-500 shadow-lg shadow-red-500/10 group-hover:border-red-400 transition-all">
              <Activity className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black tracking-wider text-lg text-white font-mono">LIFELINE</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  DEMO MODE
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 font-medium">Intelligent Emergency Response & Routing</p>
            </div>
          </Link>

          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-950/30 border border-emerald-500/30 text-emerald-400 text-xs">
            <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-400" />
            <span className="font-mono text-[11px] font-semibold">OPS ACTIVE • CHENNAI ZONE</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-zinc-900/90 border border-zinc-800 p-1 rounded-lg">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path === '/' && location.pathname === '/dashboard');
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {onResetDemo && (
            <button
              onClick={onResetDemo}
              disabled={isResetting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-semibold transition-all disabled:opacity-50"
              title="Reset simulated environment and demo scenario"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isResetting ? 'animate-spin text-amber-400' : ''}`} />
              <span className="hidden sm:inline">Reset Demo</span>
            </button>
          )}

          <div className="text-[10px] text-zinc-500 bg-zinc-900/60 border border-zinc-800 px-2 py-1 rounded hidden xl:block">
            * Simulated Hospital & Resource Data
          </div>
        </div>
      </div>
    </header>
  );
};
