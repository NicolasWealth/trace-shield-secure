import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBatch,
  createEvent,
  createIncident,
  listBatches,
  listEvents,
  listIncidents,
  listOrganizations,
} from "@/services/repository";
import type { Batch, CustodyEvent, Incident } from "@/types";

export const keys = {
  organizations: ["organizations"] as const,
  batches: ["batches"] as const,
  events: ["events"] as const,
  incidents: ["incidents"] as const,
};

export const useOrganizations = () =>
  useQuery({ queryKey: keys.organizations, queryFn: listOrganizations });

export const useBatches = () => useQuery({ queryKey: keys.batches, queryFn: listBatches });

export const useEvents = () => useQuery({ queryKey: keys.events, queryFn: listEvents });

export const useIncidents = () =>
  useQuery({ queryKey: keys.incidents, queryFn: listIncidents });

export function useTraceData() {
  const organizations = useOrganizations();
  const batches = useBatches();
  const events = useEvents();
  const incidents = useIncidents();

  return {
    organizations: organizations.data ?? [],
    batches: batches.data ?? [],
    events: events.data ?? [],
    incidents: incidents.data ?? [],
    isLoading:
      organizations.isLoading || batches.isLoading || events.isLoading || incidents.isLoading,
  };
}

export function useCreateBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batch: Batch) => createBatch(batch),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.batches }),
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (event: CustodyEvent) => createEvent(event),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.events });
      qc.invalidateQueries({ queryKey: keys.batches });
    },
  });
}

export function useCreateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (incident: Incident) => createIncident(incident),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.incidents }),
  });
}
