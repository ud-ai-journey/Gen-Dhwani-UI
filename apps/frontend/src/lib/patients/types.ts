export type PatientTriageStatus = 'GREEN' | 'YELLOW' | 'RED';

export const STATUSES: readonly PatientTriageStatus[] = [
  'GREEN',
  'YELLOW',
  'RED',
] as const;

export interface Patient {
  id: string;
  url?: string;
  name: string;
  phone?: string;
  language: string;
  symptoms: string;
  medications: string[];
  triage_status: PatientTriageStatus;
  discharge_summary_link?: string;
  call_transcript?: string;
  doctor_notes?: string;
  submitted_at: string;
}

export interface PatientFilter {
  triage_statuses: PatientTriageStatus[];
  search: string;
}

export interface SyncMeta {
  databaseId: string;
  databaseTitle: string;
  syncedAt: string | null;
}

export interface AgentState {
  patients: Patient[];
  filter: PatientFilter;
  highlightedPatientIds: string[];
  selectedPatientId: string | null;
  header: { title: string; subtitle: string };
  sync: SyncMeta;
}

// Mirrors the Python `NotionHealth` TypedDict in
// agent/src/notion_integration.py.
export interface NotionHealth {
  user_id: string;
  db_title: string;
  row_count: number;
  expected_props: string[];
  actual_props: string[];
  missing_props: string[];
  error: string | null;
}
