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
  NearbyHospitalItem
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

  // Real Google Places Hospitals Discovery State
  const [liveHospitals, setLiveHospitals] = useState<NearbyHospitalItem[]>([]);
  const [hospitalsLoading, setHospitalsLoading] = useState<boolean>(false);
  const [hospitalsSource, setHospitalsSource] = useState<string>('GOOGLE_PLACES');

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
  const hasConfirmedLocation = Boolean(currentLocation || emergency);

  // 2. Query Real Nearby Hospitals from Google Places when confirmed location is available
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

  // 3. Initialize / Update Google Maps
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
      : (liveHospitals.length > 0 ? liveHospitals : allHospitals.slice(0, 5));

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

    // Add Ambulance Marker
    if (selectedAmbulance) {
      const ambMarker = new g.maps.Marker({
        position: { lat: selectedAmbulance.latitude, lng: selectedAmbulance.longitude },
        map,
        title: `🚑 ${selectedAmbulance.vehicle_number} (${selectedAmbulance.capability})`,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#06b6d4',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });
      googleMarkersRef.current.push(ambMarker);
    }

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
  }, [providerMode, emergency, currentLocation, selectedAmbulance, selectedHospital, selectedRoute, liveHospitals, allHospitals, activeLat, activeLon, hasConfirmedLocation]);

  // 4. Location Search Handler
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

  // 5. Browser GPS Acquisition Handler
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
        alert(`Location access denied: ${err.message}`);
        setIsAcquiringGps(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // 6. Pin Drop / Map Click Handler
  const handleMapCoordinateClick = async (lat: number, lon: number) => {
    if (onMapClick) onMapClick(lat, lon);
    if (isDropPinMode || onLocationAcquired) {
      let address = `Pin Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
      try {
        const rev = await lifelineApi.reverseGeocode(lat, lon);
        if (rev?.formatted_address) address = rev.formatted_address;
      } catch (e) {
        console.warn('Reverse geocode error:', e);
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
      : (liveHospitals.length > 0 ? liveHospitals : allHospitals.slice(0, 5));

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

    // Ambulances
    const displayAmbulances = selectedAmbulance ? [selectedAmbulance] : allAmbulances.slice(0, 3);
    displayAmbulances.forEach((amb) => {
      const ax = toCanvasX(amb.longitude);
      const ay = toCanvasY(amb.latitude);
      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.arc(ax, ay, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#06b6d4';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`🚑 ${amb.vehicle_number}`, ax + 10, ay + 3);
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
      ctx.arc(ex, ey, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = emergency ? '#ef4444' : '#38bdf8';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(emergency ? `🚨 SCENE: ${emergency.incident_type}` : `📍 Your Location`, ex + 14, ey + 4);
    }
  }, [emergency, currentLocation, selectedAmbulance, selectedHospital, selectedRoute, liveHospitals, allAmbulances, allHospitals, providerMode, activeLat, activeLon, hasConfirmedLocation]);

  useEffect(() => {
    if (providerMode === 'canvas') {
      renderFallbackCanvas();
      const handleResize = () => renderFallbackCanvas();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [providerMode, renderFallbackCanvas]);

  return (
    <div className={`relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 ${className}`}>
      {/* Location Acquisition Header Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
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
            {isAcquiringGps ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
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
              <span className="font-bold truncate max-w-[200px]">
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
            </div>
          )}
        </div>
      </div>

      {/* Location Search Autocomplete Popup */}
      {isSearchingLocation && (
        <div className="absolute top-16 left-3 z-30 w-80 bg-zinc-950/95 backdrop-blur-md border border-cyan-500/40 rounded-xl p-3 shadow-2xl font-mono text-xs animate-fadeIn">
          <div className="flex items-center justify-between mb-2">
            <span className="text-cyan-400 font-bold flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" /> Search Location
            </span>
            <button onClick={() => setIsSearchingLocation(false)} className="text-zinc-500 hover:text-white">✕</button>
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
          </div>
        </div>
      )}

      {/* Google Maps / Mapbox Container */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full ${providerMode === 'canvas' ? 'hidden' : ''}`}
      />

      {/* Tactical Canvas Container (Degraded Offline Mode) */}
      {providerMode === 'canvas' && (
        <canvas
          ref={canvasRef}
          onClick={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const width = canvas.width;
            const height = canvas.height;
            const scale = Math.min(width, height) * 12.0;
            const clickedLon = activeLon + (x - width / 2) / scale;
            const clickedLat = activeLat - (y - height / 2) / scale;
            handleMapCoordinateClick(clickedLat, clickedLon);
          }}
          className={`w-full h-full block ${isDropPinMode ? 'cursor-crosshair' : 'cursor-default'}`}
        />
      )}

      {/* Live Data Provenance Badge (Bottom Left) */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 bg-zinc-950/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800 text-[10px] text-zinc-400 font-mono shadow-xl">
        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>
          {providerMode === 'google'
            ? 'GOOGLE MAPS PLATFORM • LIVE'
            : providerMode === 'mapbox'
            ? 'MAPBOX GL • LIVE'
            : 'TACTICAL RADAR CANVAS'}
        </span>
        <span className="text-zinc-600">|</span>
        <span className="text-emerald-400">
          {liveHospitals.length > 0
            ? `HOSPITALS: LIVE (${liveHospitals.length} Places)`
            : 'HOSPITALS: Awaiting Location'}
        </span>
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-3 bg-zinc-950/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800 text-[10px] text-zinc-300 font-mono shadow-lg">
        {hasConfirmedLocation && (
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500"></span>
            <span>Scene</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
          <span>Hospital (Google Places)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400"></span>
          <span>Ambulance</span>
        </div>
      </div>
    </div>
  );
};
