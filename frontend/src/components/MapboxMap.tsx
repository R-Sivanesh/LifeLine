import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Emergency, AmbulanceRecommendation, HospitalRecommendation, RouteOption, RoadIncident, Ambulance, Hospital } from '../types';
import { AlertTriangle, Shield, Navigation, Building2, Flame } from 'lucide-react';

// Set public access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';

interface MapboxMapProps {
  emergency?: Emergency | null;
  selectedAmbulance?: AmbulanceRecommendation | null;
  selectedHospital?: HospitalRecommendation | null;
  selectedRoute?: RouteOption | null;
  alternativeRoutes?: RouteOption[];
  blockedRoute?: RouteOption | null;
  allAmbulances?: Ambulance[];
  allHospitals?: Hospital[];
  incidents?: RoadIncident[];
  onMapClick?: (lat: number, lon: number) => void;
  className?: string;
}

export const MapboxMap: React.FC<MapboxMapProps> = ({
  emergency,
  selectedAmbulance,
  selectedHospital,
  selectedRoute,
  alternativeRoutes = [],
  blockedRoute,
  allAmbulances = [],
  allHospitals = [],
  incidents = [],
  onMapClick,
  className = 'h-[500px] w-full'
}) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    try {
      const defaultCenter: [number, number] = [
        emergency?.longitude || 80.2300,
        emergency?.latitude || 13.0380
      ];

      const newMap = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: defaultCenter,
        zoom: 12.8,
        attributionControl: false
      });

      newMap.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');
      newMap.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

      newMap.on('click', (e) => {
        if (onMapClick) {
          onMapClick(e.lngLat.lat, e.lngLat.lng);
        }
      });

      newMap.on('error', (e) => {
        console.warn('Mapbox GL error:', e);
      });

      map.current = newMap;
    } catch (err: any) {
      console.error('Failed to initialize Mapbox:', err);
      setMapError('Interactive map initializing with local canvas fallback.');
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update Markers & Layers
  useEffect(() => {
    if (!map.current) return;
    const m = map.current;

    // Clear previous DOM markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const bounds = new mapboxgl.LngLatBounds();
    let hasPoints = false;

    // 1. Emergency Marker
    if (emergency) {
      const el = document.createElement('div');
      el.className = 'custom-marker';
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="absolute -inset-2 rounded-full bg-red-500/40 animate-ping"></div>
          <div class="h-9 w-9 rounded-full bg-red-600 border-2 border-white flex items-center justify-center text-white shadow-xl shadow-red-600/50">
            <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 4v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg>
          </div>
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div class="font-sans">
          <div class="text-[10px] font-bold text-red-400 uppercase tracking-wide">CRITICAL EMERGENCY</div>
          <div class="font-bold text-sm text-white">${emergency.title || 'Emergency Scene'}</div>
          <div class="text-xs text-zinc-300 mt-1">${emergency.description}</div>
          <div class="mt-2 text-[11px] text-zinc-400 font-mono">
            Patients: <span class="text-red-400 font-bold">${emergency.patient_count} (${emergency.critical_patient_count} Critical)</span>
          </div>
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([emergency.longitude, emergency.latitude])
        .setPopup(popup)
        .addTo(m);

      markersRef.current.push(marker);
      bounds.extend([emergency.longitude, emergency.latitude]);
      hasPoints = true;
    }

    // 2. Selected Ambulance Marker
    if (selectedAmbulance) {
      const el = document.createElement('div');
      el.className = 'custom-marker';
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="absolute -inset-1.5 rounded-full bg-cyan-500/40 animate-pulse"></div>
          <div class="h-8 w-8 rounded-full bg-cyan-600 border-2 border-cyan-200 flex items-center justify-center text-white shadow-lg shadow-cyan-500/50">
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
          </div>
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div class="font-sans">
          <div class="text-[10px] font-bold text-cyan-400 uppercase">ASSIGNED AMBULANCE</div>
          <div class="font-bold text-sm text-white">${selectedAmbulance.vehicle_number}</div>
          <div class="text-xs text-zinc-300 mt-1">Capability: <span class="font-semibold text-cyan-300">${selectedAmbulance.capability}</span></div>
          <div class="text-xs text-zinc-400 font-mono mt-1">ETA to Scene: <span class="text-white font-bold">${selectedAmbulance.eta_minutes} min</span> (${selectedAmbulance.distance_km} km)</div>
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([selectedAmbulance.longitude, selectedAmbulance.latitude])
        .setPopup(popup)
        .addTo(m);

      markersRef.current.push(marker);
      bounds.extend([selectedAmbulance.longitude, selectedAmbulance.latitude]);
      hasPoints = true;
    }

    // 3. Selected Hospital Marker
    if (selectedHospital) {
      const el = document.createElement('div');
      el.className = 'custom-marker';
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="absolute -inset-1.5 rounded-full bg-emerald-500/40 animate-pulse"></div>
          <div class="h-8 w-8 rounded-full bg-emerald-600 border-2 border-emerald-200 flex items-center justify-center text-white shadow-lg shadow-emerald-500/50">
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M19 10.5V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4.5l4 4v-11l-4 4zM10 7h4v2h-4V7zm0 4h4v2h-4v-2zm-3 4h10v2H7v-2z"/></svg>
          </div>
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div class="font-sans">
          <div class="text-[10px] font-bold text-emerald-400 uppercase">DESTINATION HOSPITAL</div>
          <div class="font-bold text-sm text-white">${selectedHospital.name}</div>
          <div class="text-xs text-zinc-300 mt-1">
            ${selectedHospital.trauma_capable ? '✓ Level-1 Trauma' : '• General ER'} | 
            ${selectedHospital.icu_available ? '✓ ICU Available' : '• No ICU'}
          </div>
          <div class="text-xs text-emerald-300 font-mono mt-1">
            Simulated Beds Open: ${selectedHospital.available_beds} | Transit ETA: ${selectedHospital.eta_minutes}m
          </div>
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([selectedHospital.longitude, selectedHospital.latitude])
        .setPopup(popup)
        .addTo(m);

      markersRef.current.push(marker);
      bounds.extend([selectedHospital.longitude, selectedHospital.latitude]);
      hasPoints = true;
    }

    // 4. Road Incidents Markers
    incidents.forEach((inc) => {
      const el = document.createElement('div');
      el.className = 'custom-marker';
      const isBlocked = inc.type === 'ROAD_BLOCK' || inc.severity === 'CRITICAL';
      
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          ${isBlocked ? '<div class="absolute -inset-2 rounded-full bg-red-600/60 animate-ping"></div>' : ''}
          <div class="h-7 w-7 rounded-full ${isBlocked ? 'bg-red-700 border-2 border-red-300' : 'bg-amber-600 border-2 border-amber-300'} flex items-center justify-center text-white shadow-md">
            <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
          </div>
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 20 }).setHTML(`
        <div class="font-sans">
          <div class="text-[10px] font-bold ${isBlocked ? 'text-red-400' : 'text-amber-400'} uppercase">
            ${inc.type} (${inc.severity})
          </div>
          <div class="font-semibold text-xs text-white">${inc.description || 'Active Road Disruption'}</div>
          <div class="text-[10px] text-zinc-400 font-mono mt-1">Impact Radius: ${inc.radius_meters}m</div>
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([inc.longitude, inc.latitude])
        .setPopup(popup)
        .addTo(m);

      markersRef.current.push(marker);
    });

    // 5. Render Polylines on Map Load / State Change
    const renderRoutes = () => {
      // Primary Selected Route
      if (m.getSource('selected-route-source')) {
        (m.getSource('selected-route-source') as mapboxgl.GeoJSONSource).setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: selectedRoute?.geometry || []
          }
        });
      } else if (selectedRoute && selectedRoute.geometry) {
        m.addSource('selected-route-source', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: selectedRoute.geometry
            }
          }
        });

        // Glowing casing
        m.addLayer({
          id: 'selected-route-casing',
          type: 'line',
          source: 'selected-route-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': selectedRoute.risk_level === 'BLOCKED' ? '#ef4444' : '#06b6d4',
            'line-width': 8,
            'line-opacity': 0.4
          }
        });

        // Inner solid line
        m.addLayer({
          id: 'selected-route-line',
          type: 'line',
          source: 'selected-route-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': selectedRoute.risk_level === 'BLOCKED' ? '#dc2626' : '#22d3ee',
            'line-width': 4,
            'line-opacity': 0.95
          }
        });
      }

      // Alternative Routes
      const altCoords = alternativeRoutes.flatMap((alt) => alt.geometry || []);
      if (m.getSource('alt-routes-source')) {
        (m.getSource('alt-routes-source') as mapboxgl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: alternativeRoutes.map((alt) => ({
            type: 'Feature',
            properties: { id: alt.id },
            geometry: {
              type: 'LineString',
              coordinates: alt.geometry || []
            }
          }))
        });
      } else if (alternativeRoutes.length > 0) {
        m.addSource('alt-routes-source', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: alternativeRoutes.map((alt) => ({
              type: 'Feature',
              properties: { id: alt.id },
              geometry: {
                type: 'LineString',
                coordinates: alt.geometry || []
              }
            }))
          }
        });

        m.addLayer({
          id: 'alt-routes-line',
          type: 'line',
          source: 'alt-routes-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#94a3b8',
            'line-width': 2.5,
            'line-dasharray': [2, 2],
            'line-opacity': 0.6
          }
        });
      }
    };

    if (m.isStyleLoaded()) {
      renderRoutes();
    } else {
      m.once('load', renderRoutes);
    }

    // Auto fit bounds
    if (hasPoints && !bounds.isEmpty()) {
      try {
        m.fitBounds(bounds, { padding: 60, maxZoom: 14.5, duration: 800 });
      } catch (e) {
        // Safe ignore
      }
    }
  }, [emergency, selectedAmbulance, selectedHospital, selectedRoute, alternativeRoutes, incidents]);

  return (
    <div className={`relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900 shadow-2xl ${className}`}>
      <div ref={mapContainer} className="h-full w-full" />
      
      {/* Map Overlay Badge */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-zinc-950/80 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-zinc-800 text-[11px] text-zinc-300 shadow-lg">
        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
        <span className="font-mono font-semibold">CHENNAI TACTICAL GRID</span>
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-3 right-3 z-10 hidden sm:flex items-center gap-3 bg-zinc-950/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800 text-[10px] text-zinc-300 font-mono">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500"></span>
          <span>Emergency</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400"></span>
          <span>Ambulance</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
          <span>Hospital</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
          <span>Hazard</span>
        </div>
      </div>
    </div>
  );
};
