import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { lifelineApi } from '../services/api';
import { Header } from '../components/Header';
import { TacticalMap } from '../components/TacticalMap';
import { Sparkles, AlertCircle, ArrowRight, MapPin, Send, HelpCircle, FileText, CheckCircle2 } from 'lucide-react';
import { EmergencyAnalysis } from '../types';

export const NewEmergencyPage: React.FC = () => {
  const navigate = useNavigate();

  const [description, setDescription] = useState(
    'Three people injured in a road accident near the railway bridge. One person is unconscious.'
  );
  const [latitude, setLatitude] = useState(13.0380);
  const [longitude, setLongitude] = useState(80.2300);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [liveAnalysis, setLiveAnalysis] = useState<EmergencyAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Quick Preset Scenarios for Hackathon Judging Demos
  const sampleScenarios = [
    {
      label: 'Critical Road Accident (Hero Demo)',
      text: 'Three people injured in a road accident near the railway bridge. One person is unconscious.',
      lat: 13.0380,
      lon: 80.2300
    },
    {
      label: 'Cardiac Arrest in Apartment',
      text: 'Elderly patient collapsed in T. Nagar apartment, non-responsive with no detectable pulse. CPR in progress.',
      lat: 13.0415,
      lon: 80.2335
    },
    {
      label: 'Factory Fire & Burns',
      text: 'Industrial furnace fire in Guindy industrial estate. Two workers with deep second-degree burns, smoke inhalation.',
      lat: 13.0090,
      lon: 80.2080
    },
    {
      label: 'Pedestrian Minor Fracture',
      text: 'Bystander slipped on wet pavement near metro station. Conscious, complaining of wrist pain and ankle swelling.',
      lat: 13.0550,
      lon: 80.2500
    }
  ];

  const handleSelectScenario = (sc: typeof sampleScenarios[0]) => {
    setDescription(sc.text);
    setLatitude(sc.lat);
    setLongitude(sc.lon);
    setLiveAnalysis(null);
  };

  const handleTestExtraction = async () => {
    if (!description.trim()) return;
    try {
      setIsAnalyzing(true);
      // Simulate quick natural language extraction
      const emg = await lifelineApi.createEmergency({
        description,
        latitude,
        longitude
      });
      const analysis = await lifelineApi.analyzeEmergency(emg.id);
      setLiveAnalysis(analysis);
    } catch (err) {
      console.error('Failed to analyze:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    try {
      setIsSubmitting(true);
      const newEmg = await lifelineApi.createEmergency({
        description,
        latitude,
        longitude
      });
      // Optimize immediately
      await lifelineApi.optimizeEmergency(newEmg.id);
      navigate('/');
    } catch (err) {
      console.error('Failed to create emergency:', err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <Header />

      <main className="flex-1 p-4 lg:p-6 max-w-6xl w-full mx-auto space-y-6">
        {/* Title Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse"></span>
              NEW EMERGENCY INTAKE & TRIAGE
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Natural Language Voice/Text Incident Intake with Instant AI Severity Extraction
            </p>
          </div>
        </div>

        {/* Quick Scenario Preset Buttons */}
        <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl shadow-lg">
          <div className="text-xs font-mono font-bold text-zinc-400 uppercase mb-2.5 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>1-Click Hackathon Demo Scenarios:</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {sampleScenarios.map((sc, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectScenario(sc)}
                className="text-left p-2.5 rounded-lg bg-zinc-950/70 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 font-medium transition-all"
              >
                <div className="font-bold text-white text-[11px] mb-0.5 line-clamp-1">{sc.label}</div>
                <div className="text-[10px] text-zinc-400 line-clamp-2">{sc.text}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Form & Map Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Form & Live AI Preview (7 cols) */}
          <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl space-y-4">
              {/* Emergency Text Description */}
              <div>
                <label className="block text-xs font-mono font-bold uppercase text-zinc-300 mb-1.5 flex items-center justify-between">
                  <span>Emergency 911 / 108 Call Transcript / Text</span>
                  <span className="text-[10px] text-cyan-400 lowercase font-normal">Natural Language NLP</span>
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the incident, number of injured, patient consciousness, symptoms, and location..."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-all resize-none font-sans"
                  required
                />
              </div>

              {/* Coordinates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1">Incident Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={latitude}
                    onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1">Incident Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={longitude}
                    onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTestExtraction}
                  disabled={isAnalyzing}
                  className="px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-xs font-bold text-cyan-300 transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  <span>{isAnalyzing ? 'Extracting...' : 'Test AI Extraction'}</span>
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-xs font-mono tracking-wider uppercase transition-all shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 border border-red-400 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>DISPATCHING...</span>
                  ) : (
                    <>
                      <span>DISPATCH & OPTIMIZE RESPONSE</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Live AI Structured Output Preview */}
            {liveAnalysis && (
              <div className="bg-zinc-900 border border-cyan-500/40 rounded-xl p-4 shadow-xl space-y-2 animate-fadeIn">
                <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold pb-2 border-b border-zinc-800">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>AI STRUCTURED EXTRACTION VERIFIED</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                  <div className="bg-zinc-950 p-2 rounded border border-zinc-800">
                    <span className="text-[10px] text-zinc-500">TYPE</span>
                    <div className="font-bold text-cyan-300 font-mono">{liveAnalysis.incident_type}</div>
                  </div>
                  <div className="bg-zinc-950 p-2 rounded border border-zinc-800">
                    <span className="text-[10px] text-zinc-500">SEVERITY</span>
                    <div className="font-bold text-red-400 font-mono">{liveAnalysis.severity}</div>
                  </div>
                  <div className="bg-zinc-950 p-2 rounded border border-zinc-800">
                    <span className="text-[10px] text-zinc-500">TOTAL PATIENTS</span>
                    <div className="font-bold text-white font-mono">{liveAnalysis.patient_count}</div>
                  </div>
                  <div className="bg-zinc-950 p-2 rounded border border-zinc-800">
                    <span className="text-[10px] text-zinc-500">CRITICAL</span>
                    <div className="font-bold text-red-400 font-mono">{liveAnalysis.critical_patient_count}</div>
                  </div>
                </div>
              </div>
            )}
          </form>

          {/* Right Column: Coordinate Pin Map (5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="text-xs font-mono text-zinc-400 uppercase">
              Click Map to Select Incident Pin:
            </div>
            <div className="h-[380px] w-full">
              <TacticalMap
                emergency={{
                  id: 'preview',
                  description,
                  incident_type: 'ROAD_ACCIDENT',
                  latitude,
                  longitude,
                  patient_count: 1,
                  critical_patient_count: 0,
                  severity: 'CRITICAL',
                  status: 'ACTIVE'
                }}
                onMapClick={(lat, lon) => {
                  setLatitude(parseFloat(lat.toFixed(4)));
                  setLongitude(parseFloat(lon.toFixed(4)));
                }}
                className="h-full w-full"
              />
            </div>
            <p className="text-[11px] text-zinc-500 italic">
              * Click anywhere on the map above to reposition the emergency incident coordinates.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
