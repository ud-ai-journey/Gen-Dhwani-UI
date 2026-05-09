import React from "react";
import { AlertTriangle, Activity, CheckCircle, Phone, CalendarPlus } from "lucide-react";
import { PatientTriageStatus } from "@/lib/patients/types";

interface TriageCardProps {
  patientId: string;
  name: string;
  summary: string;
  onCallPatient?: () => void;
  onScheduleFollowUp?: () => void;
  onClose?: () => void;
}

export function RedTriageCard({
  patientId,
  name,
  summary,
}: TriageCardProps) {
  return (
    <div className="my-2 flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-left shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">CRITICAL: {name}</div>
            <div className="text-xs font-medium text-rose-600 dark:text-rose-400">Immediate Action Required</div>
          </div>
        </div>
      </div>
      
      <div className="rounded-lg bg-white/60 p-3 text-sm text-neutral-700 dark:bg-black/20 dark:text-neutral-300">
        {summary}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-rose-600">
          <Phone className="size-3.5" />
          Call Patient Now
        </button>
        <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800">
           Review Full Record
        </button>
      </div>
    </div>
  );
}

export function YellowTriageCard({
  patientId,
  name,
  summary,
}: TriageCardProps) {
  return (
    <div className="my-2 flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-left shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
            <Activity className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">MONITOR: {name}</div>
            <div className="text-xs font-medium text-amber-600 dark:text-amber-400">Possible Escalation Detected</div>
          </div>
        </div>
      </div>
      
      <div className="rounded-lg bg-white/60 p-3 text-sm text-neutral-700 dark:bg-black/20 dark:text-neutral-300">
        {summary}
      </div>

      <div className="flex items-center gap-2 pt-1">
         <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 border border-transparent dark:hover:bg-neutral-100">
          <CalendarPlus className="size-3.5" />
          Schedule Follow-up
        </button>
      </div>
    </div>
  );
}

export function GreenTriageCard({
  patientId,
  name,
  summary,
}: TriageCardProps) {
  return (
    <div className="my-2 flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-left shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">STABLE: {name}</div>
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">On Track For Recovery</div>
          </div>
        </div>
      </div>
      
      <div className="rounded-lg bg-white/60 p-3 text-sm text-neutral-700 dark:bg-black/20 dark:text-neutral-300">
        {summary}
      </div>
    </div>
  );
}
