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
  LocationSearchResult,
  NearbyHospitalItem,
  LiveAmbulanceGPS
} from '../types';
import { lifelineApi } from '../services/api';
import { subscribeToAmbulanceUpdates, getAmbulanceFreshness } from '../services/firebase';
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
  Navigation,
  Radio
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
  isDemoMode?: boolean;
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
  className = 'h-[520px] w-full',
  isDemoMode = false
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [providerMode, setProviderMode] = useState<'google' | 'mapbox' | 'canvas'>('canvas');
  const [mapError, setMapError] = useState<string | null>(null);

  // Real Google Places Hospitals Discovery State
  const [liveHospitals, setLiveHospitals] = useState<NearbyHospitalItem[]>([]);
  const [hospitalsLoading, setHospitalsLoading] = useState<boolean>(false);
  const [hospitalsSource, setHospitalsSource] = useState<string>('GOOGLE_PLACES');

  // Real-Time GPS Ambulances Stream (Firebase Realtime Database)
  const [liveAmbulances, setLiveAmbulances] = useState<LiveAmbulanceGPS[]>([]);

  // Location Acquisition UI states
  const [isAcquiringGps, setIsAcquiringGps] = useState(false);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [isDropPinMode, setIsDropPinMode] = useState(false);

  // Instances
  const googleMapRef = useRef<any>(null);
  const googleMarkersRef = useRef<any[]>([]);
  const googlePolylinesRef = useRef<any[]>([]);

  const mapboxMapRef = useRef<mapboxgl.Map | null>(null);

  const googleApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const mapboxToken = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '').trim();

  const hasGoogleKey = Boolean(googleApiKey && !googleApiKey.startsWith('your_'));
  const hasMapboxToken = Boolean(mapboxToken && !mapboxToken.startsWith('your_') && mapboxToken.startsWith('pk.'));

  // 1. Subscribe to Live GPS Ambulances (Firebase RTDB + Polling Fallback)
  useEffect(() => {
    const unsubscribe = subscribeToAmbulanceUpdates((ambList) => {
      setLiveAmbulances(ambList);
    });
    return () => unsubscribe();
  }, []);

  // 2. Determine active map provider
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
  const hasConfirmedLocation = Boolean(currentLocation || emergency);

  // 3. Query Real Nearby Hospitals from Google Places when confirmed location is available
  useEffect(() => {
    const lat = emergency?.latitude || currentLocation?.latitude;
    const lng = emergency?.longitude || currentLocation?.longitude;

    if (lat && lng && (lat !== 0 || lng !== 0)) {
      setHospitalsLoading(true);
      lifelineApi.getNearbyHospitals(lat, lng, 8000)
        .then((res: any) => {
          if (res?.hospitals) {
            setLiveHospitals(res.hospitals);
            setHospitalsSource(res.source || 'GOOGLE_PLACES');
          }
        })
        .catch((err: any) => {
          console.warn('Google Places discovery error:', err);
        })
        .finally(() => setHospitalsLoading(false));
    } else {
      setLiveHospitals([]);
    }
  }, [emergency?.latitude, emergency?.longitude, currentLocation?.latitude, currentLocation?.longitude]);

  // 4. Initialize / Update Google Maps
  useEffect(() => {
    if (providerMode !== 'google' || !mapContainerRef.current) return;
    const g = (window as any).google;
    if (!g || !g.maps) return;

    if (!googleMapRef.current) {
      const map = new g.maps.Map(mapContainerRef.current, {
        center: { lat: activeLat, lng: activeLon },
        zoom: 13,
        styles: DARK_GOOGLE_MAP_STYLE,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });

      map.addListener('click', (e: any) => {
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        handleMapCoordinateClick(lat, lng);
      });

      googleMapRef.current = map;
    } else {
      googleMapRef.current.setCenter({ lat: activeLat, lng: activeLon });
    }

    const map = googleMapRef.current;

    // Clear old markers & polylines
    googleMarkersRef.current.forEach((m) => m.setMap(null));
    googleMarkersRef.current = [];
    googlePolylinesRef.current.forEach((p) => p.setMap(null));
    googlePolylinesRef.current = [];

    // Add Scene Marker
    if (hasConfirmedLocation) {
      const sceneMarker = new g.maps.Marker({
        position: { lat: activeLat, lng: activeLon },
        map,
        title: emergency ? `🚨 EMERGENCY: ${emergency.incident_type}` : `📍 Your Location`,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#ef4444',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });
      googleMarkersRef.current.push(sceneMarker);
    }

    // Add Real Google Places Hospital Markers
    const displayHospitals = selectedHospital
      ? [selectedHospital]
      : (liveHospitals.length > 0 ? liveHospitals : (isDemoMode ? allHospitals.slice(0, 5) : []));

    displayHospitals.forEach((hosp: any) => {
      const isSelected = selectedHospital && (selectedHospital.hospital_id === hosp.id || selectedHospital.name === hosp.name);
      const isLive = hosp.source === 'GOOGLE_PLACES' || hosp.source?.includes('Google Places');
      
      const hospMarker = new g.maps.Marker({
        position: { lat: hosp.latitude, lng: hosp.longitude },
        map,
        title: `🏥 ${hosp.name}`,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: isSelected ? 10 : 7,
          fillColor: '#10b981',
          fillOpacity: 1,
          strokeColor: isSelected ? '#ffffff' : '#a7f3d0',
          strokeWeight: isSelected ? 3 : 1.5
        }
      });

      const infoWindow = new g.maps.InfoWindow({
        content: `
          <div style="color: #18181b; font-family: monospace; font-size: 11px; padding: 4px;">
            <strong style="color: #047857; font-size: 12px;">🏥 ${hosp.name}</strong><br/>
            <span>${hosp.address || ''}</span><br/>
            <span style="display:inline-block; margin-top:3px; background:#ecfdf5; color:#065f46; padding:1px 4px; border-radius:3px; font-weight:bold; font-size:10px;">
              ${isLive ? 'LIVE • Google Places (New)' : 'DEMO HOSPITAL'}
            </span>
          </div>
        `
      });

      hospMarker.addListener('click', () => {
        infoWindow.open(map, hospMarker);
      });

      googleMarkersRef.current.push(hospMarker);
    });

    // Add Live GPS Ambulances (or selected live ambulance)
    const activeAmbulancesToRender: Array<any> = selectedAmbulance
      ? [selectedAmbulance]
      : (liveAmbulances.length > 0 ? liveAmbulances : (isDemoMode ? allAmbulances.slice(0, 3) : []));

    activeAmbulancesToRender.forEach((amb) => {
      const isSelected = selectedAmbulance && (selectedAmbulance.ambulance_id === amb.id || selectedAmbulance.vehicle_number === amb.vehicle_number);
      const isLiveGps = amb.source === 'LIVE_GPS' || amb.updated_at !== undefined;
      const freshness = isLiveGps ? getAmbulanceFreshness(amb.updated_at || Date.now()) : { status: 'DEMO', text: 'DEMO TELEMETRY' };
      
      let fillColor = '#06b6d4'; // Cyan for Live
      if (freshness.status === 'STALE') fillColor = '#f59e0b'; // Amber
      else if (freshness.status === 'OFFLINE') fillColor = '#ef4444'; // Red

      const ambMarker = new g.maps.Marker({
        position: { lat: amb.latitude, lng: amb.longitude },
        map,
        title: `🚑 ${amb.vehicle_number} (${amb.capability}) [${freshness.text}]`,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: isSelected ? 10 : 7.5,
          fillColor: fillColor,
          fillOpacity: 1,
          strokeColor: isSelected ? '#ffffff' : '#e0f2fe',
          strokeWeight: isSelected ? 3 : 1.5
        }
      });

      const infoWindow = new g.maps.InfoWindow({
        content: `
          <div style="color: #18181b; font-family: monospace; font-size: 11px; padding: 4px;">
            <strong style="color: #0284c7; font-size: 12px;">🚑 ${amb.vehicle_number}</strong><br/>
            <span>Capability: <strong>${amb.capability}</strong></span><br/>
            <span>Status: <strong>${amb.status || 'AVAILABLE'}</strong></span><br/>
            <span style="display:inline-block; margin-top:3px; padding:2px 5px; border-radius:3px; font-weight:bold; font-size:10px; background:${freshness.status === 'LIVE' ? '#ecfdf5; color:#065f46;' : freshness.status === 'STALE' ? '#fffbeb; color:#92400e;' : '#fef2f2; color:#991b1b;'}">
              ${freshness.text}
            </span>
            ${amb.speed ? `<br/><span>Speed: ${amb.speed} km/h</span>` : ''}
          </div>
        `
      });

      ambMarker.addListener('click', () => {
        infoWindow.open(map, ambMarker);
      });

      googleMarkersRef.current.push(ambMarker);
    });

    // Add Route Polyline
    if (selectedRoute && selectedRoute.geometry && selectedRoute.geometry.length > 1) {
      const pathCoords = selectedRoute.geometry.map(([lon, lat]: [number, number]) => ({ lat, lng: lon }));
      const polyline = new g.maps.Polyline({
        path: pathCoords,
        geodesic: true,
        strokeColor: selectedRoute.risk_level === 'BLOCKED' ? '#ef4444' : '#06b6d4',
        strokeOpacity: 0.9,
        strokeWeight: 4,
        map
      });
      googlePolylinesRef.current.push(polyline);
    }
  }, [
    providerMode,
    emergency,
    currentLocation,
    selectedAmbulance,
    selectedHospital,
    selectedRoute,
    liveHospitals,
    liveAmbulances,
    allHospitals,
    allAmbulances,
    activeLat,
    activeLon,
    hasConfirmedLocation,
    isDemoMode
  ]);

  // 5. Location Search Handler
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

  // 6. Browser GPS Acquisition Handler
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setIsAcquiringGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        try {
          const rev = await lifelineApi.reverseGeocode(latitude, longitude);
          if (onLocationAcquired) {
            onLocationAcquired({
              formatted_address: rev.formatted_address,
              latitude,
              longitude,
              place_name: rev.place_name || 'My Location',
              source: 'USER_GPS',
              accuracy_meters: Math.round(accuracy)
            });
          }
        } catch (e) {
          if (onLocationAcquired) {
            onLocationAcquired({
              formatted_address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
              latitude,
              longitude,
              place_name: 'GPS Coordinates',
              source: 'USER_GPS',
              accuracy_meters: Math.round(accuracy)
            });
          }
        } finally {
          setIsAcquiringGps(false);
        }
      },
      (err) => {
        console.warn('GPS location error:', err);
        setIsAcquiringGps(false);
        alert('Could not acquire your location. Please check browser GPS permission.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Map Click Handler for Pin Drop
  const handleMapCoordinateClick = async (lat: number, lon: number) => {
    if (onMapClick) onMapClick(lat, lon);
    if (isDropPinMode) {
      let address = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      try {
        const rev = await lifelineApi.reverseGeocode(lat, lon);
        if (rev && rev.formatted_address) address = rev.formatted_address;
      } catch (e) {
        // Ignore
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

  // 7. Tactical Vector Canvas Renderer (Deterministic fallback)
  const renderFallbackCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || providerMode !== 'canvas') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = (canvas.width = canvas.parentElement?.clientWidth || 700);
    const height = (canvas.height = canvas.parentElement?.clientHeight || 520);

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

    // Real Google Places Hospitals
    const displayHospitals = selectedHospital
      ? [selectedHospital]
      : (liveHospitals.length > 0 ? liveHospitals : (isDemoMode ? allHospitals.slice(0, 5) : []));

    displayHospitals.forEach((hosp: any) => {
      const hx = toCanvasX(hosp.longitude);
      const hy = toCanvasY(hosp.latitude);
      const isSelected = selectedHospital && (selectedHospital.hospital_id === hosp.id || selectedHospital.name === hosp.name);
      
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(hx, hy, isSelected ? 9 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#ffffff' : '#a7f3d0';
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.stroke();

      ctx.fillStyle = '#10b981';
      ctx.font = isSelected ? 'bold 11px monospace' : '10px monospace';
      ctx.fillText(`🏥 ${hosp.name.slice(0, 18)}`, hx + 10, hy + 3);
    });

    // Live GPS Ambulances
    const displayAmbulances = selectedAmbulance
      ? [selectedAmbulance]
      : (liveAmbulances.length > 0 ? liveAmbulances : (isDemoMode ? allAmbulances.slice(0, 3) : []));

    displayAmbulances.forEach((amb: any) => {
      const ax = toCanvasX(amb.longitude);
      const ay = toCanvasY(amb.latitude);
      const freshness = amb.updated_at ? getAmbulanceFreshness(amb.updated_at) : { status: 'DEMO', text: 'DEMO' };

      ctx.fillStyle = freshness.status === 'LIVE' ? '#06b6d4' : freshness.status === 'STALE' ? '#f59e0b' : '#ef4444';
      ctx.beginPath();
      ctx.arc(ax, ay, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = ctx.fillStyle;
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`🚑 ${amb.vehicle_number} [${freshness.status}]`, ax + 10, ay + 3);
    });

    // Emergency Scene / Location Pin
    if (hasConfirmedLocation) {
      const ex = toCanvasX(activeLon);
      const ey = toCanvasY(activeLat);

      ctx.beginPath();
      ctx.strokeStyle = emergency ? 'rgba(239, 68, 68, 0.5)' : 'rgba(6, 182, 212, 0.5)';
      ctx.lineWidth = 2.5;
      ctx.arc(ex, ey, 14, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = emergency ? '#ef4444' : '#06b6d4';
      ctx.beginPath();
      ctx.arc(ex, ey, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 11px monospace';
      ctx.fillText(emergency ? '🚨 SCENE' : '📍 LOCATION', ex + 12, ey + 4);
    }
  }, [
    providerMode,
    activeLat,
    activeLon,
    selectedHospital,
    liveHospitals,
    allHospitals,
    selectedAmbulance,
    liveAmbulances,
    allAmbulances,
    hasConfirmedLocation,
    emergency,
    isDemoMode
  ]);

  useEffect(() => {
    if (providerMode === 'canvas') {
      renderFallbackCanvas();
    }
  }, [providerMode, renderFallbackCanvas]);

  return (
    <div className={`relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl flex flex-col ${className}`}>
      {/* Top Location Bar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/70 rounded-xl px-3 py-1.5 shadow-lg">
          <MapPin className="h-4 w-4 text-cyan-400 shrink-0" />
          <div className="text-xs font-mono font-bold text-white truncate max-w-[200px] sm:max-w-xs">
            {currentLocation ? (
              <span>{currentLocation.place_name || currentLocation.formatted_address}</span>
            ) : hasConfirmedLocation ? (
              <span>Confirmed Emergency Scene</span>
            ) : (
              <span className="text-amber-400">Waiting for confirmed location...</span>
            )}
          </div>
          {currentLocation?.source && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
              {currentLocation.source}
            </span>
          )}
        </div>

        {/* Action Controls: GPS & Search */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={isAcquiringGps}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-600/30 transition-all active:scale-95 disabled:opacity-60"
            title="Acquire exact GPS location"
          >
            {isAcquiringGps ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Crosshair className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">GPS</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSearchingLocation(!isSearchingLocation)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-md active:scale-95 ${
              isSearchingLocation
                ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                : 'bg-zinc-900/90 border-zinc-700 text-zinc-300 hover:text-white'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search</span>
          </button>
        </div>
      </div>

      {/* Floating Search Dropdown */}
      {isSearchingLocation && (
        <div className="absolute top-14 left-3 right-3 sm:right-auto sm:w-96 z-30 bg-zinc-900/95 backdrop-blur-md border border-zinc-700 rounded-2xl p-3 shadow-2xl space-y-2 pointer-events-auto animate-fadeIn">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleLocationSearch(e.target.value)}
              placeholder="Search station, landmark, or street in Chennai..."
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
              autoFocus
            />
          </div>

          {searchResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-950">
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectSearchResult(r)}
                  className="w-full text-left p-2.5 hover:bg-zinc-900 text-xs font-mono text-zinc-300 hover:text-cyan-300 transition-all flex flex-col"
                >
                  <span className="font-bold text-white">{r.place_name || r.formatted_address.split(',')[0]}</span>
                  <span className="text-[10px] text-zinc-500 truncate">{r.formatted_address}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Map Display Viewports */}
      <div className="flex-1 w-full relative">
        {providerMode === 'google' && (
          <div ref={mapContainerRef} className="w-full h-full min-h-[420px]" />
        )}

        {providerMode === 'mapbox' && (
          <div ref={mapContainerRef} className="w-full h-full min-h-[420px]" />
        )}

        {providerMode === 'canvas' && (
          <canvas ref={canvasRef} className="w-full h-full block" />
        )}
      </div>

      {/* Bottom Tactical Status Badges */}
      <div className="p-3 bg-zinc-900/95 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-zinc-400">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-zinc-300">
              Hospitals: {liveHospitals.length > 0 ? `${liveHospitals.length} LIVE (Google Places)` : 'Ready'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Radio className={`h-3 w-3 ${liveAmbulances.length > 0 ? 'text-cyan-400 animate-pulse' : 'text-zinc-600'}`} />
            <span className="text-zinc-300">
              Ambulance GPS: {liveAmbulances.length > 0 ? `${liveAmbulances.length} Streaming` : (isDemoMode ? 'Demo Fleet' : 'Awaiting Unit')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">
            Provider: {providerMode.toUpperCase()}
          </span>
          {hasConfirmedLocation && (
            <span className="text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              <span>Location Locked</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
