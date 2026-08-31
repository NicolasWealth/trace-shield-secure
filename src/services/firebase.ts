/**
 * Isolated Firebase configuration.
 * All values come from environment variables (see .env.example).
 * When the config is incomplete the app falls back to the local demo store.
 */
import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env["VITE_FIREBASE_API_KEY"],
  authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"],
  projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"],
  storageBucket: import.meta.env["VITE_FIREBASE_STORAGE_BUCKET"],
  messagingSenderId: import.meta.env["VITE_FIREBASE_MESSAGING_SENDER_ID"],
  appId: import.meta.env["VITE_FIREBASE_APP_ID"],
} as Record<string, string | undefined>;

export const firebaseConfig = config;

export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId);
}

let appPromise: Promise<FirebaseApp> | null = null;
let dbPromise: Promise<Firestore> | null = null;

export async function getFirebaseApp(): Promise<FirebaseApp> {
  if (!appPromise) {
    appPromise = (async () => {
      const { initializeApp, getApps, getApp } = await import("firebase/app");
      return getApps().length ? getApp() : initializeApp(config as never);
    })();
  }
  return appPromise;
}

export async function getDb(): Promise<Firestore> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const { getFirestore } = await import("firebase/firestore");
      return getFirestore(await getFirebaseApp());
    })();
  }
  return dbPromise;
}

/** Firestore collection names, kept in one place. */
export const COLLECTIONS = {
  users: "users",
  organizations: "organizations",
  batches: "batches",
  events: "events",
  incidents: "incidents",
  analyses: "analyses",
} as const;
