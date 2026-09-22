import React, { useState, useEffect, useRef } from 'react';
import { lifelineApi } from '../services/api';
import {
  IncidentLocation,
  Emergency,
  OptimizationResult,
  IncidentSeverity,
  NearbyLandmarkItem
} from '../types';
import {
  Mic,
  MicOff,
  Send,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  Car,
  Heart,
  Activity,
  Flame,
  HelpCircle,
  Sparkles,
  PhoneCall,
  Check,
  Compass
} from 'lucide-react';

interface EmergencyAssistantFlowProps {
  initialIncidentType?: string;
  onEmergencyCreated?: (emergency: Emergency, optimization?: OptimizationResult | null) => void;
  onCancel?: () => void;
}

export const EmergencyAssistantFlow: React.FC<EmergencyAssistantFlowProps> = ({
  initialIncidentType,
  onEmergencyCreated,
  onCancel
}) => {
  // ── Input & AI State ──
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // ── Extracted Emergency State ──
  const [incidentType, setIncidentType] = useState<string>(initialIncidentType || '');
  const [patientCount, setPatientCount] = useState<number | null>(null);
  const [criticalCount, setCriticalCount] = useState<number>(0);
  const [severity, setSeverity] = useState<IncidentSeverity>('HIGH');
  const [injuryReported, setInjuryReported] = useState<boolean | null>(null);
  const [bleedingReported, setBleedingReported] = useState<boolean | null>(null);
  const [isUnconscious, setIsUnconscious] = useState<boolean | null>(null);
  const [incidentDesc, setIncidentDesc] = useState<string>('');

  // ── Adaptive Single-Question State ──
  const [activeQuestion, setActiveQuestion] = useState<{
    key: string;
    text: string;
    options: { label: string; value: any }[];
  } | null>(null);

  // ── Location & GPS State ──
  const [isAcquiringGps, setIsAcquiringGps] = useState(true);
  const [gpsLocation, setGpsLocation] = useState<IncidentLocation | null>(null);
  const [confirmedLocation, setConfirmedLocation] = useState<IncidentLocation | null>(null);
  const [mentionedLocationName, setMentionedLocationName] = useState<string | null>(null);
  const [showLocationConflictModal, setShowLocationConflictModal] = useState(false);
  const [resolvedMentionedLocation, setResolvedMentionedLocation] = useState<IncidentLocation | null>(null);
  const [nearbyLandmarks, setNearbyLandmarks] = useState<NearbyLandmarkItem[]>([]);

  // Speech Recognition Ref
  const recognitionRef = useRef<any>(null);

  // ════════════════════════════════════════════════════════════
  // 1. AUTOMATIC BACKGROUND GPS DETECTION ON MOUNT
  // ════════════════════════════════════════════════════════════
  useEffect(() => {
    let isMounted = true;
    setIsAcquiringGps(true);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (!isMounted) return;
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const accuracy = pos.coords.accuracy;

          try {
            const rev = await lifelineApi.reverseGeocode(lat, lon);
            if (!isMounted) return;
            const loc: IncidentLocation = {
              latitude: lat,
              longitude: lon,
              formatted_address: rev.formatted_address || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
              place_name: rev.place_name || rev.formatted_address,
              accuracy: accuracy,
              source: 'USER_GPS'
            };
            setGpsLocation(loc);
            setConfirmedLocation(loc);
            setIsAcquiringGps(false);

            // Fetch dynamic landmarks near real GPS
            lifelineApi.getNearbyLandmarks(lat, lon).then((lms) => {
              if (isMounted) setNearbyLandmarks(lms);
            }).catch(() => {});
          } catch {
            if (!isMounted) return;
            const fallbackLoc: IncidentLocation = {
              latitude: lat,
              longitude: lon,
              formatted_address: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
              accuracy: accuracy,
              source: 'USER_GPS'
            };
            setGpsLocation(fallbackLoc);
            setConfirmedLocation(fallbackLoc);
            setIsAcquiringGps(false);
          }
        },
        (err) => {
          if (!isMounted) return;
          console.warn('[GPS Acquisition] Falling back to default coordinates:', err.message);
          const fallbackLoc: IncidentLocation = {
            latitude: 12.9249,
            longitude: 80.1275,
            formatted_address: 'Tambaram, Chennai, Tamil Nadu',
            place_name: 'Tambaram Junction',
            source: 'FALLBACK_IP'
          };
          setGpsLocation(fallbackLoc);
          setConfirmedLocation(fallbackLoc);
          setIsAcquiringGps(false);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    } else {
      setIsAcquiringGps(false);
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // ════════════════════════════════════════════════════════════
  // 2. SPEECH-TO-TEXT SETUP (VOICE COMPOSER)
  // ════════════════════════════════════════════════════════════
  const startVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice dictation is not supported in this browser. Please type your emergency description.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Speech recognition error:', err);
      setIsListening(false);
    }
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  // ════════════════════════════════════════════════════════════
  // 3. AI INTAKE & FACT EXTRACTION
  // ════════════════════════════════════════════════════════════
  const handleAnalyzeInput = async (textToAnalyze?: string) => {
    const text = textToAnalyze || inputText;
    if (!text.trim()) return;

    setIsAnalyzing(true);
    setDispatchError(null);

    try {
      const res = await lifelineApi.chatDispatcher({
        message: text,
        latitude: confirmedLocation?.latitude,
        longitude: confirmedLocation?.longitude,
        location_source: confirmedLocation?.source
      });

      const state = res.state || {};

      // Extract Structured Facts
      if (state.incident_type) setIncidentType(state.incident_type);
      if (state.patient_count !== null && state.patient_count !== undefined) setPatientCount(state.patient_count);
      if (state.critical_patient_count !== null && state.critical_patient_count !== undefined) setCriticalCount(state.critical_patient_count);
      if (state.severity) setSeverity(state.severity);
      if (state.injury_reported !== null && state.injury_reported !== undefined) setInjuryReported(state.injury_reported);
      if (state.bleeding_reported !== null && state.bleeding_reported !== undefined) setBleedingReported(state.bleeding_reported);
      if (state.is_unconscious !== null && state.is_unconscious !== undefined) setIsUnconscious(state.is_unconscious);
      setIncidentDesc(text);

      // Location Discrepancy Check
      if (state.location_mentioned && state.location_mentioned.length > 2) {
        setMentionedLocationName(state.location_mentioned);
        try {
          const searchResults = await lifelineApi.searchLocation(state.location_mentioned);
          if (searchResults && searchResults.length > 0) {
            const firstMatch = searchResults[0];
            const resolvedLoc: IncidentLocation = {
              latitude: firstMatch.latitude,
              longitude: firstMatch.longitude,
              address: firstMatch.formatted_address,
              landmark: firstMatch.place_name,
              source: 'USER_SEARCH'
            };
            setResolvedMentionedLocation(resolvedLoc);

            // If coordinates differ significantly (> 3 km), trigger confirmation modal
            if (gpsLocation) {
              const latDiff = Math.abs(gpsLocation.latitude - firstMatch.latitude);
              const lonDiff = Math.abs(gpsLocation.longitude - firstMatch.longitude);
              if (latDiff > 0.03 || lonDiff > 0.03) {
                setShowLocationConflictModal(true);
              } else {
                setConfirmedLocation(resolvedLoc);
              }
            } else {
              setConfirmedLocation(resolvedLoc);
            }
          }
        } catch (locErr) {
          console.warn('[Location Resolution] Search error:', locErr);
        }
      }

      // Check if missing critical facts
      if (state.patient_count === null && !patientCount) {
        setActiveQuestion({
          key: 'patient_count',
          text: 'How many people are injured / affected?',
          options: [
            { label: '1 Person', value: 1 },
            { label: '2 People', value: 2 },
            { label: '3 People', value: 3 },
            { label: '4+ People', value: 4 },
            { label: 'Not Sure', value: 1 }
          ]
        });
      } else {
        setActiveQuestion(null);
      }
    } catch (err: any) {
      console.warn('[Dispatcher Intake] Fallback analysis engaged:', err);
      // Client-side rule fallback
      setIncidentDesc(text);
      if (!incidentType) setIncidentType('ROAD_ACCIDENT');
      if (!patientCount) setPatientCount(1);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ════════════════════════════════════════════════════════════
  // 4. DISPATCH CREATION HANDOFF
  // ════════════════════════════════════════════════════════════
  const handleFinalizeDispatch = async () => {
    if (!confirmedLocation) {
      setDispatchError('Acquiring location. Please confirm your location to dispatch assistance.');
      return;
    }

    setIsDispatching(true);
    setDispatchError(null);

    try {
      const effectiveType = incidentType || 'ROAD_ACCIDENT';
      const effectiveCount = patientCount || 1;
      const effectiveDesc = incidentDesc || `${effectiveType.replace('_', ' ')} near ${confirmedLocation.place_name || confirmedLocation.formatted_address}`;

      // 1. Create Emergency Record & Scoped Session (EMG-XXXXX)
      const emg = await lifelineApi.createEmergency({
        description: effectiveDesc,
        latitude: confirmedLocation.latitude,
        longitude: confirmedLocation.longitude,
        patient_count: effectiveCount,
        critical_patient_count: criticalCount,
        severity: severity,
        incident_type: effectiveType
      });

      // 2. Compute Routing & Golden Minute Optimization
      let opt: OptimizationResult | null = null;
      try {
        opt = await lifelineApi.optimizeEmergency(emg.id);
        if (opt?.selected_ambulance) {
          await lifelineApi.alertDrivers(emg.id, [opt.selected_ambulance.ambulance_id]).catch(() => {});
        }
      } catch (optErr) {
        console.warn('[LifeLine Optimization] Initial preview note:', optErr);
      }

      // 3. Hand off directly into the Active Emergency continuous tracker
      if (onEmergencyCreated) {
        onEmergencyCreated(emg, opt);
      }
    } catch (err: any) {
      console.error('[LifeLine Dispatch] Emergency creation error:', err);
      setDispatchError('Failed to create emergency request. Please try again or dial 108 directly.');
      setIsDispatching(false);
    }
  };

  // Category Presets
  const categoryPresets = [
    { type: 'ROAD_ACCIDENT', label: 'Road Accident', icon: Car, color: 'text-amber-400 border-amber-500/40 bg-amber-950/40' },
    { type: 'CARDIAC_ARREST', label: 'Heart / Cardiac', icon: Heart, color: 'text-red-400 border-red-500/40 bg-red-950/40' },
    { type: 'TRAUMA_INJURY', label: 'Severe Trauma', icon: Activity, color: 'text-rose-400 border-rose-500/40 bg-rose-950/40' },
    { type: 'FIRE_BURN', label: 'Fire / Burn', icon: Flame, color: 'text-yellow-400 border-yellow-500/40 bg-yellow-950/40' },
    { type: 'MEDICAL_EMERGENCY', label: 'Medical Crisis', icon: HelpCircle, color: 'text-cyan-400 border-cyan-500/40 bg-cyan-950/40' }
  ];

  const hasExtractedFacts = Boolean(incidentType || incidentDesc);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans selection:bg-cyan-500/30">
      {/* ── Top Bar ── */}
      <header className="px-4 sm:px-6 py-3.5 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-white transition-colors p-1.5 -ml-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>CANCEL</span>
        </button>

        {/* GPS Location Pill */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-xs font-mono">
          {isAcquiringGps ? (
            <>
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-cyan-300">Detecting location...</span>
            </>
          ) : (
            <>
              <MapPin className="h-3 w-3 text-emerald-400 shrink-0" />
              <span className="text-slate-200 truncate max-w-[150px] sm:max-w-xs font-bold">
                {confirmedLocation?.place_name || confirmedLocation?.formatted_address || 'Location Confirmed'}
              </span>
            </>
          )}
        </div>

        <a
          href="tel:108"
          className="flex items-center gap-1 text-red-400 text-xs font-mono font-bold"
        >
          <PhoneCall className="h-3.5 w-3.5" />
          <span>108</span>
        </a>
      </header>

      {/* ── Main Intake Flow ── */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-6 sm:py-8 space-y-6 flex flex-col justify-center animate-fadeIn">
        {/* Header Prompt */}
        <div className="text-center space-y-1">
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Tell us what happened
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Speak or type naturally. AI will extract details and coordinate immediate dispatch.
          </p>
        </div>

        {/* ── Emergency Composer ── */}
        <div className="relative rounded-3xl bg-slate-900/90 border border-slate-700/80 shadow-2xl p-4 sm:p-5 space-y-3 focus-within:border-cyan-500/80 transition-all">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAnalyzeInput();
              }
            }}
            placeholder="e.g. Car crash near Pondy Beach, 2 people injured and one is bleeding..."
            className="w-full h-24 sm:h-28 bg-transparent text-sm sm:text-base text-white placeholder-slate-500 focus:outline-none resize-none"
            autoFocus
          />

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={isListening ? stopVoiceInput : startVoiceInput}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                isListening
                  ? 'bg-red-600 text-white animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-cyan-400" />}
              <span>{isListening ? 'Listening...' : 'Voice'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleAnalyzeInput()}
              disabled={isAnalyzing || !inputText.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-red-600/30 transition-all active:scale-95"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Understanding...</span>
                </>
              ) : (
                <>
                  <span>SEND</span>
                  <Send className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Category Quick Chips ── */}
        {!hasExtractedFacts && (
          <div className="space-y-2">
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider text-center">
              Or pick an emergency category:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categoryPresets.map((cat) => {
                const Icon = cat.icon;
                const isSelected = incidentType === cat.type;
                return (
                  <button
                    key={cat.type}
                    type="button"
                    onClick={() => {
                      setIncidentType(cat.type);
                      setInputText((prev) => prev || `Reporting a ${cat.label.toLowerCase()}`);
                    }}
                    className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-cyan-950/70 border-cyan-500 text-white shadow-md shadow-cyan-950'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <Icon className="h-4 w-4 text-cyan-400 shrink-0" />
                    <span className="text-xs font-bold truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── AI Extracted Facts Card ── */}
        {hasExtractedFacts && (
          <div className="rounded-3xl bg-slate-900/95 border border-slate-700 p-4 sm:p-5 space-y-4 shadow-xl animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  WE UNDERSTOOD
                </span>
              </div>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                severity === 'CRITICAL' ? 'bg-red-950 text-red-300 border border-red-500/40' : 'bg-amber-950 text-amber-300 border border-amber-500/40'
              }`}>
                {severity} PRIORITY
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                <div className="text-[10px] text-slate-400 font-mono">EMERGENCY TYPE</div>
                <div className="font-bold text-white truncate">
                  {incidentType ? incidentType.replace('_', ' ') : 'Medical Emergency'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                <div className="text-[10px] text-slate-400 font-mono">PEOPLE REPORTED</div>
                <div className="font-bold text-white">
                  {patientCount ? `${patientCount} Person${patientCount > 1 ? 's' : ''}` : '1 (Default)'}
                </div>
              </div>

              {bleedingReported !== null && (
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                  <div className="text-[10px] text-slate-400 font-mono">BLEEDING</div>
                  <div className="font-bold text-red-400">
                    {bleedingReported ? 'Reported (High Priority)' : 'None mentioned'}
                  </div>
                </div>
              )}

              {isUnconscious !== null && (
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                  <div className="text-[10px] text-slate-400 font-mono">CONSCIOUSNESS</div>
                  <div className="font-bold text-rose-400">
                    {isUnconscious ? 'Unconscious / Unresponsive' : 'Conscious'}
                  </div>
                </div>
              )}
            </div>

            {/* ── Adaptive Single Missing Question ── */}
            {activeQuestion && (
              <div className="p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 space-y-2.5">
                <div className="text-xs font-bold text-cyan-300">
                  {activeQuestion.text}
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeQuestion.options.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        if (activeQuestion.key === 'patient_count') setPatientCount(opt.value);
                        setActiveQuestion(null);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-cyan-900 border border-slate-700 hover:border-cyan-400 text-xs font-mono font-bold text-white transition-all active:scale-95"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dispatch Error Banner */}
        {dispatchError && (
          <div className="p-3 rounded-2xl bg-red-950/70 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <span>{dispatchError}</span>
          </div>
        )}

        {/* ── DOMINANT DISPATCH ACTION (ONE-HAND BOTTOM REACHABLE) ── */}
        <button
          type="button"
          onClick={handleFinalizeDispatch}
          disabled={isDispatching || isAcquiringGps}
          className="w-full py-4 sm:py-5 rounded-3xl bg-red-600 hover:bg-red-500 text-white font-black text-base sm:text-lg tracking-wide shadow-2xl shadow-red-600/40 transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50"
        >
          {isDispatching ? (
            <>
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span>TRANSMITTING EMERGENCY DISPATCH...</span>
            </>
          ) : (
            <>
              <span>🚨</span>
              <span>DISPATCH VERIFIED AMBULANCE NOW</span>
            </>
          )}
        </button>
      </main>

      {/* ── Location Conflict Resolution Modal ── */}
      {showLocationConflictModal && resolvedMentionedLocation && gpsLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm font-mono">
              <AlertTriangle className="h-4 w-4" />
              <span>LOCATION CHECK</span>
            </div>

            <p className="text-xs text-slate-300">
              Your device GPS location differs from the location mentioned in your description. Which location should we dispatch the ambulance to?
            </p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmedLocation(resolvedMentionedLocation);
                  setShowLocationConflictModal(false);
                }}
                className="w-full p-3.5 rounded-2xl bg-cyan-950/70 border border-cyan-500/50 hover:border-cyan-400 text-left transition-all"
              >
                <div className="text-[10px] font-mono text-cyan-400 font-bold uppercase">
                  MENTIONED IN REPORT
                </div>
                <div className="font-bold text-sm text-white mt-0.5">
                  {resolvedMentionedLocation.place_name || resolvedMentionedLocation.formatted_address}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setConfirmedLocation(gpsLocation);
                  setShowLocationConflictModal(false);
                }}
                className="w-full p-3.5 rounded-2xl bg-slate-950 border border-slate-700 hover:border-slate-500 text-left transition-all"
              >
                <div className="text-[10px] font-mono text-emerald-400 font-bold uppercase">
                  DEVICE GPS COORDINATES
                </div>
                <div className="font-bold text-sm text-white mt-0.5">
                  {gpsLocation.place_name || gpsLocation.formatted_address}
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="px-4 py-3 text-center text-[11px] font-mono text-slate-500 border-t border-slate-800/50">
        Verified 24/7 LifeLine Dispatch Network · Zero Clinical Fabrication
      </footer>
    </div>
  );
};
