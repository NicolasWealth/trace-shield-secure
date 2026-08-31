/**
 * Data access layer. Reads/writes Cloud Firestore when Firebase is configured,
 * otherwise falls back to a browser-local demo store seeded from demoData.ts.
 * UI components never talk to Firestore directly.
 */
import { COLLECTIONS, getDb, isFirebaseConfigured } from "./firebase";
import {
  demoBatches,
  demoEvents,
  demoIncidents,
  demoOrganizations,
} from "./demoData";
import type { Batch, CustodyEvent, Incident, Organization } from "@/types";

export type DataSource = "firestore" | "demo";

export function getDataSource(): DataSource {
  return isFirebaseConfigured() ? "firestore" : "demo";
}

/* ------------------------------------------------------------------ */
/* Local demo store                                                    */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "traceshield.demo.v1";

interface LocalDb {
  organizations: Organization[];
  batches: Batch[];
  events: CustodyEvent[];
  incidents: Incident[];
}

const seed = (): LocalDb => ({
  organizations: demoOrganizations,
  batches: demoBatches,
  events: demoEvents,
  incidents: demoIncidents,
});

let memory: LocalDb | null = null;

function local(): LocalDb {
  if (memory) return memory;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        memory = JSON.parse(raw) as LocalDb;
        return memory;
      }
    } catch {
      /* ignore corrupt storage */
    }
  }
  memory = seed();
  persist();
  return memory;
}

function persist() {
  if (typeof window === "undefined" || !memory) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    /* storage unavailable */
  }
}

/** Re-seed the demo network (used by the Settings page). */
export function reseedDemoData() {
  memory = seed();
  persist();
}

/* ------------------------------------------------------------------ */
/* Firestore helpers                                                   */
/* ------------------------------------------------------------------ */

async function fsList<T>(collectionName: string): Promise<T[]> {
  const db = await getDb();
  const { collection, getDocs } = await import("firebase/firestore");
  const snap = await getDocs(collection(db, collectionName));
  return snap.docs.map((d) => d.data() as T);
}

async function fsSet(collectionName: string, id: string, data: unknown) {
  const db = await getDb();
  const { doc, setDoc } = await import("firebase/firestore");
  await setDoc(doc(db, collectionName, id), data as Record<string, unknown>);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function listOrganizations(): Promise<Organization[]> {
  if (getDataSource() === "firestore") {
    const rows = await fsList<Organization>(COLLECTIONS.organizations);
    return rows.length ? rows : local().organizations;
  }
  return local().organizations;
}

export async function listBatches(): Promise<Batch[]> {
  if (getDataSource() === "firestore") {
    const rows = await fsList<Batch>(COLLECTIONS.batches);
    return rows.length ? rows : local().batches;
  }
  return local().batches;
}

export async function listEvents(): Promise<CustodyEvent[]> {
  if (getDataSource() === "firestore") {
    const rows = await fsList<CustodyEvent>(COLLECTIONS.events);
    return rows.length ? rows : local().events;
  }
  return local().events;
}

export async function listIncidents(): Promise<Incident[]> {
  if (getDataSource() === "firestore") {
    const rows = await fsList<Incident>(COLLECTIONS.incidents);
    return rows.length ? rows : local().incidents;
  }
  return local().incidents;
}

export async function createBatch(batch: Batch): Promise<Batch> {
  if (getDataSource() === "firestore") {
    await fsSet(COLLECTIONS.batches, batch.batchId, batch);
  } else {
    local().batches = [batch, ...local().batches];
    persist();
  }
  return batch;
}

export async function createEvent(event: CustodyEvent): Promise<CustodyEvent> {
  if (getDataSource() === "firestore") {
    await fsSet(COLLECTIONS.events, event.eventId, event);
  } else {
    local().events = [...local().events, event];
    persist();
  }
  return event;
}

export async function createIncident(incident: Incident): Promise<Incident> {
  if (getDataSource() === "firestore") {
    await fsSet(COLLECTIONS.incidents, incident.incidentId, incident);
  } else {
    local().incidents = [incident, ...local().incidents];
    persist();
  }
  return incident;
}
