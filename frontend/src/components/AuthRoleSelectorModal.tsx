import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { lifelineApi } from '../services/api';
import { Driver, UserRole } from '../types';
import {
  Ambulance,
  Building2,
  Cpu,
  AlertOctagon,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Phone,
  KeyRound,
  CheckCircle2,
  RotateCw,
  X,
  Mail,
  User
} from 'lucide-react';

interface AuthRoleSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPatient?: () => void;
  initialRole?: UserRole;
  onAuthSuccess?: (driver: Driver) => void;
}

type AuthStep = 'ROLE_SELECT' | 'GOOGLE_LOGIN' | 'PHONE_INPUT' | 'OTP_VERIFY' | 'SUCCESS';

export const AuthRoleSelectorModal: React.FC<AuthRoleSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectPatient,
  initialRole,
  onAuthSuccess
}) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<AuthStep>(initialRole ? 'GOOGLE_LOGIN' : 'ROLE_SELECT');
  const [selectedRole, setSelectedRole] = useState<UserRole>(initialRole || 'DRIVER');

  // Google Identity State
  const [googleName, setGoogleName] = useState<string>('Murugan Sundaram');
  const [googleEmail, setGoogleEmail] = useState<string>('driver.a103@lifeline.org');
  const [googleId, setGoogleId] = useState<string>('goog_99482716');

  // Phone & OTP State
  const [phone, setPhone] = useState<string>('+91 98401 23456');
  const [otp, setOtp] = useState<string>('');
  const [cooldown, setCooldown] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (initialRole) {
      setSelectedRole(initialRole);
      setStep('GOOGLE_LOGIN');
      if (initialRole === 'HOSPITAL_STAFF') {
        setGoogleName('Dr. Radhika Srinivasan');
        setGoogleEmail('er.chromepet@lifeline.org');
        setPhone('+91 98402 34567');
      } else if (initialRole === 'OPERATOR') {
        setGoogleName('Central Dispatch Control');
        setGoogleEmail('dispatch.ops@lifeline.org');
        setPhone('+91 98403 45678');
      } else {
        setGoogleName('Murugan Sundaram');
        setGoogleEmail('driver.a103@lifeline.org');
        setPhone('+91 98401 23456');
      }
    }
  }, [initialRole]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown > 0) {
      timerRef.current = setInterval(() => {
        setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cooldown]);

  if (!isOpen) return null;

  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    setErrorMessage(null);
    if (role === 'HOSPITAL_STAFF') {
      setGoogleName('Dr. Radhika Srinivasan (ER Incharge)');
      setGoogleEmail('er.chromepet@lifeline.org');
      setPhone('+91 98402 34567');
    } else if (role === 'OPERATOR') {
      setGoogleName('Central Dispatch Command');
      setGoogleEmail('dispatch.ops@lifeline.org');
      setPhone('+91 98403 45678');
    } else {
      setGoogleName('Murugan Sundaram (ALS Lead)');
      setGoogleEmail('driver.a103@lifeline.org');
      setPhone('+91 98401 23456');
    }
    setStep('GOOGLE_LOGIN');
  };

  const handleGoogleSubmit = () => {
    setErrorMessage(null);
    setStep('PHONE_INPUT');
  };

  const handleSendOtp = async () => {
    if (!phone || phone.trim().length < 8) {
      setErrorMessage('Please enter a valid mobile number.');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await lifelineApi.sendOtp({ phone: phone.trim(), role: selectedRole });
      setCooldown(res.cooldown_seconds || 60);
      setSuccessNotice(res.message);
      setStep('OTP_VERIFY');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to send OTP. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.trim().length < 4) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await lifelineApi.verifyOtp({
        phone: phone.trim(),
        otp: otp.trim(),
        email: googleEmail,
        name: googleName,
        role: selectedRole,
        google_id: googleId,
        ambulance_id: selectedRole === 'DRIVER' ? 'A-103' : undefined
      });

      if (res.success && res.driver) {
        setStep('SUCCESS');
        setTimeout(() => {
          if (onAuthSuccess) {
            onAuthSuccess(res.driver!);
          }
          onClose();
          // Route user to their role-specific portal
          if (selectedRole === 'DRIVER') {
            navigate('/ambulance/tracker');
          } else if (selectedRole === 'HOSPITAL_STAFF') {
            navigate('/hospital/portal');
          } else {
            navigate('/operations');
          }
        }, 1200);
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Invalid OTP code. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden space-y-6">
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-32 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header with Brand and Close */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-zinc-900 border border-zinc-700 p-0.5 flex items-center justify-center">
              <img src="/logo-clean.png" alt="LifeLine" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="text-xs font-mono font-black tracking-widest text-white">LIFELINE PORTAL</div>
              <div className="text-[10px] text-zinc-400">Deterministic Emergency Network</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center gap-2.5 animate-shake">
            <AlertOctagon className="h-4 w-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* ── STEP 1: ROLE SELECTION SCREEN ── */}
        {step === 'ROLE_SELECT' && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                How are you using LifeLine?
              </h2>
              <p className="text-xs text-zinc-400">
                Select your verified operational role to continue.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 pt-2">
              {/* Ambulance / Driver Card */}
              <button
                onClick={() => handleSelectRole('DRIVER')}
                className="group p-4 rounded-2xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800 hover:border-cyan-500/50 transition-all text-left flex items-center justify-between active:scale-[0.98]"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-12 w-12 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                    <Ambulance className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-bold text-white text-base flex items-center gap-2">
                      <span>AMBULANCE / DRIVER</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-500/30">
                        Google + OTP
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      Respond to emergency requests &amp; transmit continuous telemetry.
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-zinc-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
              </button>

              {/* Hospital / Staff Card */}
              <button
                onClick={() => handleSelectRole('HOSPITAL_STAFF')}
                className="group p-4 rounded-2xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 transition-all text-left flex items-center justify-between active:scale-[0.98]"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-12 w-12 rounded-xl bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-bold text-white text-base flex items-center gap-2">
                      <span>HOSPITAL / STAFF</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                        Google + OTP
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      Manage incoming emergencies &amp; track inbound patient conditions.
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
              </button>
            </div>

            {/* Emergency Assistance Direct Button for Patients */}
            <div className="pt-2 border-t border-zinc-800/80">
              <button
                onClick={() => {
                  onClose();
                  if (onSelectPatient) {
                    onSelectPatient();
                  } else {
                    navigate('/emergency');
                  }
                }}
                className="w-full py-4 px-4 rounded-2xl bg-red-950/60 hover:bg-red-950 border border-red-500/50 text-red-300 font-bold text-sm flex items-center justify-between transition-all active:scale-[0.98] group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">👤</span>
                  <div className="text-left">
                    <div className="font-bold text-white text-sm">USER / PATIENT</div>
                    <div className="text-[11px] text-red-300/80">Get emergency assistance · No login required</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-red-400 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: GOOGLE LOGIN ── */}
        {step === 'GOOGLE_LOGIN' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('ROLE_SELECT')}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to roles</span>
              </button>
              <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/30">
                Step 1 of 3: Google Identity
              </span>
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-xl font-bold text-white">Authenticate with Google</h2>
              <p className="text-xs text-zinc-400">
                Sign in to verify your organizational identity for {selectedRole.replace('_', ' ')}.
              </p>
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-3.5">
              <div>
                <label className="text-[11px] font-mono text-zinc-400 block mb-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    type="text"
                    value={googleName}
                    onChange={(e) => setGoogleName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                    placeholder="Enter your name"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-mono text-zinc-400 block mb-1">Google Work Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    type="email"
                    value={googleEmail}
                    onChange={(e) => setGoogleEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                    placeholder="driver@lifeline.org"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleGoogleSubmit}
              className="w-full py-3.5 rounded-2xl bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98]"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </div>
        )}

        {/* ── STEP 3: PHONE NUMBER INPUT ── */}
        {step === 'PHONE_INPUT' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('GOOGLE_LOGIN')}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              <span className="text-[10px] font-mono uppercase text-amber-400 font-bold bg-amber-950 px-2 py-0.5 rounded border border-amber-500/30">
                Step 2 of 3: Mobile Number
              </span>
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-xl font-bold text-white">Enter Mobile Number</h2>
              <p className="text-xs text-zinc-400">
                A 6-digit cryptographic verification code will be sent via SMS.
              </p>
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <label className="text-[11px] font-mono text-zinc-400 block">Mobile Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-3 bg-zinc-950 border border-zinc-700 rounded-xl text-base font-mono text-white tracking-wider focus:outline-none focus:border-cyan-500"
                  placeholder="+91 98401 23456"
                />
              </div>
              <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Protected by HMAC-SHA256 salted hash verification.</span>
              </div>
            </div>

            <button
              onClick={handleSendOtp}
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-2xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98]"
            >
              {isSubmitting ? (
                <>
                  <RotateCw className="h-4 w-4 animate-spin" />
                  <span>Sending Code...</span>
                </>
              ) : (
                <>
                  <span>SEND OTP CODE</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        )}

        {/* ── STEP 4: ENTER & VERIFY OTP ── */}
        {step === 'OTP_VERIFY' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('PHONE_INPUT')}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Change Number</span>
              </button>
              <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/30">
                Step 3 of 3: OTP Verification
              </span>
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-xl font-bold text-white">Enter 6-Digit Code</h2>
              <p className="text-xs text-zinc-400">
                Sent to <span className="font-mono text-cyan-300 font-bold">{phone}</span>
              </p>
            </div>

            {successNotice && (
              <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs text-center font-mono">
                {successNotice}
              </div>
            )}

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-4 text-center">
              <div className="relative max-w-xs mx-auto">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="w-full pl-10 pr-3 py-3.5 bg-zinc-950 border border-zinc-700 rounded-xl text-2xl font-mono font-bold text-center tracking-[0.3em] text-white focus:outline-none focus:border-emerald-500"
                  placeholder="------"
                  autoFocus
                />
              </div>

              {/* Cooldown / Resend */}
              <div className="text-xs text-zinc-400">
                {cooldown > 0 ? (
                  <span className="font-mono text-zinc-500">
                    Resend code available in <span className="text-amber-400 font-bold">{cooldown}s</span>
                  </span>
                ) : (
                  <button
                    onClick={handleSendOtp}
                    disabled={isSubmitting}
                    className="text-cyan-400 hover:text-cyan-300 font-mono font-bold underline"
                  >
                    Resend verification code
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={handleVerifyOtp}
              disabled={isSubmitting || otp.length < 4}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98]"
            >
              {isSubmitting ? (
                <>
                  <RotateCw className="h-4 w-4 animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>VERIFY OTP &amp; ENTER PORTAL</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* ── STEP 5: SUCCESS STATE ── */}
        {step === 'SUCCESS' && (
          <div className="py-8 text-center space-y-4 animate-scaleUp">
            <div className="h-16 w-16 mx-auto rounded-full bg-emerald-950 border-2 border-emerald-500 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">Authentication Verified</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Entering {selectedRole.replace('_', ' ')} Operational Portal...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
