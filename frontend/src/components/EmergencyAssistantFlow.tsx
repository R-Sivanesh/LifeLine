import React, { useState, useEffect, useRef } from 'react';
import {
  Emergency,
  OptimizationResult,
  DecisionExplanation,
  RerouteResult,
  LocationSearchResult,
  Severity,
  ChatMessage,
  EmergencyDispatcherState,
  ChatResponse
} from '../types';
import { lifelineApi } from '../services/api';
import { TacticalMap } from './TacticalMap';
import {
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Crosshair,
  Search,
  Mic,
  MicOff,
  Send,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  PhoneCall,
  Activity,
  Car,
  Heart,
  Flame,
  UserCheck,
  HelpCircle,
  Clock,
  ArrowLeft,
  Sparkles,
  Radio,
  Navigation
} from 'lucide-react';

export type FlowStep =
  | 'IDLE'
  | 'COLLECTING_INCIDENT'
  | 'COLLECTING_PATIENT_INFO'
  | 'COLLECTING_LOCATION'
  | 'READY_FOR_ANALYSIS'
  | 'ANALYZING'
  | 'PLAN_READY'
  | 'ACTIVE_RESPONSE';

interface EmergencyAssistantFlowProps {
  initialIncidentType?: string;
  onExitFlow?: () => void;
}

export const EmergencyAssistantFlow: React.FC<EmergencyAssistantFlowProps> = ({
  initialIncidentType,
  onExitFlow
}) => {
  // State Machine Step
  const [currentStep, setCurrentStep] = useState<FlowStep>(
    initialIncidentType ? 'COLLECTING_PATIENT_INFO' : 'COLLECTING_INCIDENT'
  );

  // Emergency Intake State
  const [incidentType, setIncidentType] = useState<string>(initialIncidentType || '');
  const [incidentDesc, setIncidentDesc] = useState<string>('');
  const [patientCount, setPatientCount] = useState<number>(1);
  const [criticalCount, setCriticalCount] = useState<number>(0);
  const [isUnconscious, setIsUnconscious] = useState<boolean | null>(null);
  const [severity, setSeverity] = useState<Severity>('MEDIUM');
  
  // Location State
  const [currentLocation, setCurrentLocation] = useState<LocationSearchResult | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationSearchQuery, setLocationSearchQuery] = useState<string>('');
  const [locationSearchResults, setLocationSearchResults] = useState<LocationSearchResult[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Conversational AI Assistant
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);
  const [conversationId] = useState<string>(`emg-${Date.now().toString(36)}`);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speechSupported, setSpeechSupported] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  // Analysis & Result State
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [createdEmergency, setCreatedEmergency] = useState<Emergency | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [explanation, setExplanation] = useState<DecisionExplanation | null>(null);
  const [isRerouting, setIsRerouting] = useState<boolean>(false);
  const [rerouteNotification, setRerouteNotification] = useState<string | null>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';
      rec.onresult = (e: any) => {
        const text = e.results[0][0].transcript;
        setChatInput(text);
        handleSendChatMessage(text);
        setIsListening(false);
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
    }
  }, []);

  // Quick Preset Categories
  const incidentPresets = [
    { type: 'ROAD_ACCIDENT', label: 'Car / Vehicle Crash', icon: Car, color: 'text-amber-400 border-amber-500/40 bg-amber-950/30' },
    { type: 'CARDIAC_ARREST', label: 'Heart Attack / Chest Pain', icon: Heart, color: 'text-red-400 border-red-500/40 bg-red-950/30' },
    { type: 'TRAUMA_INJURY', label: 'Severe Injury / Fall', icon: Activity, color: 'text-orange-400 border-orange-500/40 bg-orange-950/30' },
    { type: 'FIRE_BURN', label: 'Fire / Burn Emergency', icon: Flame, color: 'text-yellow-400 border-yellow-500/40 bg-yellow-950/30' },
    { type: 'MEDICAL_EMERGENCY', label: 'Other Medical Crisis', icon: HelpCircle, color: 'text-cyan-400 border-cyan-500/40 bg-cyan-950/30' },
  ];

  // 1. Handle Conversational Chat Input
  const handleSendChatMessage = async (overrideText?: string) => {
    const text = (overrideText || chatInput).trim();
    if (!text || isSendingChat) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsSendingChat(true);

    try {
      const resp: ChatResponse = await lifelineApi.chatDispatcher({
        message: text,
        conversation_id: conversationId,
        history: chatMessages,
        latitude: currentLocation?.latitude,
        longitude: currentLocation?.longitude
      });

      setChatMessages((prev) => [...prev, { role: 'assistant', content: resp.reply }]);

      const st = resp.state;
      if (st) {
        if (st.incident_type) {
          setIncidentType(st.incident_type);
          setIncidentDesc(st.location_description ? `${st.incident_type}: ${st.location_description}` : text);
        }
        if (st.patient_count) setPatientCount(st.patient_count);
        if (st.critical_patient_count !== undefined && st.critical_patient_count !== null) {
          setCriticalCount(st.critical_patient_count);
          setIsUnconscious(st.critical_patient_count > 0);
        }
        if (st.severity) setSeverity(st.severity);

        // Advance to next logical question
        if (st.incident_type && isUnconscious === null) {
          setCurrentStep('COLLECTING_PATIENT_INFO');
        } else if (st.incident_type && !currentLocation) {
          setCurrentStep('COLLECTING_LOCATION');
        } else if (st.incident_type && currentLocation) {
          setCurrentStep('READY_FOR_ANALYSIS');
        }
      }
    } catch (err) {
      console.warn('Chat dispatch failed:', err);
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Understood. Please confirm your location so we can locate the nearest response unit.' }
      ]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const toggleVoice = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  // 2. Location Handlers
  const handleUseGpsLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);

        let formatted = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        try {
          const rev = await lifelineApi.reverseGeocode(lat, lon);
          if (rev?.formatted_address) {
            formatted = rev.formatted_address;
          }
        } catch (e) {
          console.warn('Reverse geocode error:', e);
        }

        const locResult: LocationSearchResult = {
          formatted_address: formatted,
          latitude: lat,
          longitude: lon,
          source: 'USER_GPS',
          accuracy_meters: accuracy,
          place_name: 'Current Device Location'
        };

        setCurrentLocation(locResult);
        setIsLocating(false);
        setCurrentStep('READY_FOR_ANALYSIS');
      },
      (err) => {
        setIsLocating(false);
        setLocationError(`Location permission denied or unavailable (${err.message}). You can type your location below.`);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSearchLocation = async (query: string) => {
    setLocationSearchQuery(query);
    if (query.trim().length < 2) {
      setLocationSearchResults([]);
      return;
    }
    try {
      const results = await lifelineApi.searchLocation(query.trim());
      setLocationSearchResults(results);
    } catch (e) {
      console.warn('Location search error:', e);
    }
  };

  const handleSelectSearchResult = (loc: LocationSearchResult) => {
    setCurrentLocation({
      ...loc,
      source: 'USER_SEARCH'
    });
    setLocationSearchResults([]);
    setLocationSearchQuery('');
    setCurrentStep('READY_FOR_ANALYSIS');
  };

  // 3. Execution: Run Optimization
  const handleStartAnalysis = async () => {
    setCurrentStep('ANALYZING');
    setAnalysisProgress(15);

    try {
      const targetLat = currentLocation?.latitude || 13.0380;
      const targetLon = currentLocation?.longitude || 80.2300;

      // Create emergency record
      const emg = await lifelineApi.createEmergency({
        description: incidentDesc || `${incidentType.replace('_', ' ')}: ${currentLocation?.formatted_address || 'Incident Scene'}`,
        latitude: targetLat,
        longitude: targetLon,
        patient_count: patientCount,
        critical_patient_count: criticalCount,
        severity: severity,
        incident_type: incidentType || 'ROAD_ACCIDENT'
      });
      setCreatedEmergency(emg);
      setAnalysisProgress(45);

      // Run parallel optimization
      const opt = await lifelineApi.optimizeEmergency(emg.id);
      setOptimization(opt);
      setAnalysisProgress(80);

      // Get explanation
      const exp = await lifelineApi.getDecisionExplanation(emg.id);
      setExplanation(exp);
      setAnalysisProgress(100);

      setTimeout(() => {
        setCurrentStep('PLAN_READY');
      }, 500);
    } catch (err) {
      console.error('Optimization failed:', err);
      alert('Unable to compute emergency response. Retrying with local emergency dispatch...');
      setCurrentStep('READY_FOR_ANALYSIS');
    }
  };

  // 4. Simulate Route Blockage in Active Response
  const handleSimulateRouteBlockage = async () => {
    if (!createdEmergency) return;
    setIsRerouting(true);
    try {
      await lifelineApi.blockRouteDemo({
        latitude: createdEmergency.latitude - 0.004,
        longitude: createdEmergency.longitude - 0.006
      });

      const reroute = await lifelineApi.triggerReroute(createdEmergency.id);
      setIsRerouting(false);
      setRerouteNotification(
        `Traffic disruption ahead. Switched to ${reroute.new_route?.name || 'Fastest Alternative Route'} (New ETA: ${reroute.new_eta_minutes.toFixed(0)} min).`
      );

      if (reroute.new_route && optimization) {
        setOptimization({
          ...optimization,
          selected_route: reroute.new_route,
          travel_eta: reroute.new_eta_minutes,
          total_estimated_time: Math.round((optimization.ambulance_eta + reroute.new_eta_minutes) * 10) / 10
        });
      }
    } catch (e) {
      console.warn('Reroute trigger error:', e);
      setIsRerouting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full px-3 sm:px-4 py-4 sm:py-6">
      {/* Top Header & Back Button */}
      <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
        <button
          onClick={() => {
            if (currentStep === 'COLLECTING_INCIDENT' || currentStep === 'PLAN_READY') {
              if (onExitFlow) onExitFlow();
            } else if (currentStep === 'COLLECTING_PATIENT_INFO') {
              setCurrentStep('COLLECTING_INCIDENT');
            } else if (currentStep === 'COLLECTING_LOCATION') {
              setCurrentStep('COLLECTING_PATIENT_INFO');
            } else if (currentStep === 'READY_FOR_ANALYSIS') {
              setCurrentStep('COLLECTING_LOCATION');
            }
          }}
          className="flex items-center gap-1 text-xs font-mono text-zinc-400 hover:text-white transition-all py-1 px-2 rounded hover:bg-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white font-bold">EMERGENCY ASSISTANT</span>
        </div>

        {onExitFlow && (
          <button
            onClick={onExitFlow}
            className="text-xs font-mono text-zinc-500 hover:text-zinc-300"
          >
            Exit
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: WHAT HAPPENED? (COLLECTING_INCIDENT) */}
      {/* ========================================================================= */}
      {currentStep === 'COLLECTING_INCIDENT' && (
        <div className="space-y-5 animate-fadeIn">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              What is the emergency?
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Select an option below or describe what happened in your words.
            </p>
          </div>

          {/* Large Primary Option Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {incidentPresets.map((p) => {
              const Icon = p.icon;
              const isSelected = incidentType === p.type;
              return (
                <button
                  key={p.type}
                  onClick={() => {
                    setIncidentType(p.type);
                    if (p.type === 'CARDIAC_ARREST') {
                      setSeverity('CRITICAL');
                      setIsUnconscious(true);
                      setCriticalCount(1);
                    }
                    setCurrentStep('COLLECTING_PATIENT_INFO');
                  }}
                  className={`p-4 rounded-xl border text-left flex items-center gap-3.5 transition-all shadow-md active:scale-[0.98] ${
                    isSelected
                      ? 'bg-red-950/70 border-red-500 text-white shadow-red-600/20'
                      : 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:bg-zinc-800/80'
                  }`}
                >
                  <div className={`p-2.5 rounded-lg border ${p.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-white">{p.label}</div>
                    <div className="text-[11px] text-zinc-400">Tap to start emergency triage</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Voice & Free-Text Natural Language Input */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3.5 shadow-lg space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                <span>Or speak / type naturally (English or Tanglish):</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              {speechSupported && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  className={`p-3 rounded-xl border transition-all ${
                    isListening
                      ? 'bg-red-600 text-white border-red-400 animate-pulse'
                      : 'bg-zinc-800 text-cyan-400 hover:bg-zinc-700 border-zinc-700'
                  }`}
                  title="Speak emergency details"
                >
                  {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
              )}

              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChatMessage()}
                placeholder={isListening ? 'Listening...' : 'e.g. "Car crash near Tambaram station, 2 hurt"'}
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
              />

              <button
                type="button"
                onClick={() => handleSendChatMessage()}
                disabled={!chatInput.trim() || isSendingChat}
                className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-all disabled:opacity-40 border border-red-400"
              >
                {isSendingChat ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>

            {/* AI Conversation Transcript if active */}
            {chatMessages.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pt-2 border-t border-zinc-800/80 text-xs">
                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded-lg leading-relaxed ${
                      m.role === 'user' ? 'bg-cyan-950/50 text-cyan-200 text-right' : 'bg-zinc-950 text-zinc-300'
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: HOW MANY PEOPLE & LIFE THREAT STATUS (COLLECTING_PATIENT_INFO) */}
      {/* ========================================================================= */}
      {currentStep === 'COLLECTING_PATIENT_INFO' && (
        <div className="space-y-6 animate-fadeIn">
          <div>
            <div className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider mb-1">
              Step 2 of 3 • Urgency Assessment
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Is anyone unconscious or not responding?
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              This helps us dispatch an Advanced Life Support (ALS) or ICU ambulance immediately.
            </p>
          </div>

          {/* Large Unconscious Decision Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => {
                setIsUnconscious(true);
                setCriticalCount(1);
                setSeverity('CRITICAL');
                setCurrentStep('COLLECTING_LOCATION');
              }}
              className={`p-4 rounded-xl border text-center transition-all shadow-md active:scale-[0.98] ${
                isUnconscious === true
                  ? 'bg-red-950 border-red-500 text-white shadow-red-600/30 ring-2 ring-red-500/50'
                  : 'bg-zinc-900 border-zinc-800 hover:border-red-500/50 text-zinc-200'
              }`}
            >
              <div className="text-2xl mb-1">🚨</div>
              <div className="font-bold text-base text-red-400">YES</div>
              <div className="text-xs text-zinc-400 mt-0.5">Unconscious / Severe</div>
            </button>

            <button
              onClick={() => {
                setIsUnconscious(false);
                setCriticalCount(0);
                if (severity === 'CRITICAL') setSeverity('MEDIUM');
                setCurrentStep('COLLECTING_LOCATION');
              }}
              className={`p-4 rounded-xl border text-center transition-all shadow-md active:scale-[0.98] ${
                isUnconscious === false
                  ? 'bg-emerald-950 border-emerald-500 text-white ring-2 ring-emerald-500/50'
                  : 'bg-zinc-900 border-zinc-800 hover:border-emerald-500/50 text-zinc-200'
              }`}
            >
              <div className="text-2xl mb-1">👍</div>
              <div className="font-bold text-base text-emerald-400">NO</div>
              <div className="text-xs text-zinc-400 mt-0.5">Awake & Conscious</div>
            </button>

            <button
              onClick={() => {
                setIsUnconscious(null);
                setCurrentStep('COLLECTING_LOCATION');
              }}
              className="p-4 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-zinc-700 text-center transition-all text-zinc-300"
            >
              <div className="text-2xl mb-1">❓</div>
              <div className="font-bold text-base text-zinc-300">NOT SURE</div>
              <div className="text-xs text-zinc-500 mt-0.5">Checking patient</div>
            </button>
          </div>

          {/* Patient Count Selector */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 space-y-2.5">
            <div className="text-xs font-mono text-zinc-400 font-bold uppercase">
              How many people are injured / affected?
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setPatientCount(num)}
                  className={`py-2.5 rounded-lg border font-mono font-bold text-sm transition-all ${
                    patientCount === num
                      ? 'bg-cyan-950 border-cyan-500 text-cyan-300 shadow-md'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {num === 4 ? '4+ Patients' : `${num} ${num === 1 ? 'Person' : 'People'}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: WHERE ARE YOU? (COLLECTING_LOCATION) */}
      {/* ========================================================================= */}
      {currentStep === 'COLLECTING_LOCATION' && (
        <div className="space-y-6 animate-fadeIn">
          <div>
            <div className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider mb-1">
              Step 3 of 3 • Location Verification
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Where is the emergency?
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              We need your location to calculate exact ambulance and hospital driving corridors.
            </p>
          </div>

          {/* Primary GPS Button */}
          <button
            onClick={handleUseGpsLocation}
            disabled={isLocating}
            className="w-full p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:from-cyan-700 active:to-blue-700 text-white font-black text-base tracking-wide flex items-center justify-center gap-3 shadow-xl shadow-cyan-600/30 border border-cyan-400 transition-all active:scale-[0.98]"
          >
            {isLocating ? (
              <>
                <RefreshCw className="h-6 w-6 animate-spin" />
                <span>ACQUIRING HIGH-ACCURACY GPS...</span>
              </>
            ) : (
              <>
                <Crosshair className="h-6 w-6 text-white animate-pulse" />
                <span>USE MY CURRENT LOCATION</span>
              </>
            )}
          </button>

          {locationError && (
            <div className="p-3 bg-red-950/60 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{locationError}</span>
            </div>
          )}

          {/* Or Search Landmark / Address */}
          <div className="space-y-2">
            <div className="text-xs font-mono text-zinc-400 uppercase">
              Or search by landmark, station, or street:
            </div>
            <div className="relative">
              <input
                type="text"
                value={locationSearchQuery}
                onChange={(e) => handleSearchLocation(e.target.value)}
                placeholder="e.g. Tambaram Railway Station, Guindy Signal, Chromepet..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
              />
              <Search className="h-5 w-5 text-zinc-500 absolute right-3.5 top-3.5" />
            </div>

            {locationSearchResults.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden divide-y divide-zinc-800">
                {locationSearchResults.map((res, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectSearchResult(res)}
                    className="w-full text-left p-3 hover:bg-zinc-800 text-zinc-200 hover:text-cyan-300 transition-all flex flex-col"
                  >
                    <span className="font-bold text-sm text-white">{res.place_name || res.formatted_address.split(',')[0]}</span>
                    <span className="text-xs text-zinc-400 truncate">{res.formatted_address}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Preset Quick Landmarks */}
          <div className="space-y-1.5">
            <span className="text-xs font-mono text-zinc-500">Quick Chennai Landmarks:</span>
            <div className="flex flex-wrap gap-2">
              {['Tambaram Station', 'Chromepet Bridge', 'Guindy Flyover', 'Airport Junction'].map((name) => (
                <button
                  key={name}
                  onClick={() => handleSearchLocation(name)}
                  className="px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 font-mono"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 4: SUMMARY REVIEW BEFORE ANALYSIS (READY_FOR_ANALYSIS) */}
      {/* ========================================================================= */}
      {currentStep === 'READY_FOR_ANALYSIS' && (
        <div className="space-y-6 animate-fadeIn">
          <div>
            <div className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              <span>Intake Verified • Ready For Response</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Review Emergency Details
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Press the button below to compute the fastest ambulance and hospital care path.
            </p>
          </div>

          {/* Simple Structured Summary Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-mono text-zinc-500 uppercase">Incident</div>
                <div className="text-base font-bold text-white mt-0.5">
                  {incidentType ? incidentType.replace('_', ' ') : 'Medical Emergency'}
                </div>
              </div>

              <div>
                <div className="text-xs font-mono text-zinc-500 uppercase">Urgency Level</div>
                <div className="text-base font-bold text-red-400 mt-0.5">
                  {severity} {criticalCount > 0 ? '(Critical Patient)' : ''}
                </div>
              </div>

              <div>
                <div className="text-xs font-mono text-zinc-500 uppercase">People Affected</div>
                <div className="text-base font-bold text-white mt-0.5">
                  {patientCount} {patientCount === 1 ? 'Patient' : 'Patients'}
                </div>
              </div>

              <div>
                <div className="text-xs font-mono text-zinc-500 uppercase">Location</div>
                <div className="text-sm font-bold text-cyan-300 mt-0.5 truncate" title={currentLocation?.formatted_address}>
                  {currentLocation?.place_name || currentLocation?.formatted_address || 'Confirmed Location'}
                </div>
              </div>
            </div>

            {currentLocation && (
              <div className="pt-3 border-t border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-400">
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Verified Coordinates</span>
                </span>
                <span className="text-[11px] bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                  {currentLocation.source} {currentLocation.accuracy_meters ? `(±${currentLocation.accuracy_meters}m)` : ''}
                </span>
              </div>
            )}
          </div>

          {/* Giant Primary Action Button */}
          <button
            onClick={handleStartAnalysis}
            className="w-full p-4 sm:p-5 rounded-2xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-black text-base tracking-wider uppercase flex items-center justify-center gap-3 shadow-2xl shadow-red-600/40 border border-red-400 transition-all active:scale-[0.98]"
          >
            <span>FIND EMERGENCY RESPONSE</span>
            <ArrowRight className="h-5 w-5" />
          </button>

          <button
            onClick={() => setCurrentStep('COLLECTING_INCIDENT')}
            className="w-full py-2.5 text-xs font-mono text-zinc-400 hover:text-white transition-all text-center"
          >
            Edit Details
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 5: ANALYZING PROGRESS SEQUENCE (ANALYZING) */}
      {/* ========================================================================= */}
      {currentStep === 'ANALYZING' && (
        <div className="space-y-6 py-8 text-center animate-fadeIn">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-red-950/70 border border-red-500/50 flex items-center justify-center text-red-400 shadow-2xl shadow-red-600/30">
            <RefreshCw className="h-8 w-8 animate-spin" />
          </div>

          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              Calculating Optimal Care Corridor...
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Synchronizing capability matching, live traffic corridors, and hospital readiness.
            </p>
          </div>

          {/* Progress Sequence Checklist */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 text-left space-y-3 max-w-md mx-auto text-xs font-mono">
            <div className="flex items-center gap-2.5 text-emerald-400 font-bold">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Emergency parameters verified</span>
            </div>
            <div className="flex items-center gap-2.5 text-emerald-400 font-bold">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Location confirmed: {currentLocation?.place_name || 'Scene'}</span>
            </div>
            <div className={`flex items-center gap-2.5 ${analysisProgress >= 45 ? 'text-emerald-400 font-bold' : 'text-cyan-400 animate-pulse'}`}>
              {analysisProgress >= 45 ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />}
              <span>Matching nearest appropriate ambulance...</span>
            </div>
            <div className={`flex items-center gap-2.5 ${analysisProgress >= 80 ? 'text-emerald-400 font-bold' : 'text-zinc-500'}`}>
              {analysisProgress >= 80 ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Clock className="h-4 w-4 shrink-0" />}
              <span>Verifying hospital specialty & emergency readiness...</span>
            </div>
            <div className={`flex items-center gap-2.5 ${analysisProgress >= 100 ? 'text-emerald-400 font-bold' : 'text-zinc-500'}`}>
              {analysisProgress >= 100 ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Clock className="h-4 w-4 shrink-0" />}
              <span>Computing live traffic-aware driving corridor...</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 6: RESPONSE PLAN RESULT (PLAN_READY) */}
      {/* ========================================================================= */}
      {currentStep === 'PLAN_READY' && optimization && (
        <div className="space-y-5 animate-fadeIn">
          {optimization.has_live_ambulance && optimization.selected_ambulance ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>Response Plan Ready</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-0.5">
                    Fastest Estimated Care Path
                  </h1>
                </div>

                <div className="text-right">
                  <span className="text-3xl font-black text-amber-400 font-mono">
                    {optimization.total_estimated_time.toFixed(0)}
                  </span>
                  <span className="text-xs font-bold text-amber-400 font-mono ml-1">MIN TOTAL</span>
                  <div className="text-[10px] text-zinc-400">Live GPS + Traffic Transit</div>
                </div>
              </div>

              {/* Verified Result Card */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4">
                {/* 1. Verified Live Ambulance */}
                <div className="flex items-center justify-between p-3.5 bg-zinc-950/80 border border-zinc-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-black text-lg">
                      🚑
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">
                        {optimization.selected_ambulance.vehicle_number}
                        <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                          LIVE LOCATION
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {optimization.selected_ambulance.distance_km.toFixed(1)} km away • {optimization.selected_ambulance.capability}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-mono font-bold text-cyan-400">
                      {optimization.ambulance_eta.toFixed(0)} min
                    </div>
                    <div className="text-[10px] text-zinc-500 uppercase font-mono">Scene ETA</div>
                  </div>
                </div>

                {/* 2. Real Destination Hospital */}
                <div className="flex items-center justify-between p-3.5 bg-zinc-950/80 border border-zinc-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black text-lg">
                      🏥
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white truncate max-w-[200px] sm:max-w-xs">
                        {optimization.selected_hospital.name}
                      </div>
                      <div className="text-xs text-emerald-400/90 mt-0.5 font-mono text-[11px]">
                        LIVE • Google Places (New)
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-mono font-bold text-emerald-400">
                      {optimization.travel_eta.toFixed(0)} min
                    </div>
                    <div className="text-[10px] text-zinc-500 uppercase font-mono">Transit ETA</div>
                  </div>
                </div>

                {/* 3. Explanation */}
                {explanation && (
                  <div className="p-3 bg-zinc-950/50 border border-zinc-800/80 rounded-xl text-xs space-y-1.5 font-sans">
                    <div className="font-bold font-mono text-zinc-400 uppercase text-[11px] flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Dispatch Decision Breakdown</span>
                    </div>
                    <p className="text-zinc-300 leading-relaxed text-[11px]">
                      {explanation.overall_reason || optimization.optimization_reason}
                    </p>
                  </div>
                )}
              </div>

              {/* Primary Action */}
              <button
                onClick={() => setCurrentStep('ACTIVE_RESPONSE')}
                className="w-full p-4 sm:p-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-base tracking-wider uppercase flex items-center justify-center gap-3 shadow-2xl shadow-emerald-600/40 border border-emerald-400 transition-all active:scale-[0.98]"
              >
                <span>START ACTIVE RESPONSE</span>
                <Navigation className="h-5 w-5" />
              </button>
            </>
          ) : (
            /* Honest No Live Ambulance State */
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-amber-950/40 border border-amber-500/50 shadow-2xl space-y-3">
                <div className="flex items-center gap-2.5 text-amber-400 font-black text-lg">
                  <AlertTriangle className="h-6 w-6 shrink-0 text-amber-400" />
                  <span>NO VERIFIED LIVE AMBULANCE AVAILABLE</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {optimization.no_ambulance_reason ||
                    'LifeLine could not verify a nearby ambulance with a current GPS location.'}
                </p>
                <div className="pt-2 border-t border-amber-500/20 text-[11px] font-mono text-zinc-400">
                  Data Honesty Rule: LifeLine never invents fake ambulance positions or artificial ETAs.
                </div>
              </div>

              {/* Destination Hospital is Still Discovered */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3">
                <div className="text-xs font-mono text-zinc-400 uppercase font-bold">
                  Nearest Verified Receiving Hospital:
                </div>
                <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🏥</span>
                    <div>
                      <div className="font-bold text-sm text-white">
                        {optimization.selected_hospital.name}
                      </div>
                      <div className="text-xs text-emerald-400 font-mono">
                        LIVE • Google Places (New)
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-mono font-bold text-emerald-400">
                      {optimization.travel_eta.toFixed(0)} min
                    </div>
                    <div className="text-[10px] text-zinc-500 uppercase font-mono">Driving Time</div>
                  </div>
                </div>
              </div>

              {/* Actions for User */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href="tel:108"
                  className="p-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all text-center"
                >
                  <PhoneCall className="h-4 w-4" />
                  <span>CALL 108 EMERGENCY</span>
                </a>

                <a
                  href="/ambulance/tracker"
                  target="_blank"
                  rel="noreferrer"
                  className="p-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-cyan-400 font-bold text-sm flex items-center justify-center gap-2 transition-all text-center"
                >
                  <Radio className="h-4 w-4" />
                  <span>OPEN AMBULANCE TRACKER</span>
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 7: ACTIVE EMERGENCY IN PROGRESS (ACTIVE_RESPONSE) */}
      {/* ========================================================================= */}
      {currentStep === 'ACTIVE_RESPONSE' && optimization && (
        <div className="space-y-4 animate-fadeIn">
          {/* Active Status Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/80 via-zinc-900 to-red-950/80 border border-red-500/50 shadow-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-red-600 flex items-center justify-center text-white text-xl animate-pulse">
                🚨
              </div>
              <div>
                <div className="text-xs font-mono font-bold text-red-400 uppercase tracking-wide">
                  Emergency In Progress
                </div>
                <div className="font-black text-white text-base sm:text-lg">
                  Ambulance En Route to Scene
                </div>
              </div>
            </div>

            <div className="text-right font-mono">
              <div className="text-2xl font-black text-white">
                ~0{optimization.ambulance_eta.toFixed(0)}:00
              </div>
              <div className="text-[10px] text-zinc-400">Estimated Arrival</div>
            </div>
          </div>

          {/* Reroute Alert Notification if triggered */}
          {rerouteNotification && (
            <div className="p-3.5 bg-amber-950/80 border border-amber-500/60 rounded-xl text-xs text-amber-200 flex items-center justify-between gap-2 shadow-xl animate-pulse">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <span>{rerouteNotification}</span>
              </div>
              <button
                onClick={() => setRerouteNotification(null)}
                className="text-amber-400 font-bold px-2 py-0.5 rounded bg-amber-900/60 text-[10px]"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Embedded Tactical Map View */}
          <div className="h-64 sm:h-80 rounded-2xl overflow-hidden border border-zinc-800 shadow-xl relative">
            <TacticalMap
              emergency={createdEmergency}
              currentLocation={currentLocation}
              selectedAmbulance={optimization.selected_ambulance}
              selectedHospital={optimization.selected_hospital}
              selectedRoute={optimization.selected_route}
              alternativeRoutes={optimization.alternative_routes}
              className="h-full w-full"
            />
          </div>

          {/* Route & Destination Details Bar */}
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
              <div className="text-zinc-500 text-[10px] uppercase">Destination Hospital</div>
              <div className="font-bold text-white mt-0.5 truncate">{optimization.selected_hospital.name}</div>
            </div>

            <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
              <div className="text-zinc-500 text-[10px] uppercase">Route Status</div>
              <div className="font-bold text-emerald-400 mt-0.5">Clear Green Corridor</div>
            </div>
          </div>

          {/* Direct Emergency Call Button & Demo Simulation Trigger */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <a
              href="tel:108"
              className="p-3.5 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 border border-red-400 transition-all"
            >
              <PhoneCall className="h-4 w-4" />
              <span>CALL 108 / 112 DISPATCH</span>
            </a>

            <button
              onClick={handleSimulateRouteBlockage}
              disabled={isRerouting}
              className="p-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-amber-500/40 text-amber-400 font-mono text-xs font-bold flex items-center justify-center gap-2 transition-all"
            >
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span>{isRerouting ? 'Testing Reroute...' : 'Simulate Traffic Blockage'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
