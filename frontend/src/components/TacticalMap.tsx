import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import {
  Emergency,
  AmbulanceRecommendation,
  HospitalRecommendation,
  RouteOption,
  RoadIncident,
  Ambulance,
  Hospital,
  LocationSearchResult
} from '../types';
import { lifelineApi } from '../services/api';
import {
  AlertTriangle,
  Info,
  HelpCircle,
  ShieldAlert,
  Key,
  Crosshair,
  Search,
  MapPin,
  CheckCircle2,
  RefreshCw,
  Navigation
} from 'lucide-react';

interface TacticalMapProps {
  emergency?: Emergency | null;
  selectedAmbulance?: AmbulanceRecommendation | null;
  selectedHospital?: HospitalRecommendation | null;
  selectedRoute?: RouteOption | null;
  alternativeRoutes?: RouteOption[];
  blockedRoute?: RouteOption | null;
  allAmbulances?: Ambulance[];
  allHospitals?: Hospital[];
  incidents?: RoadIncident[];
  currentLocation?: LocationSearchResult | null;
  onLocationAcquired?: (loc: LocationSearchResult) => void;
  onMapClick?: (lat: number, lon: number) => void;
  onSelectRoute?: (route: RouteOption) => void;
  className?: string;
}

// Tactical dark map styling for Google Maps
const DARK_GOOGLE_MAP_STYLE: any[] = [
  { elementType: 'geometry', stylers: [{ color: '#18181b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#18181b' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a1a1aa' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#e4e4e7' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#71717a' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#14251b' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#27272a' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#18181b' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3f3f46' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#27272a' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#27272a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#090d16' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#38bdf8' }] }
];

export const TacticalMap: React.FC<TacticalMapProps> = ({
  emergency,
  selectedAmbulance,
  selectedHospital,
  selectedRoute,
  alternativeRoutes = [],
  allAmbulances = [],
  allHospitals = [],
  incidents = [],
  currentLocation,
  onLocationAcquired,
  onMapClick,
  onSelectRoute,
  className = 'h-[520px] w-full'
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [providerMode, setProviderMode] = useState<'google' | 'mapbox' | 'canvas'>('canvas');
  const [mapError, setMapError] = useState<string | null>(null);
  const [showConfigHelp, setShowConfigHelp] = useState<boolean>(false);

  // Location Acquisition UI states
  const [isAcquiringGps, setIsAcquiringGps] = useState(false);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [isDropPinMode, setIsDropPinMode] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);

  // Instances
  const googleMapRef = useRef<any>(null);
  const googleMarkersRef = useRef<any[]>([]);
  const googlePolylinesRef = useRef<any[]>([]);

  const mapboxMapRef = useRef<mapboxgl.Map | null>(null);
  const mapboxMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const googleApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const mapboxToken = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '').trim();

  const hasGoogleKey = Boolean(googleApiKey && !googleApiKey.startsWith('your_'));
  const hasMapboxToken = Boolean(mapboxToken && !mapboxToken.startsWith('your_') && mapboxToken.startsWith('pk.'));

  // 1. Determine active map provider
  useEffect(() => {
    if (hasGoogleKey) {
      const g = (window as any).google;
      if (g && g.maps) {
        setProviderMode('google');
      } else {
        const scriptId = 'google-maps-js-sdk';
        if (!document.getElementById(scriptId)) {
          const script = document.createElement('script');
          script.id = scriptId;
          script.src = `https://maps.googleapis.com/maps/api/js?key=${googleApiKey}&libraries=places,geometry`;
          script.async = true;
          script.defer = true;
          script.onload = () => setProviderMode('google');
          script.onerror = () => {
            console.warn('Google Maps JS API load failed. Falling back.');
            if (hasMapboxToken) setProviderMode('mapbox');
            else setProviderMode('canvas');
          };
          document.head.appendChild(script);
        }
      }
    } else if (hasMapboxToken) {
      setProviderMode('mapbox');
    } else {
      setProviderMode('canvas');
    }
  }, [hasGoogleKey, hasMapboxToken, googleApiKey]);

  // Center coordinates calculation
  const activeLat = emergency?.latitude || currentLocation?.latitude || 13.0380;
  const activeLon = emergency?.longitude || currentLocation?.longitude || 80.2300;

  // 2. Location Search Handler
  const handleLocationSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const results = await lifelineApi.searchLocation(q.trim());
      setSearchResults(results);
    } catch (e) {
      console.warn('Location search error:', e);
    }
  };

  const handleSelectSearchResult = (res: LocationSearchResult) => {
    if (onLocationAcquired) {
      onLocationAcquired({
        ...res,
        source: 'USER_SEARCH'
      });
    }
    setIsSearchingLocation(false);
    setSearchQuery('');
  };

  // 3. Browser GPS Acquisition Handler
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setIsAcquiringGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);

        let address = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        try {
          const rev = await lifelineApi.reverseGeocode(lat, lon);
          if (rev?.formatted_address) {
            address = rev.formatted_address;
          }
        } catch (e) {
          console.warn('Reverse geocoding error:', e);
        }

        if (onLocationAcquired) {
          onLocationAcquired({
            formatted_address: address,
            latitude: lat,
            longitude: lon,
            source: 'USER_GPS',
            accuracy_meters: accuracy,
            place_name: 'Current Device Location'
          });
        }
        setIsAcquiringGps(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        alert(`Location access denied or unavailable: ${err.message}`);
        setIsAcquiringGps(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // 4. Pin Drop Handler
  const handleMapCoordinateClick = async (lat: number, lon: number) => {
    if (onMapClick) {
      onMapClick(lat, lon);
    }
    if (isDropPinMode || onLocationAcquired) {
      setIsReverseGeocoding(true);
      let address = `Pin Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
      try {
        const rev = await lifelineApi.reverseGeocode(lat, lon);
        if (rev?.formatted_address) {
          address = rev.formatted_address;
        }
      } catch (e) {
        console.warn('Reverse geocode error:', e);
      } finally {
        setIsReverseGeocoding(false);
      }

      if (onLocationAcquired) {
        onLocationAcquired({
          formatted_address: address,
          latitude: lat,
          longitude: lon,
          source: 'USER_PIN',
          place_name: 'Selected Map Pin'
        });
      }
      setIsDropPinMode(false);
    }
  };

  // 5. Canvas Click Handler
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const width = canvas.width;
    const height = canvas.height;
    const scale = Math.min(width, height) * 12.0;

    const centerLat = activeLat;
    const centerLon = activeLon;

    const clickedLon = centerLon + (x - width / 2) / scale;
    const clickedLat = centerLat - (y - height / 2) / scale;

    handleMapCoordinateClick(clickedLat, clickedLon);
  };

  // 6. Tactical Vector Canvas Renderer (Deterministic fallback)
  const renderFallbackCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || providerMode !== 'canvas') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = (canvas.width = canvas.parentElement?.clientWidth || 700);
    const height = (canvas.height = canvas.parentElement?.clientHeight || 520);

    // Dark background
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);

    // Tactical grid
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const centerLat = activeLat;
    const centerLon = activeLon;
    const scale = Math.min(width, height) * 12.0;

    const toCanvasX = (lon: number) => width / 2 + (lon - centerLon) * scale;
    const toCanvasY = (lat: number) => height / 2 - (lat - centerLat) * scale;

    // Alternative routes
    if (emergency) {
      alternativeRoutes.forEach((alt) => {
        if (alt.geometry && alt.geometry.length > 1) {
          ctx.beginPath();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 2.5;
          alt.geometry.forEach(([lon, lat], i) => {
            const cx = toCanvasX(lon);
            const cy = toCanvasY(lat);
            if (i === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
          });
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });

      // Primary route
      if (selectedRoute && selectedRoute.geometry && selectedRoute.geometry.length > 1) {
        const isBlocked = selectedRoute.risk_level === 'BLOCKED';
        ctx.beginPath();
        ctx.strokeStyle = isBlocked ? 'rgba(239, 68, 68, 0.3)' : 'rgba(6, 182, 212, 0.3)';
        ctx.lineWidth = 8;
        selectedRoute.geometry.forEach(([lon, lat], i) => {
          const cx = toCanvasX(lon);
          const cy = toCanvasY(lat);
          if (i === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        });
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = isBlocked ? '#ef4444' : '#22d3ee';
        ctx.lineWidth = 3.5;
        selectedRoute.geometry.forEach(([lon, lat], i) => {
          const cx = toCanvasX(lon);
          const cy = toCanvasY(lat);
          if (i === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        });
        ctx.stroke();
      }
    }

    // Hospitals
    const displayHospitals = selectedHospital ? [selectedHospital] : allHospitals.slice(0, 5);
    displayHospitals.forEach((hosp) => {
      const hx = toCanvasX(hosp.longitude);
      const hy = toCanvasY(hosp.latitude);
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(hx, hy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ecfdf5';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`🏥 ${hosp.name.slice(0, 16)}`, hx + 10, hy + 3);
    });

    // Ambulances
    const displayAmbulances = selectedAmbulance ? [selectedAmbulance] : allAmbulances.slice(0, 4);
    displayAmbulances.forEach((amb) => {
      const ax = toCanvasX(amb.longitude);
      const ay = toCanvasY(amb.latitude);
      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.arc(ax, ay, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#06b6d4';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`🚑 ${amb.vehicle_number}`, ax + 10, ay + 3);
    });

    // Active Emergency Scene
    if (emergency) {
      const ex = toCanvasX(emergency.longitude);
      const ey = toCanvasY(emergency.latitude);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
      ctx.lineWidth = 3;
      ctx.arc(ex, ey, 14, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(ex, ey, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`🚨 SCENE: ${emergency.incident_type || 'INCIDENT'}`, ex + 14, ey + 4);
    } else if (currentLocation) {
      // User Confirmed Location Pin (before emergency optimization)
      const px = toCanvasX(currentLocation.longitude);
      const py = toCanvasY(currentLocation.latitude);

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
      ctx.lineWidth = 2;
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`📍 ${currentLocation.formatted_address.slice(0, 24)}`, px + 12, py + 4);
    }
  }, [emergency, currentLocation, selectedAmbulance, selectedHospital, selectedRoute, alternativeRoutes, allAmbulances, allHospitals, providerMode, activeLat, activeLon]);

  useEffect(() => {
    if (providerMode === 'canvas') {
      renderFallbackCanvas();
      const handleResize = () => renderFallbackCanvas();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [providerMode, renderFallbackCanvas]);

  const hasConfirmedLocation = Boolean(currentLocation || emergency);

  return (
    <div className={`relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 ${className}`}>
      {/* Location Acquisition Header Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left Action Buttons */}
        <div className="flex items-center gap-1.5 pointer-events-auto bg-zinc-950/90 backdrop-blur-md p-1.5 rounded-lg border border-zinc-800 shadow-2xl">
          <button
            onClick={handleUseMyLocation}
            disabled={isAcquiringGps}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all ${
              currentLocation?.source === 'USER_GPS'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                : 'bg-zinc-900 hover:bg-zinc-800 text-cyan-400 border border-zinc-700'
            }`}
          >
            {isAcquiringGps ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Crosshair className="h-3.5 w-3.5" />
            )}
            <span>[ USE MY LOCATION ]</span>
          </button>

          <button
            onClick={() => setIsSearchingLocation(!isSearchingLocation)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all ${
              isSearchingLocation
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            <span>[ SEARCH LOCATION ]</span>
          </button>

          <button
            onClick={() => setIsDropPinMode(!isDropPinMode)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all ${
              isDropPinMode
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30 animate-pulse'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700'
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            <span>{isDropPinMode ? '[ CLICK MAP TO PIN ]' : '[ DROP PIN ]'}</span>
          </button>
        </div>

        {/* Location Status Badge */}
        <div className="pointer-events-auto bg-zinc-950/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800 text-xs font-mono shadow-2xl flex items-center gap-2">
          {hasConfirmedLocation ? (
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-bold truncate max-w-[220px]">
                {currentLocation?.formatted_address || emergency?.description || 'Location Confirmed'}
              </span>
              <span className="text-[10px] text-zinc-400 bg-zinc-900 px-1.5 py-0.2 rounded border border-zinc-800">
                {currentLocation?.source || 'LIVE'}
                {currentLocation?.accuracy_meters ? ` (±${currentLocation.accuracy_meters}m)` : ''}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />
              <span className="font-bold">LOCATION NOT SET</span>
              <span className="text-[10px] text-zinc-500 hidden sm:inline">(STANDBY)</span>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Location Search Autocomplete Popup */}
      {isSearchingLocation && (
        <div className="absolute top-16 left-3 z-30 w-80 bg-zinc-950/95 backdrop-blur-md border border-cyan-500/40 rounded-xl p-3 shadow-2xl font-mono text-xs animate-fadeIn">
          <div className="flex items-center justify-between mb-2">
            <span className="text-cyan-400 font-bold flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" /> Search Chennai Landmark
            </span>
            <button
              onClick={() => setIsSearchingLocation(false)}
              className="text-zinc-500 hover:text-white"
            >
              ✕
            </button>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleLocationSearch(e.target.value)}
            placeholder="e.g. Tambaram, Chromepet, Guindy..."
            autoFocus
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400 mb-2"
          />
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {searchResults.map((res, i) => (
              <button
                key={i}
                onClick={() => handleSelectSearchResult(res)}
                className="w-full text-left p-2 rounded hover:bg-zinc-800 border border-transparent hover:border-zinc-700 text-zinc-300 hover:text-cyan-300 transition-all flex flex-col"
              >
                <span className="font-bold">{res.place_name || res.formatted_address.split(',')[0]}</span>
                <span className="text-[10px] text-zinc-500 truncate">{res.formatted_address}</span>
              </button>
            ))}
            {searchResults.length === 0 && searchQuery.length >= 2 && (
              <div className="p-2 text-zinc-500 text-center text-[11px]">
                No places found. Try another landmark name.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mapbox Container */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full ${providerMode !== 'mapbox' ? 'hidden' : ''}`}
      />

      {/* Tactical Canvas Container (Degraded Offline Mode) */}
      {providerMode === 'canvas' && (
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className={`w-full h-full block ${isDropPinMode ? 'cursor-crosshair' : 'cursor-default'}`}
        />
      )}

      {/* Engine Status Badge (Bottom Left) */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 bg-zinc-950/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800 text-[10px] text-zinc-400 font-mono shadow-xl">
        <div className={`h-2 w-2 rounded-full ${providerMode === 'canvas' ? 'bg-cyan-400' : 'bg-emerald-400'} animate-pulse`} />
        <span>
          {providerMode === 'google'
            ? 'GOOGLE MAPS PLATFORM • LIVE'
            : providerMode === 'mapbox'
            ? 'MAPBOX GL • LIVE'
            : 'TACTICAL VECTOR RADAR GRID (OFFLINE)'}
        </span>
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-3 bg-zinc-950/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800 text-[10px] text-zinc-300 font-mono shadow-lg">
        {emergency && (
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500"></span>
            <span>Emergency</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400"></span>
          <span>Ambulance</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
          <span>Hospital</span>
        </div>
        {incidents.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
            <span>Hazard</span>
          </div>
        )}
      </div>
    </div>
  );
};
