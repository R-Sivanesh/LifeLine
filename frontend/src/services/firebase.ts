import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set, onValue } from 'firebase/database';
import { LiveAmbulanceGPS, LiveAmbulanceStatus, DriverAlertItem } from '../types';
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
  console.warn('Firebase initialization note (using REST synchronization fallback):', e);
}

/**
 * Calculates freshness category and display text for GPS coordinates
 */
export function getAmbulanceFreshness(updatedAt: number, isDemo?: boolean): {
  status: 'LIVE' | 'STALE' | 'OFFLINE' | 'DEMO';
  text: string;
  badgeClass: string;
  ageSeconds: number;
} {
  const now = Date.now();
  const tsMs = updatedAt < 1e11 ? updatedAt * 1000 : updatedAt;
  const ageSeconds = Math.max(0, Math.round((now - tsMs) / 1000));

  if (isDemo) {
    return {
      status: 'DEMO',
      text: `🟠 DEMO TELEMETRY • Simulated (${ageSeconds <= 1 ? 'just now' : `${ageSeconds}s ago`})`,
      badgeClass: 'bg-amber-950 text-amber-300 border-amber-500/50',
      ageSeconds
    };
  }

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
  source?: 'LIVE_GPS' | 'DEMO_TELEMETRY' | string;
  freshness_status?: 'LIVE' | 'STALE' | 'OFFLINE' | 'DEMO' | string;
  is_demo?: boolean;
  demo_type?: string;
  driver_id?: string;
  driver_name?: string;
}): Promise<void> {
  const now = Date.now();
  const isDemo = Boolean(telemetry.is_demo);
  const payload: LiveAmbulanceGPS = {
    id: telemetry.id,
    vehicle_number: telemetry.vehicle_number || `${telemetry.id} (${isDemo ? 'Demo Telemetry' : 'Live GPS'})`,
    capability: telemetry.capability || 'ADVANCED',
    status: telemetry.status,
    latitude: telemetry.latitude,
    longitude: telemetry.longitude,
    speed: telemetry.speed ?? null,
    heading: telemetry.heading ?? null,
    accuracy: telemetry.accuracy ?? null,
    updated_at: now,
    source: telemetry.source || (isDemo ? 'DEMO_TELEMETRY' : 'LIVE_GPS'),
    freshness_status: telemetry.freshness_status || (isDemo ? 'DEMO' : 'LIVE'),
    is_demo: isDemo,
    demo_type: telemetry.demo_type,
    driver_id: telemetry.driver_id,
    driver_name: telemetry.driver_name
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
 * Subscribes to real-time ambulance fleet updates via Firebase Realtime Database
 */
export function subscribeToAmbulanceUpdates(
  callback: (ambulances: LiveAmbulanceGPS[]) => void
): () => void {
  let isMounted = true;
  let unsubscribeFirebase: (() => void) | null = null;

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
      // Backend poll fallback
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

/**
 * Subscribes to real-time dispatch alerts for a specific driver.
 * Triggers full-screen alert whenever a new dispatch alert is assigned to this driver.
 */
export function subscribeToDriverAlerts(
  driverId: string,
  onAlert: (alert: DriverAlertItem | null) => void
): () => void {
  let isMounted = true;
  let unsubscribeFirebase: (() => void) | null = null;

  if (db && isFirebaseConfigured) {
    try {
      const alertsRef = ref(db, `driver_alerts/${driverId}`);
      unsubscribeFirebase = onValue(alertsRef, (snapshot: any) => {
        if (!isMounted) return;
        const val = snapshot.val();
        if (val) {
          const pending = Object.values(val).find((a: any) => a.status === 'PENDING') as DriverAlertItem;
          onAlert(pending || null);
        } else {
          onAlert(null);
        }
      });
    } catch (e) {
      console.warn('Firebase driver alerts error:', e);
    }
  }

  const pollAlerts = async () => {
    if (!isMounted || !driverId) return;
    try {
      const alerts = await lifelineApi.getDriverAlerts(driverId);
      if (alerts && alerts.length > 0) {
        const pending = alerts.find((a) => a.status === 'PENDING');
        onAlert(pending || null);
      } else {
        onAlert(null);
      }
    } catch (e) {
      // Ignore polling errors
    }
  };

  pollAlerts();
  const intervalId = setInterval(pollAlerts, 2500);

  return () => {
    isMounted = false;
    if (unsubscribeFirebase) unsubscribeFirebase();
    clearInterval(intervalId);
  };
}

/**
 * Publishes an incoming emergency dispatch alert into Firebase RTDB for a driver.
 */
export async function publishDriverAlertToFirebase(
  driverId: string,
  alert: DriverAlertItem
): Promise<void> {
  if (db && isFirebaseConfigured) {
    try {
      const alertRef = ref(db, `driver_alerts/${driverId}/${alert.emergency_id}`);
      await set(alertRef, alert);
    } catch (e) {
      console.warn('Failed to write driver alert to Firebase:', e);
    }
  }
}
