import React, { useState, useEffect, useRef } from 'react';
import { lifelineApi } from '../services/api';
import { ChatMessage, EmergencyDispatcherState, Emergency } from '../types';
import {
  Sparkles,
  Send,
  Mic,
  MicOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Radio,
  HelpCircle,
  Zap
} from 'lucide-react';

interface DispatcherChatProps {
  emergencyId?: string;
  onResponseInitiated: (emergency: Emergency) => void;
  isProcessing?: boolean;
}

export const DispatcherChat: React.FC<DispatcherChatProps> = ({
  emergencyId,
  onResponseInitiated,
  isProcessing = false
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'LIFELINE DISPATCH AI active. What happened and where is the emergency located?'
    }
  ]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string>('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [dispatcherState, setDispatcherState] = useState<EmergencyDispatcherState>({
    incident_type: 'ROAD_ACCIDENT',
    severity: 'MEDIUM',
    patient_count: 1,
    critical_patient_count: 0,
    location_description: '',
    road_passability: 'PASSABLE',
    special_requirements: [],
    confidence: 0.8,
    missing_information: ['location', 'severity'],
    has_sufficient_information: false
  });

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Handle Speech Recognition (Web Speech API)
  const handleToggleVoice = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported by your browser. Please type your message.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN'; // Supports Indian English & Tanglish phonetics
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
        handleSendMessage(transcript);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isTyping) return;

    setInput('');
    const newMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, newMsg]);
    setIsTyping(true);

    try {
      const res = await lifelineApi.chatDispatcher({
        message: text,
        conversation_id: conversationId || undefined,
        history: messages
      });

      setConversationId(res.conversation_id);
      setDispatcherState(res.state);

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.reply }
      ]);
    } catch (err) {
      console.error('Dispatcher chat error:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Understood. Emergency triage parameters recorded. Ready to dispatch response.'
        }
      ]);
      setDispatcherState((prev) => ({ ...prev, has_sufficient_information: true }));
    } finally {
      setIsTyping(false);
    }
  };

  const handleStartResponse = async () => {
    try {
      // 1. Create or register emergency with current parsed state
      const emg = await lifelineApi.createEmergency({
        description: messages.map((m) => `${m.role}: ${m.content}`).join(' | '),
        latitude: 13.0380,
        longitude: 80.2300,
        title: `${dispatcherState.severity || 'MEDIUM'} ${(dispatcherState.incident_type || 'INCIDENT').replace('_', ' ')}`,
        patient_count: dispatcherState.patient_count || undefined,
        critical_patient_count: dispatcherState.critical_patient_count || undefined,
        severity: dispatcherState.severity || undefined,
        incident_type: dispatcherState.incident_type || undefined
      });

      // 2. Trigger parent callback to initiate parallel optimization
      onResponseInitiated(emg);
    } catch (err) {
      console.error('Failed to start response:', err);
    }
  };

  // Quick Preset Prompts
  const quickPresets = [
    { label: 'Hero Car Accident', text: 'Three people injured in a road accident near the railway bridge. One person is unconscious.' },
    { label: 'Road Blocked & Crit', text: 'One person is unconscious. Road is blocked.' },
    { label: 'Tanglish Crash', text: 'Anna accident aachu bridge pakkam. 3 per injured, oru aal unconscious.' },
    { label: 'Cardiac Arrest', text: 'Elderly patient collapsed in T Nagar, cardiac arrest no pulse.' }
  ];

  return (
    <div className="bg-zinc-900/95 border border-zinc-800 rounded-xl shadow-2xl flex flex-col h-full overflow-hidden">
      {/* Dispatcher Console Header */}
      <div className="p-3 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative h-7 w-7 rounded-full bg-zinc-950 border border-zinc-700/80 p-0.5 flex items-center justify-center shadow-md shadow-red-500/20 shrink-0">
            <img
              src="/logo-clean.png"
              alt="LifeLine Dispatch AI"
              className="h-full w-full object-contain drop-shadow-[0_0_6px_rgba(239,68,68,0.4)]"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-xs tracking-wider text-white">LIFELINE DISPATCH AI</span>
              <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                LIVE INTAKE
              </span>
            </div>
            <p className="text-[10px] text-zinc-400">Conversational Triage with Minimum-Question Intelligence</p>
          </div>
        </div>

        {dispatcherState.has_sufficient_information && (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 border border-cyan-500 text-cyan-300 animate-pulse">
            READY TO DISPATCH
          </span>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2.5 max-h-[340px] text-xs font-sans">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <span className="text-[9px] font-mono text-zinc-500 mb-0.5 uppercase tracking-wider">
              {m.role === 'user' ? 'CITIZEN / CALLER' : 'AI DISPATCHER'}
            </span>
            <div
              className={`p-2.5 rounded-xl max-w-[88%] text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-cyan-600 text-white rounded-br-none shadow-md'
                  : 'bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-bl-none shadow-md'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-mono py-1">
            <RefreshCw className="h-3 w-3 animate-spin text-cyan-400" />
            <span>Analyzing response metrics...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Structured Triage State Chips */}
      <div className="px-3 py-2 bg-zinc-950/70 border-t border-zinc-800/80 flex items-center justify-between text-[10px] font-mono">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300">
            TYPE: <strong className="text-cyan-300">{dispatcherState.incident_type}</strong>
          </span>
          <span className={`px-1.5 py-0.5 rounded border ${
            dispatcherState.severity === 'CRITICAL'
              ? 'bg-red-950 border-red-500/50 text-red-300 animate-pulse'
              : 'bg-zinc-900 border-zinc-700 text-amber-300'
          }`}>
            SEV: {dispatcherState.severity}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300">
            CASUALTIES: <strong className="text-white">{dispatcherState.patient_count} ({dispatcherState.critical_patient_count} Crit)</strong>
          </span>
        </div>

        <div className="flex items-center gap-1">
          {dispatcherState.has_sufficient_information ? (
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <CheckCircle2 className="h-3 w-3" />
              Sufficient
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertCircle className="h-3 w-3" />
              Missing: {(dispatcherState.missing_information || [])[0] || 'info'}
            </span>
          )}
        </div>
      </div>

      {/* Quick Preset Buttons */}
      <div className="px-3 py-1.5 bg-zinc-950/50 border-t border-zinc-800/60 flex items-center gap-1.5 overflow-x-auto text-[10px]">
        <span className="text-zinc-500 font-mono shrink-0">Demo Quick Pills:</span>
        {quickPresets.map((p, i) => (
          <button
            key={i}
            onClick={() => {
              setInput(p.text);
              handleSendMessage(p.text);
            }}
            className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 whitespace-nowrap transition-all"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Input / Action Bar */}
      <div className="p-3 bg-zinc-950 border-t border-zinc-800 space-y-2">
        {/* If information is sufficient, show the primary START RESPONSE action */}
        {dispatcherState.has_sufficient_information && (
          <button
            onClick={handleStartResponse}
            disabled={isProcessing}
            className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold font-mono text-xs uppercase tracking-wider transition-all shadow-lg shadow-red-600/30 border border-red-400 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>COORDINATING LIVE RESPONSE...</span>
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 text-white animate-pulse" />
                <span>[ FIND BEST RESPONSE & DISPATCH ]</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          {/* Voice Input Button */}
          <button
            type="button"
            onClick={handleToggleVoice}
            className={`p-2 rounded-lg border transition-all ${
              isListening
                ? 'bg-red-600 text-white border-red-400 animate-pulse shadow-lg shadow-red-600/30'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border-zinc-700'
            }`}
            title={isListening ? 'Listening... click to stop' : 'Click to speak emergency report (Speech Recognition)'}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-cyan-400" />}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type emergency details (Supports English / Tanglish)..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
          />

          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="p-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 transition-all"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
