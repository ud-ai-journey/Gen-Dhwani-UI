"use client";

import { motion } from "motion/react";
import { Phone, ExternalLink, AlertTriangle, Activity, CheckCircle } from "lucide-react";
import type { Patient, PatientTriageStatus } from "@/lib/patients/types";
import { initials, triageColors } from "@/lib/patients/derive";
import { usePulse } from "@/lib/leads/hooks";

interface PatientCardProps {
  patient: Patient;
  selected?: boolean;
  highlighted?: boolean;
  highlightedPatientIds?: string[];
  onClick?: () => void;
  compact?: boolean;
  syncing?: boolean;
  justSynced?: boolean;
}

const TRIAGE_ICONS: Record<PatientTriageStatus, React.ReactNode> = {
  RED: <AlertTriangle className="size-3 shrink-0 text-rose-500" />,
  YELLOW: <Activity className="size-3 shrink-0 text-amber-500" />,
  GREEN: <CheckCircle className="size-3 shrink-0 text-emerald-500" />,
};

const TRIAGE_LABELS: Record<PatientTriageStatus, string> = {
  RED: "Critical — Needs Immediate Attention",
  YELLOW: "Monitoring — Possible Escalation",
  GREEN: "Stable — On Track for Recovery",
};

export function PatientCard({
  patient,
  selected,
  highlighted,
  highlightedPatientIds,
  onClick,
  compact,
  syncing,
  justSynced,
}: PatientCardProps) {
  const pulsing = usePulse(patient.id, highlightedPatientIds ?? []);
  const colors = triageColors(patient.triage_status);

  const ring = selected
    ? colors.selectedRing
    : highlighted
      ? colors.ring
      : "ring-1 ring-border";

  const surface = highlighted
    ? colors.surface
    : `bg-card ${colors.surface}`;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout
      layoutId={`patient-${patient.id}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.7 }}
      data-pulse={pulsing ? "true" : "false"}
      data-syncing={syncing ? "true" : undefined}
      data-just-synced={justSynced ? "true" : undefined}
      className={`group relative flex w-full flex-col items-stretch gap-2.5 rounded-xl border border-border p-3 text-left shadow-sm transition ${surface} ${ring}`}
    >
      {/* Syncing overlay */}
      {syncing && (
        <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-card/60 backdrop-blur-[1px]">
          <span className="size-4 animate-spin rounded-full border-2 border-border border-t-foreground" />
        </span>
      )}

      {/* Header row */}
      <div className="flex items-start gap-2.5">
        <PatientAvatar name={patient.name} status={patient.triage_status} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight text-foreground">
            {patient.name}
          </div>
          <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            {TRIAGE_ICONS[patient.triage_status]}
            <span className="truncate">{TRIAGE_LABELS[patient.triage_status]}</span>
          </div>
        </div>
      </div>

      {!compact ? (
        <>
          {/* Symptoms */}
          {patient.symptoms ? (
            <div className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Symptoms: </span>
              {patient.symptoms}
            </div>
          ) : null}

          {/* Medications */}
          {patient.medications.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {patient.medications.slice(0, 4).map((med) => (
                <span
                  key={med}
                  className="rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  {med}
                </span>
              ))}
              {patient.medications.length > 4 ? (
                <span className="text-[10px] text-muted-foreground">
                  +{patient.medications.length - 4}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Footer row */}
          <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px] text-muted-foreground">
            {patient.phone ? (
              <span className="inline-flex items-center gap-1 truncate">
                <Phone className="size-3 shrink-0" />
                <span className="truncate">{patient.phone}</span>
              </span>
            ) : (
              <span className="text-muted-foreground/50">No phone</span>
            )}
            <span className="shrink-0 font-mono uppercase">
              {patient.language}
            </span>
          </div>

          {/* Doctor notes snippet */}
          {patient.doctor_notes ? (
            <p className="line-clamp-2 text-[11px] italic text-muted-foreground/80 border-t border-border/50 pt-1.5">
              &ldquo;{patient.doctor_notes}&rdquo;
            </p>
          ) : null}
        </>
      ) : null}
    </motion.button>
  );
}

function PatientAvatar({
  name,
  status,
}: {
  name: string;
  status: PatientTriageStatus;
}) {
  const colors = triageColors(status);
  const DOT_CLASSES: Record<PatientTriageStatus, string> = {
    RED: "bg-rose-500",
    YELLOW: "bg-amber-500",
    GREEN: "bg-emerald-500",
  };
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return (
    <div className="relative shrink-0">
      <div
        className="grid size-8 place-items-center rounded-full text-[11px] font-semibold text-white"
        style={{ background: `hsl(${hue} 45% 40%)` }}
        aria-hidden
      >
        {initials(name)}
      </div>
      <span
        className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background ${DOT_CLASSES[status]}`}
      />
    </div>
  );
}

interface NotionLinkProps {
  url?: string;
  className?: string;
}

export function NotionLink({ url, className }: NotionLinkProps) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ${className ?? ""}`}
    >
      open in Notion <ExternalLink className="size-3" />
    </a>
  );
}
