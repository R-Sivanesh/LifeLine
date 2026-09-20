import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, Database } from 'firebase/database';
import { LiveAmbulanceGPS, LiveAmbulanceStatus } from '../types';
import { lifelineApi } from './api';

// Firebase Client Configuration
const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim(),
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'lifeline-emergency'}.firebaseapp.com`).trim(),
  databaseURL: (import.meta.env.VITE_FIREBASE_DATABASE_URL || '').trim(),
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || 'lifeline-emergency').trim(),
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'lifeline-emergency'}.appspot.com`).trim(),
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
  appId: (import.meta.env.VITE_FIREBASE_APP_ID || '').trim()
};

let app: any = null;
let db: any = null;
let isFirebaseConfigured = false;

try {
  if (firebaseConfig.apiKey && (firebaseConfig.databaseURL || firebaseConfig.projectId)) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    if (firebaseConfig.databaseURL) {
      db = getDatabase(app);
      isFirebaseConfigured = true;
    }
  }
} catch (e) {
  console.warn('Firebase initialization note (using REST/WebSocket synchronization fallback):', e);
}

/**
 * Calculates freshness category and display text for GPS coordinates
 */
export function getAmbulanceFreshness(updatedAt: number): {
  status: 'LIVE' | 'STALE' | 'OFFLINE';
  text: string;
  badgeClass: string;
  ageSeconds: number;
} {
  const now = Date.now();
  // Normalize timestamp if in seconds
  const tsMs = updatedAt < 1e11 ? updatedAt * 1000 : updatedAt;
  const ageSeconds = Math.max(0, Math.round((now - tsMs) / 1000));

  if (ageSeconds <= 30) {
    return {
      status: 'LIVE',
      text: `LIVE • Updated ${ageSeconds <= 1 ? 'just now' : `${ageSeconds}s ago`}`,
      badgeClass: 'bg-emerald-950 text-emerald-300 border-emerald-500/40',
      ageSeconds
    };
  } else if (ageSeconds <= 60) {
    return {
      status: 'STALE',
      text: `⚠️ LOCATION STALE • ${ageSeconds}s ago`,
      badgeClass: 'bg-amber-950 text-amber-300 border-amber-500/40',
      ageSeconds
    };
  } else {
    return {
      status: 'OFFLINE',
      text: `🔴 OFFLINE • ${ageSeconds}s ago`,
      badgeClass: 'bg-red-950 text-red-300 border-red-500/40',
      ageSeconds
    };
  }
}

/**
 * Publishes real-time GPS telemetry from ambulance phone/tracker to Firebase Realtime Database
 * and synchronizes with LifeLine backend.
 */
export async function publishAmbulanceGPS(telemetry: {
  id: string;
  vehicle_number?: string;
  capability?: 'BASIC' | 'ADVANCED' | 'ICU';
  status: LiveAmbulanceStatus;
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
}): Promise<void> {
  const now = Date.now();
  const payload: LiveAmbulanceGPS = {
    id: telemetry.id,
    vehicle_number: telemetry.vehicle_number || `${telemetry.id} (Live GPS)`,
    capability: telemetry.capability || 'ADVANCED',
    status: telemetry.status,
    latitude: telemetry.latitude,
    longitude: telemetry.longitude,
    speed: telemetry.speed ?? null,
    heading: telemetry.heading ?? null,
    accuracy: telemetry.accuracy ?? null,
    updated_at: now,
    source: 'LIVE_GPS',
    freshness_status: 'LIVE'
  };

  // 1. Write to Firebase RTDB if configured
  if (db && isFirebaseConfigured) {
    try {
      const ambRef = ref(db, `ambulances/${telemetry.id}`);
      await set(ambRef, payload);
    } catch (err) {
      console.warn('Firebase RTDB write error:', err);
    }
  }

  // 2. Synchronize to LifeLine Backend API
  try {
    await lifelineApi.sendAmbulanceTelemetry(payload);
  } catch (err) {
    console.warn('Backend telemetry sync note:', err);
  }
}

/**
 * Subscribes to real-time ambulance updates via Firebase Realtime Database listener
 * and periodic polling synchronization.
 */
export function subscribeToAmbulanceUpdates(
  callback: (ambulances: LiveAmbulanceGPS[]) => void
): () => void {
  let isMounted = true;
  let unsubscribeFirebase: (() => void) | null = null;

  // 1. Firebase Realtime Database Listener
  if (db && isFirebaseConfigured) {
    try {
      const ambulancesRef = ref(db, 'ambulances');
      unsubscribeFirebase = onValue(ambulancesRef, (snapshot: any) => {
        if (!isMounted) return;
        const val = snapshot.val();
        if (val) {
          const list: LiveAmbulanceGPS[] = Object.values(val).map((item: any) => {
            const freshness = getAmbulanceFreshness(item.updated_at || Date.now());
            return {
              ...item,
              freshness_status: freshness.status
            };
          });
          callback(list);
        } else {
          callback([]);
        }
      });
    } catch (e) {
      console.warn('Firebase onValue listener error:', e);
    }
  }

  // 2. Continuous Backend Polling Fallback (every 3 seconds) for cross-device reliability
  const pollBackend = async () => {
    if (!isMounted) return;
    try {
      const res = await lifelineApi.getLiveAmbulances();
      if (res && res.ambulances) {
        const enriched = res.ambulances.map((item: any) => {
          const freshness = getAmbulanceFreshness(item.updated_at || Date.now());
          return {
            ...item,
            freshness_status: freshness.status
          };
        });
        callback(enriched);
      }
    } catch (e) {
      // Backend poll error
    }
  };

  pollBackend();
  const intervalId = setInterval(pollBackend, 3000);

  return () => {
    isMounted = false;
    if (unsubscribeFirebase) unsubscribeFirebase();
    clearInterval(intervalId);
  };
}
