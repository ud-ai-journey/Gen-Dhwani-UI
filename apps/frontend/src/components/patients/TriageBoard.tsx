"use client";

import { AnimatePresence } from "motion/react";
import { PatientCard } from "./PatientCard";
import type { Patient, PatientTriageStatus } from "@/lib/patients/types";
import { STATUSES } from "@/lib/patients/types";
import { groupByTriage, triageColors } from "@/lib/patients/derive";
import { AlertTriangle, Activity, CheckCircle } from "lucide-react";

interface TriageBoardProps {
  patients: Patient[];
  selectedPatientId: string | null;
  highlightedPatientIds: string[];
  onSelect: (id: string) => void;
  syncingIds?: Set<string>;
  justSyncedIds?: Set<string>;
}

const TRIAGE_COLUMN_ICONS: Record<PatientTriageStatus, React.ReactNode> = {
  RED: <AlertTriangle className="size-3.5 text-rose-500" />,
  YELLOW: <Activity className="size-3.5 text-amber-500" />,
  GREEN: <CheckCircle className="size-3.5 text-emerald-500" />,
};

const TRIAGE_COLUMN_LABELS: Record<PatientTriageStatus, string> = {
  RED: "Critical",
  YELLOW: "Monitoring",
  GREEN: "Stable",
};

export function TriageBoard({
  patients,
  selectedPatientId,
  highlightedPatientIds,
  onSelect,
  syncingIds,
  justSyncedIds,
}: TriageBoardProps) {
  const groups = groupByTriage(patients);
  const highlighted = new Set(highlightedPatientIds);

  return (
    <div className="flex h-full gap-4 overflow-x-auto pb-2">
      {STATUSES.map((status) => {
        const list = groups[status] ?? [];
        const colors = triageColors(status);
        return (
          <TriageColumn
            key={status}
            status={status}
            count={list.length}
            colors={colors}
            icon={TRIAGE_COLUMN_ICONS[status]}
            label={TRIAGE_COLUMN_LABELS[status]}
          >
            {list.length === 0 ? (
              <div className="grid place-items-center py-8 font-mono text-[11px] uppercase tracking-wide text-muted-foreground/60">
                no patients
              </div>
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                {list.map((patient) => (
                  <PatientCard
                    key={patient.id}
                    patient={patient}
                    selected={selectedPatientId === patient.id}
                    highlighted={highlighted.has(patient.id)}
                    highlightedPatientIds={highlightedPatientIds}
                    onClick={() => onSelect(patient.id)}
                    syncing={syncingIds?.has(patient.id) ?? false}
                    justSynced={justSyncedIds?.has(patient.id) ?? false}
                  />
                ))}
              </AnimatePresence>
            )}
          </TriageColumn>
        );
      })}
    </div>
  );
}

interface TriageColumnProps {
  status: PatientTriageStatus;
  count: number;
  colors: ReturnType<typeof triageColors>;
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

function TriageColumn({
  status,
  count,
  colors,
  icon,
  label,
  children,
}: TriageColumnProps) {
  const BORDER_CLASSES: Record<PatientTriageStatus, string> = {
    RED: "border-rose-500/30",
    YELLOW: "border-amber-500/30",
    GREEN: "border-emerald-500/30",
  };
  const HEADER_CLASSES: Record<PatientTriageStatus, string> = {
    RED: "border-rose-500/20 bg-rose-500/5",
    YELLOW: "border-amber-500/20 bg-amber-500/5",
    GREEN: "border-emerald-500/20 bg-emerald-500/5",
  };

  return (
    <section
      className={`flex flex-1 min-w-72 shrink-0 flex-col rounded-xl border bg-card transition ${BORDER_CLASSES[status]}`}
    >
      <header
        className={`flex items-center justify-between gap-2 border-b px-4 py-3 ${HEADER_CLASSES[status]}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="text-sm font-medium tracking-tight text-foreground">
            {label}
          </span>
        </div>
        <span className="shrink-0 rounded-md bg-background px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground ring-1 ring-inset ring-border">
          {count}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {children}
      </div>
    </section>
  );
}
