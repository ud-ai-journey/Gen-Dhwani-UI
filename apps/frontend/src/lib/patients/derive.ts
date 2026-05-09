import type { Patient, PatientFilter, PatientTriageStatus } from "./types";
import { STATUSES } from "./types";

export function applyFilter(patients: Patient[], f: PatientFilter): Patient[] {
  const search = f.search.trim().toLowerCase();
  return patients.filter((p) => {
    if (
      f.triage_statuses.length &&
      !f.triage_statuses.includes(p.triage_status)
    )
      return false;
    if (search.length) {
      const blob =
        `${p.name} ${p.phone ?? ""} ${p.symptoms} ${p.doctor_notes ?? ""} ${p.language}`
          .toLowerCase();
      if (!blob.includes(search)) return false;
    }
    return true;
  });
}

export function groupByTriage(
  patients: Patient[],
): Record<PatientTriageStatus, Patient[]> {
  const groups: Record<PatientTriageStatus, Patient[]> = {
    RED: [],
    YELLOW: [],
    GREEN: [],
  };
  for (const p of patients) {
    const key = (STATUSES as readonly string[]).includes(p.triage_status)
      ? p.triage_status
      : "GREEN";
    groups[key].push(p);
  }
  return groups;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const TRIAGE_COLORS: Record<
  PatientTriageStatus,
  {
    badge: string;
    ring: string;
    surface: string;
    selectedRing: string;
    dot: string;
    column: string;
    columnHeader: string;
  }
> = {
  RED: {
    badge:
      "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30",
    ring: "ring-2 ring-rose-500",
    surface: "bg-rose-500/5 hover:bg-rose-500/10",
    selectedRing: "ring-2 ring-rose-500",
    dot: "bg-rose-500",
    column: "border-rose-500/40",
    columnHeader: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  YELLOW: {
    badge:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30",
    ring: "ring-2 ring-amber-500",
    surface: "bg-amber-500/5 hover:bg-amber-500/10",
    selectedRing: "ring-2 ring-amber-500",
    dot: "bg-amber-500",
    column: "border-amber-500/40",
    columnHeader: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  GREEN: {
    badge:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
    ring: "ring-2 ring-emerald-500",
    surface: "bg-emerald-500/5 hover:bg-emerald-500/10",
    selectedRing: "ring-2 ring-emerald-500",
    dot: "bg-emerald-500",
    column: "border-emerald-500/40",
    columnHeader: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
};

export function triageColors(status: PatientTriageStatus) {
  return TRIAGE_COLORS[status] ?? TRIAGE_COLORS.GREEN;
}

export function triageBadgeClass(status: string): string {
  return (
    TRIAGE_COLORS[status as PatientTriageStatus]?.badge ??
    "bg-muted text-muted-foreground ring-border"
  );
}
