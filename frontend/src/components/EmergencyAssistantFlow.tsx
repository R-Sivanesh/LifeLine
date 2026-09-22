import React, { useState, useEffect, useRef } from 'react';
import {
  Emergency,
  OptimizationResult,
  LocationSearchResult,
  Severity,
  ChatMessage,
  EmergencyDispatcherState,
  ChatResponse
} from '../types';
import { lifelineApi } from '../services/api';
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
  PhoneCall,
  Activity,
  Car,
  Heart,
  Flame,
  HelpCircle,
  Clock,
  ArrowLeft,
  Sparkles,
  Radio,
  Navigation,
  Check
} from 'lucide-react';

interface EmergencyAssistantFlowProps {
  initialIncidentType?: string;
  onExitFlow?: () => void;
  onEmergencyCreated?: (emergency: Emergency, optimization?: OptimizationResult | null) => void;
}

export const EmergencyAssistantFlow: React.FC<EmergencyAssistantFlowProps> = ({
  initialIncidentType,
  onExitFlow,
  onEmergencyCreated
}) => {
  // Emergency Extracted Facts State
  const [incidentType, setIncidentType] = useState<string>(initialIncidentType || '');
  const [incidentDesc, setIncidentDesc] = useState<string>('');
  const [patientCount, setPatientCount] = useState<number | null>(null);
  const [criticalCount, setCriticalCount] = useState<number>(0);
  const [isUnconscious, setIsUnconscious] = useState<boolean | null>(null);
  const [injuryReported, setInjuryReported] = useState<boolean>(false);
  const [bleedingReported, setBleedingReported] = useState<boolean>(false);
  const [severity, setSeverity] = useState<Severity>('MEDIUM');
  const [locationMentioned, setLocationMentioned] = useState<string | null>(null);

  // Background Location State (Acquired on Entry)
  const [gpsLocation, setGpsLocation] = useState<LocationSearchResult | null>(null);
  const [confirmedLocation, setConfirmedLocation] = useState<LocationSearchResult | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(true);
  const [locationStatus, setLocationStatus] = useState<'ACQUIRING' | 'ACQUIRED' | 'DENIED' | 'UNAVAILABLE'>('ACQUIRING');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<LocationSearchResult[]>([]);
  const [locationSearchQuery, setLocationSearchQuery] = useState<string>('');
  const [locationSearchResults, setLocationSearchResults] = useState<LocationSearchResult[]>([]);
  const [showLocationSearch, setShowLocationSearch] = useState<boolean>(false);

  // Location Conflict State
  const [showLocationConflict, setShowLocationConflict] = useState<boolean>(false);
  const [conflictCandidate, setConflictCandidate] = useState<string>('');

  // Conversational AI Assistant
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);
  const [conversationId] = useState<string>(`emg-${Date.now().toString(36)}`);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speechSupported, setSpeechSupported] = useState<boolean>(false);
  const [missingQuestion, setMissingQuestion] = useState<{
    text: string;
    field: string;
    options: string[];
  } | null>(null);

  // Dispatch submission state
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  // 1. AUTOMATIC BACKGROUND GPS ACQUISITION ON COMPONENT MOUNT
  const acquireGpsLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('UNAVAILABLE');
      setIsLocating(false);
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setLocationStatus('ACQUIRING');
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);

        let formatted = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        let placeName = 'Current Location';
        try {
          const rev = await lifelineApi.reverseGeocode(lat, lon);
          if (rev?.formatted_address) {
            formatted = rev.formatted_address;
            placeName = rev.place_name || formatted.split(',')[0];
          }
        } catch (e) {
          console.warn('[LifeLine GPS] Reverse geocode note:', e);
        }

        const locResult: LocationSearchResult = {
          formatted_address: formatted,
          latitude: lat,
          longitude: lon,
          source: 'USER_GPS',
          accuracy_meters: accuracy,
          place_name: placeName
        };

        setGpsLocation(locResult);
        setConfirmedLocation(locResult);
        setLocationStatus('ACQUIRED');
        setIsLocating(false);

        // Fetch dynamic nearby places based on user's actual coordinates
        try {
          const nearby = await lifelineApi.getNearbyLandmarks(lat, lon, 5);
          if (Array.isArray(nearby) && nearby.length > 0) {
            setNearbyPlaces(nearby);
          }
        } catch (nearbyErr) {
          console.warn('Nearby places discovery note:', nearbyErr);
        }
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationStatus('DENIED');
          setLocationError('Location permission denied. Please allow access or search your address below.');
        } else {
          setLocationStatus('UNAVAILABLE');
          setLocationError('Location unavailable. Please search your landmark or station below.');
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    acquireGpsLocation();
  }, []);

  // 2. SPEECH RECOGNITION SETUP
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

  // 3. AI EXTRACTION & ADAPTIVE INTAKE HANDLER
  const handleSendChatMessage = async (overrideText?: string) => {
    const text = (overrideText || chatInput).trim();
    if (!text || isSendingChat) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsSendingChat(true);
    setDispatchError(null);

    try {
      const resp: ChatResponse = await lifelineApi.chatDispatcher({
        message: text,
        conversation_id: conversationId,
        history: chatMessages,
        latitude: confirmedLocation?.latitude || gpsLocation?.latitude,
        longitude: confirmedLocation?.longitude || gpsLocation?.longitude
      });

      setChatMessages((prev) => [...prev, { role: 'assistant', content: resp.reply }]);

      const st: EmergencyDispatcherState = resp.state;
      if (st) {
        if (st.incident_type) {
          setIncidentType(st.incident_type);
          setIncidentDesc(text);
        }
        if (st.patient_count !== undefined && st.patient_count !== null) {
          setPatientCount(st.patient_count);
        }
        if (st.critical_patient_count !== undefined && st.critical_patient_count !== null) {
          setCriticalCount(st.critical_patient_count);
        }
        if (st.injury_reported !== undefined && st.injury_reported !== null) {
          setInjuryReported(st.injury_reported);
        }
        if (st.bleeding_reported !== undefined && st.bleeding_reported !== null) {
          setBleedingReported(st.bleeding_reported);
        }
        if (st.is_unconscious !== undefined && st.is_unconscious !== null) {
          setIsUnconscious(st.is_unconscious);
        }
        if (st.severity) {
          setSeverity(st.severity);
        }

        // Location Mention & Conflict Check
        if (st.location_mentioned) {
          setLocationMentioned(st.location_mentioned);
          // Check if mentioned location differs substantially from current GPS
          if (gpsLocation && st.location_mentioned.toLowerCase() !== gpsLocation.place_name?.toLowerCase()) {
            setConflictCandidate(st.location_mentioned);
            setShowLocationConflict(true);
          }
        }

        // Adaptive Single-Question Logic
        if (!st.has_sufficient_information && st.missing_information && st.missing_information.length > 0) {
          const firstMissing = st.missing_information[0];
          setMissingQuestion({
            text: resp.reply,
            field: firstMissing,
            options: resp.suggested_quick_replies && resp.suggested_quick_replies.length > 0
              ? resp.suggested_quick_replies
              : ['1', '2', '3', '4+', 'Not Sure']
          });
        } else {
          setMissingQuestion(null);
        }
      }
    } catch (err) {
      console.warn('[LifeLine AI] Chat dispatch fallback notice:', err);
      // Fallback local extraction
      const lower = text.toLowerCase();
      if (lower.includes('crash') || lower.includes('accident')) setIncidentType('ROAD_ACCIDENT');
      else if (lower.includes('heart') || lower.includes('cardiac')) setIncidentType('CARDIAC_ARREST');
      else if (lower.includes('fire') || lower.includes('burn')) setIncidentType('FIRE_BURN');
      else setIncidentType('TRAUMA_INJURY');
      setPatientCount(1);
    } finally {
      setIsSendingChat(false);
    }
  };

  // Answer missing question via quick reply chip
  const handleQuickAnswer = (optionText: string) => {
    handleSendChatMessage(optionText);
    setMissingQuestion(null);
  };

  // Handle Location Search
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
    setConfirmedLocation({
      ...loc,
      source: 'USER_SEARCH'
    });
    setLocationSearchResults([]);
    setLocationSearchQuery('');
    setShowLocationSearch(false);
    setShowLocationConflict(false);
  };

  // Resolve Location Conflict
  const handleResolveConflict = async (useMentioned: boolean) => {
    setShowLocationConflict(false);
    if (useMentioned && conflictCandidate) {
      try {
        const searchRes = await lifelineApi.searchLocation(conflictCandidate);
        if (searchRes && searchRes.length > 0) {
          setConfirmedLocation({
            ...searchRes[0],
            source: 'USER_MENTIONED_LOCATION'
          });
          return;
        }
      } catch (e) {
        console.warn('Geocoding mentioned location failed:', e);
      }
      if (confirmedLocation) {
        setConfirmedLocation({
          ...confirmedLocation,
          place_name: conflictCandidate,
          source: 'USER_MENTIONED_LOCATION'
        });
      }
    } else if (gpsLocation) {
      setConfirmedLocation(gpsLocation);
    }
  };

  // 4. REQUEST EMERGENCY ASSISTANCE (DETERMINISTIC DISPATCH TRIGGER)
  const handleRequestAssistance = async () => {
    if (!confirmedLocation || confirmedLocation.latitude === undefined || confirmedLocation.longitude === undefined) {
      setLocationError('Please confirm an emergency location before dispatching assistance.');
      setShowLocationSearch(true);
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
          // Alert eligible drivers in real time
          await lifelineApi.alertDrivers(emg.id, [opt.selected_ambulance.ambulance_id]);
        }
      } catch (optErr) {
        console.warn('[LifeLine Optimization] Background calculation note:', optErr);
      }

      // 3. Hand off directly into the Active Emergency continuous view
      if (onEmergencyCreated) {
        onEmergencyCreated(emg, opt);
      }
    } catch (err: any) {
      console.error('[LifeLine Dispatch] Emergency creation failed:', err);
      setDispatchError('Failed to create emergency request. Please try again or dial 108 directly.');
      setIsDispatching(false);
    }
  };

  // Quick Preset Incident Categories
  const incidentPresets = [
    { type: 'ROAD_ACCIDENT', label: 'Vehicle / Road Crash', icon: Car, color: 'text-amber-400 border-amber-500/40 bg-amber-950/40' },
    { type: 'CARDIAC_ARREST', label: 'Heart Attack / Cardiac', icon: Heart, color: 'text-red-400 border-red-500/40 bg-red-950/40' },
    { type: 'TRAUMA_INJURY', label: 'Severe Injury / Fall', icon: Activity, color: 'text-rose-400 border-rose-500/40 bg-rose-950/40' },
    { type: 'FIRE_BURN', label: 'Fire / Burn Emergency', icon: Flame, color: 'text-yellow-400 border-yellow-500/40 bg-yellow-950/40' },
    { type: 'MEDICAL_EMERGENCY', label: 'Other Medical Crisis', icon: HelpCircle, color: 'text-cyan-400 border-cyan-500/40 bg-cyan-950/40' },
  ];

  const hasIncident = Boolean(incidentType);
  const isReadyToDispatch = Boolean(incidentType && confirmedLocation);

  return (
    <div className="max-w-lg mx-auto w-full space-y-4 animate-fadeIn font-sans">
      {/* ── Compact Navigation Bar ── */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
        <button
          onClick={onExitFlow}
          className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-all py-1.5 px-2.5 rounded-xl hover:bg-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2 text-xs font-mono text-zinc-300">
          <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="font-bold tracking-wider uppercase text-white">EMERGENCY INTAKE</span>
        </div>

        <button
          onClick={onExitFlow}
          className="text-xs font-mono text-zinc-500 hover:text-zinc-300 py-1.5 px-2.5 rounded-xl hover:bg-zinc-900"
        >
          Exit
        </button>
      </div>

      {/* ── PRIORITY 2: AUTOMATIC LOCATION STATUS BAR (ON ENTRY) ── */}
      <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-md flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2.5 truncate pr-2">
          {isLocating ? (
            <>
              <RefreshCw className="h-4 w-4 text-cyan-400 animate-spin shrink-0" />
              <div className="truncate">
                <span className="text-zinc-300 font-bold block truncate">Detecting your location...</span>
                <span className="text-[10px] text-zinc-500">Browser GPS initializing</span>
              </div>
            </>
          ) : locationStatus === 'ACQUIRED' && confirmedLocation ? (
            <>
              <MapPin className="h-4 w-4 text-emerald-400 shrink-0" />
              <div className="truncate">
                <span className="text-emerald-400 font-bold block truncate">
                  📍 {confirmedLocation.place_name || confirmedLocation.formatted_address.split(',')[0]}
                </span>
                <span className="text-[10px] text-zinc-400 truncate block">
                  {confirmedLocation.source} {confirmedLocation.accuracy_meters ? `(±${confirmedLocation.accuracy_meters}m)` : ''} · {confirmedLocation.formatted_address}
                </span>
              </div>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <div>
                <span className="text-amber-400 font-bold block">Location unavailable</span>
                <span className="text-[10px] text-zinc-400">GPS permission needed</span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {locationStatus !== 'ACQUIRED' && (
            <button
              onClick={acquireGpsLocation}
              className="px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900 text-[11px] font-bold"
            >
              Try GPS
            </button>
          )}
          <button
            onClick={() => setShowLocationSearch(!showLocationSearch)}
            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-bold"
          >
            {showLocationSearch ? 'Close' : 'Change'}
          </button>
        </div>
      </div>

      {/* ── PRIORITY 2: LOCATION CONFLICT MODAL / CARD ── */}
      {showLocationConflict && gpsLocation && (
        <div className="p-4 rounded-2xl bg-amber-950/90 border-2 border-amber-500 text-amber-100 space-y-3 shadow-2xl animate-fadeIn card-glow-amber">
          <div className="flex items-center gap-2 font-bold text-sm text-amber-300">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <span>LOCATION CHECK</span>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800">
              <span className="text-zinc-400 font-mono text-[10px] block">Your current GPS location:</span>
              <span className="font-bold text-white text-xs">{gpsLocation.place_name || gpsLocation.formatted_address}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800">
              <span className="text-zinc-400 font-mono text-[10px] block">You mentioned:</span>
              <span className="font-bold text-cyan-300 text-xs">{conflictCandidate}</span>
            </div>
          </div>

          <div className="text-xs text-zinc-300">Which location should LifeLine use for dispatch?</div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => handleResolveConflict(true)}
              className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider transition-all"
            >
              USE {conflictCandidate.toUpperCase().slice(0, 15)}
            </button>
            <button
              onClick={() => handleResolveConflict(false)}
              className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-xs transition-all"
            >
              MY CURRENT LOCATION
            </button>
          </div>
        </div>
      )}

      {/* ── LOCATION SEARCH POPDOWN ── */}
      {showLocationSearch && (
        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-700 space-y-3 shadow-xl animate-fadeIn">
          <div className="text-xs font-mono font-bold text-zinc-300 uppercase">
            Search landmark, station, or street:
          </div>
          <div className="relative">
            <input
              type="text"
              value={locationSearchQuery}
              onChange={(e) => handleSearchLocation(e.target.value)}
              placeholder="e.g. Railway Station, Bus Stand, Main Road..."
              className="w-full bg-zinc-950 border-2 border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 pr-10 min-h-[48px]"
            />
            <Search className="h-4 w-4 text-zinc-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          </div>

          {locationSearchResults.length > 0 && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-lg overflow-hidden divide-y divide-zinc-800 max-h-48 overflow-y-auto">
              {locationSearchResults.map((res, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectSearchResult(res)}
                  className="w-full text-left p-3 hover:bg-zinc-900 text-zinc-200 hover:text-cyan-300 transition-all flex flex-col"
                >
                  <span className="font-bold text-xs text-white">{res.place_name || res.formatted_address.split(',')[0]}</span>
                  <span className="text-[11px] text-zinc-400 truncate">{res.formatted_address}</span>
                </button>
              ))}
            </div>
          )}

          {/* PRIORITY 3: DYNAMIC NEARBY LANDMARKS (NO HARDCODED CHENNAI ONLY) */}
          {nearbyPlaces.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-zinc-800">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Nearby landmarks around your location:</span>
              <div className="flex flex-wrap gap-1.5">
                {nearbyPlaces.map((pl, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectSearchResult(pl)}
                    className="px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-mono text-zinc-300 hover:text-white"
                  >
                    {pl.place_name || pl.formatted_address.split(',')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PRIORITY 1 & 4: NATURAL LANGUAGE INTAKE + VOICE ── */}
      <div className="p-4 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-white uppercase">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <span>Describe what happened:</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-400">English or Tanglish</span>
        </div>

        <div className="flex items-center gap-2">
          {speechSupported && (
            <button
              type="button"
              onClick={toggleVoice}
              className={`h-12 w-12 rounded-2xl border-2 shrink-0 flex items-center justify-center transition-all ${
                isListening
                  ? 'bg-red-600 text-white border-red-400 animate-pulse'
                  : 'bg-zinc-950 text-cyan-400 hover:bg-zinc-800 border-zinc-700'
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
            placeholder={isListening ? 'Listening...' : '"Car crash at Pondy Beach, 2 people injured"'}
            className="flex-1 bg-zinc-950 border-2 border-zinc-700 rounded-2xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 min-h-[48px]"
          />

          <button
            type="button"
            onClick={() => handleSendChatMessage()}
            disabled={!chatInput.trim() || isSendingChat}
            className="h-12 w-12 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold shrink-0 flex items-center justify-center transition-all disabled:opacity-40 border-2 border-red-400 shadow-lg"
          >
            {isSendingChat ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>

        {/* AI Conversation Messages (if any) */}
        {chatMessages.length > 0 && (
          <div className="space-y-1.5 max-h-36 overflow-y-auto pt-2 border-t border-zinc-800/80 text-xs">
            {chatMessages.map((m, i) => (
              <div
                key={i}
                className={`p-2.5 rounded-xl leading-relaxed ${
                  m.role === 'user' ? 'bg-cyan-950/60 text-cyan-200 text-right' : 'bg-zinc-950 text-zinc-300'
                }`}
              >
                {m.content}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── PRIORITY 1 & 4: EXTRACTED FACTS SUMMARY BADGES ── */}
      {hasIncident && (
        <div className="p-4 rounded-3xl bg-zinc-900/90 border border-emerald-500/40 shadow-xl space-y-2.5 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold text-emerald-400 uppercase flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Extracted Emergency Facts:</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 font-bold">
              {severity} SEVERITY
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs font-mono">
            {incidentType && (
              <span className="px-2.5 py-1 rounded-xl bg-zinc-950 text-cyan-300 border border-cyan-500/40 font-bold">
                🚨 {incidentType.replace('_', ' ')}
              </span>
            )}
            {patientCount !== null && (
              <span className="px-2.5 py-1 rounded-xl bg-zinc-950 text-white border border-zinc-700">
                👥 {patientCount} {patientCount === 1 ? 'Person' : 'People'}
              </span>
            )}
            {criticalCount > 0 && (
              <span className="px-2.5 py-1 rounded-xl bg-red-950 text-red-300 border border-red-500/50 font-bold">
                ⚠ {criticalCount} Critical
              </span>
            )}
            {bleedingReported && (
              <span className="px-2.5 py-1 rounded-xl bg-red-950 text-red-300 border border-red-500/40">
                🩸 Bleeding Reported
              </span>
            )}
            {injuryReported && (
              <span className="px-2.5 py-1 rounded-xl bg-rose-950 text-rose-300 border border-rose-500/40">
                🩹 Injury Reported
              </span>
            )}
            {locationMentioned && (
              <span className="px-2.5 py-1 rounded-xl bg-zinc-950 text-amber-300 border border-amber-500/40">
                📍 {locationMentioned}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── PRIORITY 1 & 4: ADAPTIVE SINGLE-QUESTION CARD (IF CRITICAL FACT MISSING) ── */}
      {missingQuestion && (
        <div className="p-4 rounded-3xl bg-zinc-900 border-2 border-amber-500/80 shadow-2xl space-y-3 animate-fadeIn card-glow-amber">
          <div className="text-[11px] font-mono font-bold text-amber-400 uppercase">
            A FEW QUICK QUESTIONS
          </div>
          <div className="text-base font-black text-white">{missingQuestion.text}</div>

          <div className="flex flex-wrap gap-2 pt-1">
            {missingQuestion.options.map((opt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleQuickAnswer(opt)}
                className="py-2.5 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-800 border-2 border-amber-500/60 text-amber-300 font-mono font-bold text-sm transition-all active:scale-[0.97]"
              >
                [ {opt} ]
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── QUICK PRESET BUTTONS (IF USER HASN'T TYPED YET) ── */}
      {!hasIncident && (
        <div className="space-y-2.5">
          <div className="text-xs font-mono text-zinc-400 font-bold uppercase px-1">
            Or select emergency category:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {incidentPresets.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.type}
                  onClick={() => {
                    setIncidentType(p.type);
                    setPatientCount(1);
                    if (p.type === 'CARDIAC_ARREST') {
                      setSeverity('CRITICAL');
                      setCriticalCount(1);
                    }
                  }}
                  className="p-3.5 rounded-2xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-left flex items-center gap-3 transition-all active:scale-[0.98]"
                >
                  <div className={`p-2.5 rounded-xl border ${p.color} shrink-0`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-white">{p.label}</div>
                    <div className="text-[10px] text-zinc-400">1-Tap Quick Start</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── DISPATCH ERROR MESSAGE (IF ANY) ── */}
      {dispatchError && (
        <div className="p-3.5 bg-red-950/80 border border-red-500 rounded-2xl text-xs text-red-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <span>{dispatchError}</span>
        </div>
      )}

      {/* ── PRIORITY 4 & 5: PRIMARY EMERGENCY DISPATCH ACTION ── */}
      <div className="pt-2 space-y-3">
        <button
          onClick={handleRequestAssistance}
          disabled={isDispatching || !isReadyToDispatch}
          className={`w-full py-5 px-4 rounded-3xl font-black text-base sm:text-lg tracking-wider uppercase flex items-center justify-center gap-3 shadow-2xl transition-all active:scale-[0.98] ${
            isReadyToDispatch
              ? 'bg-gradient-to-r from-red-600 via-red-500 to-red-600 hover:from-red-500 hover:to-red-400 text-white shadow-red-600/40 border-2 border-red-400 card-glow-red'
              : 'bg-zinc-900 border-2 border-zinc-800 text-zinc-500 opacity-60 cursor-not-allowed'
          }`}
        >
          {isDispatching ? (
            <>
              <RefreshCw className="h-6 w-6 animate-spin" />
              <span>DISPATCHING VERIFIED ASSISTANCE...</span>
            </>
          ) : (
            <>
              <span className="text-xl">🚑</span>
              <span>REQUEST EMERGENCY ASSISTANCE</span>
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>

        <div className="text-center text-[11px] font-mono text-zinc-500">
          This helps LifeLine determine the appropriate emergency response · No login required
        </div>
      </div>
    </div>
  );
};

export default EmergencyAssistantFlow;
