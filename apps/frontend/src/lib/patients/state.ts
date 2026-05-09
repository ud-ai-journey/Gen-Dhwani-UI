import type { AgentState, PatientFilter } from "./types";

export const emptyFilter: PatientFilter = {
  triage_statuses: [],
  search: "",
};

export const initialState: AgentState = {
  patients: [],
  filter: emptyFilter,
  highlightedPatientIds: [],
  selectedPatientId: null,
  header: {
    title: "Dhwani — Patient Triage",
    subtitle: "Post-discharge monitoring dashboard",
  },
  sync: { databaseId: "", databaseTitle: "", syncedAt: null },
};

export function isFilterEmpty(f: PatientFilter): boolean {
  return f.triage_statuses.length === 0 && f.search.trim().length === 0;
}

export function filterCount(f: PatientFilter): number {
  let n = 0;
  if (f.triage_statuses.length) n += 1;
  if (f.search.trim().length) n += 1;
  return n;
}
