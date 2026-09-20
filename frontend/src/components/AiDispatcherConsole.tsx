import React, { useState, useRef, useEffect } from 'react';
import { lifelineApi } from '../services/api';
import {
  ChatMessage,
  EmergencyDispatcherState,
  ChatResponse,
  Severity,
  LocationSearchResult
} from '../types';
import {
  Radio,
  Mic,
  MicOff,
  Send,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldAlert,
  Bot,
  User,
  Zap,
  RefreshCw,
  MapPin,
  HelpCircle
} from 'lucide-react';

interface AiDispatcherConsoleProps {
  onStartResponse: (state: EmergencyDispatcherState) => void;
  isAnalyzing?: boolean;
  activeSeverity?: Severity;
  currentLocation?: LocationSearchResult | null;
  onSetLocationBySearch?: (place: LocationSearchResult) => void;
  rerouteNotification?: string | null;
  onClearRerouteNotification?: () => void;
}

export const AiDispatcherConsole: React.FC<AiDispatcherConsoleProps> = ({
  onStartResponse,
  isAnalyzing = false,
  activeSeverity = 'MEDIUM',
  currentLocation,
  onSetLocationBySearch,
  rerouteNotification,
  onClearRerouteNotification
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "LifeLine Dispatch AI online. If you are reporting an emergency, tell me what happened and where.",
      timestamp: 'NOW'
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState<string>(`conv-${Date.now().toString(36)}`);
  
  // Clean initial state: zero assumptions, zero fake emergency
  const [dispatcherState, setDispatcherState] = useState<EmergencyDispatcherState>({
    intent: 'UNKNOWN',
    conversation_state: 'IDLE',
    incident_type: null,
    severity: 'MEDIUM',
    patient_count: null,
    critical_patient_count: null,
    location_description: currentLocation?.formatted_address || null,
    location_confirmed: Boolean(currentLocation),
    road_passability: null,
    special_requirements: [],
    confidence: 0.0,
    missing_information: ['incident_type', 'location'],
    has_sufficient_information: false,
    latitude: currentLocation?.latitude || null,
    longitude: currentLocation?.longitude || null,
    location_source: currentLocation?.source || null,
    accuracy_meters: currentLocation?.accuracy_meters || null
  });

  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([
    'Road Accident',
    'Cardiac Emergency',
    'Fall / Severe Trauma',
    'Fire / Burn'
  ]);

  // Voice Speech Recognition State
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Sync currentLocation changes into dispatcher state
  useEffect(() => {
    if (currentLocation) {
      setDispatcherState((prev) => ({
        ...prev,
        location_description: currentLocation.formatted_address || currentLocation.place_name || prev.location_description,
        location_confirmed: true,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        location_source: currentLocation.source,
        accuracy_meters: currentLocation.accuracy_meters || null,
        missing_information: (prev.missing_information || []).filter((m) => m !== 'location'),
        has_sufficient_information: Boolean(prev.incident_type)
      }));
    }
  }, [currentLocation]);

  // Initialize Web Speech API if supported in browser
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputMessage(transcript);
        setIsListening(false);
      };

      recognition.onerror = (e: any) => {
        console.warn('Speech recognition error:', e);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  // Handle incoming reroute broadcast into the chat
  useEffect(() => {
    if (rerouteNotification) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ REROUTE ALERT: ${rerouteNotification}`,
          timestamp: 'NOW'
        }
      ]);
      if (onClearRerouteNotification) {
        onClearRerouteNotification();
      }
    }
  }, [rerouteNotification]);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.warn('Could not start recognition:', e);
        setIsListening(false);
      }
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isSending) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsSending(true);

    try {
      const resp: ChatResponse = await lifelineApi.chatDispatcher({
        message: text,
        conversation_id: conversationId,
        history: messages,
        latitude: currentLocation?.latitude || dispatcherState.latitude || undefined,
        longitude: currentLocation?.longitude || dispatcherState.longitude || undefined,
        location_source: currentLocation?.source || dispatcherState.location_source || undefined,
        accuracy_meters: currentLocation?.accuracy_meters || dispatcherState.accuracy_meters || undefined
      });

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: resp.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);

      if (resp.state) {
        setDispatcherState(resp.state);
      }

      if (resp.suggested_quick_replies && resp.suggested_quick_replies.length > 0) {
        setSuggestedReplies(resp.suggested_quick_replies);
      }
    } catch (err) {
      console.error('Dispatcher chat failed:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Unable to reach Gemini dispatcher service. Please describe what happened and your location.',
          timestamp: 'NOW'
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const hasLocation = Boolean(dispatcherState.location_confirmed || (dispatcherState.location_description && dispatcherState.location_description.length > 3));
  const hasIncident = Boolean(dispatcherState.incident_type);
  const isReadyToOptimize = Boolean(dispatcherState.has_sufficient_information && hasLocation && hasIncident);

  return (
    <div className="bg-zinc-900/95 border border-zinc-800 rounded-xl shadow-2xl flex flex-col h-[560px] relative overflow-hidden">
      {/* Console Top Header */}
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-400">
            <Radio className="h-4 w-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-black text-white tracking-wider uppercase">
                ✦ LIFELINE DISPATCH AI
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-500/40">
                {dispatcherState.conversation_state || 'LIVE INTAKE'}
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 font-mono">
              Zero-False Decisions • Verified Location Intake
            </p>
          </div>
        </div>

        {/* Sufficiency Status Badge */}
        <div className="flex items-center gap-1.5">
          {isReadyToOptimize ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/50 animate-pulse">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              INTAKE SUFFICIENT
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
              <Clock className="h-3 w-3 text-amber-400" />
              AWAITING DETAILS
            </span>
          )}
        </div>
      </div>

      {/* Emergency Intake Verification Checklist Bar */}
      <div className="bg-zinc-950/70 border-b border-zinc-800/80 px-3 py-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
        <div className="flex items-center gap-1.5">
          <span className={hasIncident ? "text-emerald-400" : "text-amber-400"}>
            {hasIncident ? "✓" : "○"}
          </span>
          <span className="text-zinc-500">TYPE:</span>
          <span className={hasIncident ? "font-bold text-cyan-300 truncate" : "text-zinc-500 italic"}>
            {dispatcherState.incident_type ? dispatcherState.incident_type.replace('_', ' ') : "Not Set"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={hasLocation ? "text-emerald-400" : "text-amber-400"}>
            {hasLocation ? "✓" : "○"}
          </span>
          <span className="text-zinc-500">LOCATION:</span>
          <span className={hasLocation ? "font-bold text-white truncate" : "text-zinc-500 italic"}>
            {dispatcherState.location_description || (dispatcherState.location_confirmed ? "Confirmed Pin" : "Not Set")}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={dispatcherState.patient_count ? "text-emerald-400" : "text-zinc-600"}>
            {dispatcherState.patient_count ? "✓" : "○"}
          </span>
          <span className="text-zinc-500">PATIENTS:</span>
          <span className="font-bold text-zinc-300 truncate">
            {dispatcherState.patient_count ? `${dispatcherState.patient_count} (${dispatcherState.critical_patient_count || 0} Crit)` : "1 (Default)"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={dispatcherState.road_passability ? "text-emerald-400" : "text-zinc-600"}>
            {dispatcherState.road_passability ? "✓" : "○"}
          </span>
          <span className="text-zinc-500">ROAD:</span>
          <span className={`font-bold truncate ${dispatcherState.road_passability === 'BLOCKED' ? 'text-red-400' : 'text-emerald-400'}`}>
            {dispatcherState.road_passability || "Open / Unknown"}
          </span>
        </div>
      </div>

      {/* Dispatch Intake Conversation Scroll Area */}
      <div ref={chatScrollRef} className="flex-1 p-3.5 space-y-2.5 overflow-y-auto font-sans text-xs">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-1.5 mb-0.5 text-[10px] font-mono text-zinc-500">
              {m.role === 'user' ? (
                <>
                  <span>CITIZEN / DISPATCH OPERATOR</span>
                  <User className="h-3 w-3 text-cyan-400" />
                </>
              ) : (
                <>
                  <Bot className="h-3 w-3 text-red-400" />
                  <span className="text-red-400 font-bold">DISPATCHER AI</span>
                </>
              )}
            </div>

            <div
              className={`p-2.5 rounded-lg max-w-[85%] leading-relaxed ${
                m.role === 'user'
                  ? 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-100 rounded-tr-none'
                  : 'bg-zinc-950/90 border border-zinc-800 text-zinc-200 rounded-tl-none'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-mono pl-1">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-red-400" />
            <span>Dispatcher reasoning & validating parameters...</span>
          </div>
        )}
      </div>

      {/* Adaptive Quick Replies */}
      {suggestedReplies.length > 0 && (
        <div className="px-3 py-1.5 bg-zinc-950/80 border-t border-zinc-800/80 flex items-center gap-1.5 overflow-x-auto text-[10px]">
          <span className="text-zinc-500 font-mono shrink-0 flex items-center gap-1">
            <Zap className="h-3 w-3 text-amber-400" /> Suggestions:
          </span>
          {suggestedReplies.map((replyText, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(replyText)}
              className="shrink-0 px-2.5 py-0.5 rounded-full bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 border border-zinc-700 hover:border-cyan-500/50 text-zinc-300 hover:text-cyan-300 font-mono transition-all truncate"
            >
              {replyText}
            </button>
          ))}
        </div>
      )}

      {/* One-Click Action Trigger: [ FIND BEST RESPONSE ] */}
      {isReadyToOptimize ? (
        <div className="px-3 py-2.5 bg-gradient-to-r from-red-950/70 via-zinc-900 to-red-950/70 border-t border-red-500/40 flex items-center justify-between gap-3 animate-fadeIn">
          <div className="text-[11px] font-mono text-zinc-200 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></div>
            <span>Intake complete. Ready to optimize routing & hospital matching.</span>
          </div>

          <button
            onClick={() => onStartResponse(dispatcherState)}
            disabled={isAnalyzing}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-mono font-black text-xs tracking-wider uppercase transition-all shadow-lg shadow-red-600/40 border border-red-400 flex items-center gap-2 disabled:opacity-50 shrink-0"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>OPTIMIZING...</span>
              </>
            ) : (
              <>
                <span>[ FIND BEST RESPONSE ]</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="px-3 py-1.5 bg-zinc-950/90 border-t border-zinc-800 text-[11px] font-mono text-zinc-500 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500/70" />
            <span>Required to dispatch: {(!hasIncident ? 'Incident Type' : '') + (!hasIncident && !hasLocation ? ' + ' : '') + (!hasLocation ? 'Location' : '')}</span>
          </span>
          <span className="text-[10px] text-zinc-600 uppercase">STANDBY</span>
        </div>
      )}

      {/* Input Message & Voice Recognition Bar */}
      <div className="p-3 bg-zinc-950 border-t border-zinc-800 flex items-center gap-2">
        {speechSupported && (
          <button
            type="button"
            onClick={toggleVoiceInput}
            className={`p-2.5 rounded-lg border transition-all ${
              isListening
                ? 'bg-red-600 text-white border-red-400 animate-pulse'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
            }`}
            title="Speech-to-Text emergency intake voice recognition"
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-cyan-400" />}
          </button>
        )}

        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder={
            isListening
              ? 'Listening to speech...'
              : 'Describe emergency details or answer dispatcher question...'
          }
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-all font-sans"
        />

        <button
          type="button"
          onClick={() => handleSendMessage()}
          disabled={!inputMessage.trim() || isSending}
          className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-all disabled:opacity-40 border border-red-400"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
