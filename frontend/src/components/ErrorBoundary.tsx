import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by LifeLine ErrorBoundary:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  public handleReturnHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="max-w-md w-full p-6 sm:p-8 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-2xl space-y-6">
            <div className="h-16 w-16 rounded-2xl bg-amber-950/80 border border-amber-500/50 flex items-center justify-center text-amber-400 mx-auto shadow-xl animate-pulse">
              <AlertTriangle className="h-8 w-8" />
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold bg-amber-950 px-2.5 py-1 rounded-full border border-amber-500/40">
                Workspace Recovery Mode
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {this.props.fallbackTitle || 'Something went wrong loading this workspace.'}
              </h1>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                An unexpected interface issue occurred. You can safely retry or return to the main LifeLine console.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={this.handleReset}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 active:from-cyan-700 active:to-teal-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-all active:scale-[0.98]"
              >
                <RefreshCw className="h-4 w-4" />
                <span>TRY AGAIN</span>
              </button>

              <button
                onClick={this.handleReturnHome}
                className="w-full py-3 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-zinc-300 font-bold text-xs flex items-center justify-center gap-2 border border-zinc-700 transition-all"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>RETURN TO LIFE LINE</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
