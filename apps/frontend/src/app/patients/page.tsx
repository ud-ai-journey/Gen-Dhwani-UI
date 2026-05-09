"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Toaster, toast } from "sonner";
import {
  CopilotChatConfigurationProvider,
  CopilotSidebar,
  useAgent,
  useConfigureSuggestions,
  useCopilotKit,
  useDefaultRenderTool,
  useFrontendTool,
} from "@copilotkit/react-core/v2";
import { ThreadsDrawer } from "@/components/threads-drawer";
import drawerStyles from "@/components/threads-drawer/threads-drawer.module.css";

import type { AgentState, Patient, PatientFilter } from "@/lib/patients/types";
import { initialState, emptyFilter } from "@/lib/patients/state";
import { applyFilter, groupByTriage } from "@/lib/patients/derive";
import { applyPatch, revertPatch } from "@/lib/patients/optimistic";

import { PatientHeader } from "@/components/patients/PatientHeader";
import { TriageBoard } from "@/components/patients/TriageBoard";
import { ToolFallbackCard } from "@/components/copilot/ToolFallbackCard";
import { RedTriageCard, YellowTriageCard, GreenTriageCard } from "@/components/patients/inline/TriageCards";

// ─── ClientOnly wrapper ───────────────────────────────────────────────────────

function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <>{children}</>;
}

// ─── Zod schema for a single patient (mirrors lib/patients/types) ─────────────

const patientShape = z.object({
  id: z.string(),
  url: z.string().optional(),
  name: z.string(),
  phone: z.string().optional(),
  language: z.string().default("English"),
  symptoms: z.string().default(""),
  medications: z.array(z.string()).default([]),
  triage_status: z.enum(["GREEN", "YELLOW", "RED"]).default("GREEN"),
  discharge_summary_link: z.string().optional(),
  call_transcript: z.string().optional(),
  doctor_notes: z.string().optional(),
  submitted_at: z.string().default(""),
});

// ─── Merge raw agent state into canonical AgentState ─────────────────────────

function mergeAgentState(raw: unknown): AgentState {
  const partial =
    raw && typeof raw === "object" ? (raw as Partial<AgentState>) : {};
  return {
    ...initialState,
    ...partial,
    filter: { ...initialState.filter, ...(partial.filter ?? {}) },
    header: { ...initialState.header, ...(partial.header ?? {}) },
    sync: { ...initialState.sync, ...(partial.sync ?? {}) },
    patients: partial.patients ?? initialState.patients,
    highlightedPatientIds:
      partial.highlightedPatientIds ?? initialState.highlightedPatientIds,
  };
}

// ─── Live agent state hook (avoids closure-capture staleness) ─────────────────

function useLiveAgentState() {
  const { agent } = useAgent();
  const state = mergeAgentState(agent?.state);
  const setState = (updater: (prev: AgentState) => AgentState) => {
    agent?.setState(updater(mergeAgentState(agent?.state)));
  };
  return { agent, state, setState };
}

// ─── CanvasInner ──────────────────────────────────────────────────────────────

function CanvasInner() {
  const { agent } = useAgent();
  const { copilotkit } = useCopilotKit();

  useConfigureSuggestions({
    available: "before-first-message",
    suggestions: [
      {
        title: "Load patients from Notion",
        message: "Pull all patient records from the Dhwani Patients EMR database.",
      },
      {
        title: "Show critical patients",
        message: "Filter to show only RED (critical) patients.",
      },
      {
        title: "Summarize daily triage",
        message: "Give me a brief summary of today's patient statuses.",
      },
      {
        title: "Check Notion connection",
        message: "Run a Notion health check and tell me the database status.",
      },
    ],
  });

  // ── Prompt injection ────────────────────────────────────────────────────────

  const injectPrompt = useCallback(
    (prompt: string) => {
      if (!agent) return;
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `msg-${Date.now()}`;
      agent.addMessage({ id, role: "user", content: prompt });
      void copilotkit.runAgent({ agent }).catch((error: unknown) => {
        console.error("injectPrompt: runAgent failed", error);
        let hint: string | undefined;
        if (error && typeof error === "object") {
          const anyErr = error as Record<string, unknown>;
          if (typeof anyErr.hint === "string") hint = anyErr.hint;
          else if (typeof anyErr.message === "string") {
            try {
              const parsed = JSON.parse(anyErr.message);
              if (parsed && typeof parsed.hint === "string") hint = parsed.hint;
            } catch { /* not JSON */ }
          }
        }
        if (hint) toast.error(hint, { duration: 8000 });
      });
    },
    [agent, copilotkit],
  );

  // ── Optimistic write state ──────────────────────────────────────────────────

  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [justSyncedIds, setJustSyncedIds] = useState<Set<string>>(new Set());
  const snapshotsRef = useRef<Map<string, Patient>>(new Map());
  const processedToolMsgIds = useRef<Set<string>>(new Set());
  const justSyncedTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const flashJustSynced = useCallback((id: string) => {
    setJustSyncedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    const existing = justSyncedTimers.current.get(id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      setJustSyncedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      justSyncedTimers.current.delete(id);
    }, 800);
    justSyncedTimers.current.set(id, t);
  }, []);

  useEffect(() => {
    return () => {
      for (const t of justSyncedTimers.current.values()) clearTimeout(t);
      justSyncedTimers.current.clear();
    };
  }, []);

  const state = mergeAgentState(agent?.state);

  const updateState = useCallback(
    (updater: (prev: AgentState) => AgentState) => {
      agent?.setState(updater(mergeAgentState(agent?.state)));
    },
    [agent],
  );

  // ── Frontend tools ──────────────────────────────────────────────────────────

  useFrontendTool({
    name: "setHeader",
    description: "Set the workspace header title and subtitle.",
    parameters: z.object({
      title: z.string().optional(),
      subtitle: z.string().optional(),
    }),
    handler: async ({ title, subtitle }) => {
      updateState((prev) => ({
        ...prev,
        header: {
          title: title ?? prev.header.title,
          subtitle: subtitle ?? prev.header.subtitle,
        },
      }));
      return "header updated";
    },
  });

  useFrontendTool({
    name: "setPatients",
    description:
      "Replace the entire patient list. Call once after fetching from Notion.",
    parameters: z.object({ patients: z.array(patientShape) }),
    handler: async ({ patients }) => {
      const list = patients as Patient[];
      updateState((prev) => ({
        ...prev,
        patients: list,
        highlightedPatientIds: prev.highlightedPatientIds.filter((id) =>
          list.some((p) => p.id === id),
        ),
        selectedPatientId:
          prev.selectedPatientId &&
          list.some((p) => p.id === prev.selectedPatientId)
            ? prev.selectedPatientId
            : null,
      }));
      return `loaded ${list.length} patients`;
    },
  });

  useFrontendTool({
    name: "setSyncMeta",
    description:
      "Record which Notion database is the source of truth and when we last synced.",
    parameters: z.object({
      databaseId: z.string().optional(),
      databaseTitle: z.string().optional(),
      syncedAt: z.string().optional(),
    }),
    handler: async ({ databaseId, databaseTitle, syncedAt }) => {
      updateState((prev) => ({
        ...prev,
        sync: {
          databaseId: databaseId ?? prev.sync.databaseId,
          databaseTitle: databaseTitle ?? prev.sync.databaseTitle,
          syncedAt: syncedAt ?? new Date().toISOString(),
        },
      }));
      return "sync meta updated";
    },
  });

  useFrontendTool({
    name: "setFilter",
    description:
      "Narrow the visible patients. Pass any subset of fields; omitted fields are kept.",
    parameters: z.object({
      triage_statuses: z
        .array(z.enum(["GREEN", "YELLOW", "RED"]))
        .optional(),
      search: z.string().optional(),
    }),
    handler: async (patch) => {
      updateState((prev) => ({
        ...prev,
        filter: { ...prev.filter, ...(patch as Partial<PatientFilter>) },
      }));
      return "filter updated";
    },
  });

  useFrontendTool({
    name: "clearFilters",
    description: "Reset all filters to show every loaded patient.",
    parameters: z.object({}),
    handler: async () => {
      updateState((prev) => ({ ...prev, filter: emptyFilter }));
      return "filters cleared";
    },
  });

  useFrontendTool({
    name: "highlightPatients",
    description:
      "Visually highlight specific patients. Pass an empty array to clear.",
    parameters: z.object({ patientIds: z.array(z.string()) }),
    handler: async ({ patientIds }) => {
      updateState((prev) => ({ ...prev, highlightedPatientIds: patientIds }));
      return `highlighted ${patientIds.length} patients`;
    },
  });

  useFrontendTool({
    name: "selectPatient",
    description: "Open the detail panel for one patient. Pass null to deselect.",
    parameters: z.object({ patientId: z.string().nullable() }),
    handler: async ({ patientId }) => {
      updateState((prev) => ({ ...prev, selectedPatientId: patientId }));
      return patientId ? `selected ${patientId}` : "selection cleared";
    },
  });

  // Optimistic patient edit — snapshot → apply patch → ask agent to persist.
  const commitPatientEdit = useCallback(
    (patientId: string, patch: Partial<Patient>) => {
      const snap = mergeAgentState(agent?.state).patients.find(
        (p) => p.id === patientId,
      );
      if (!snap) return;
      snapshotsRef.current.set(patientId, snap);
      setSyncingIds((prev) => {
        if (prev.has(patientId)) return prev;
        const next = new Set(prev);
        next.add(patientId);
        return next;
      });
      updateState((prev) => applyPatch(prev, patientId, patch));
      injectPrompt(
        `Update patient ${patientId} in Notion: ${JSON.stringify(patch)}`,
      );
    },
    [agent, updateState, injectPrompt],
  );

  useFrontendTool({
    name: "updatePatientStatus",
    description:
      "Update a patient's triage_status with optimistic UI. Persists to Notion via update_notion_patient.",
    parameters: z.object({
      patientId: z.string(),
      triage_status: z.enum(["GREEN", "YELLOW", "RED"]),
    }),
    handler: async ({ patientId, triage_status }) => {
      const patient = mergeAgentState(agent?.state).patients.find(
        (p) => p.id === patientId,
      );
      commitPatientEdit(patientId, { triage_status });
      return `queued: updating ${patient?.name ?? patientId} → ${triage_status}`;
    },
  });

  useFrontendTool({
    name: "renderRedPatientCard",
    description: "Renders the immediate-action RED card in the chat.",
    parameters: z.object({
      patientId: z.string(),
      name: z.string(),
      summary: z.string().describe("Why this patient is critical"),
    }),
    render: ({ args }) => (
      <RedTriageCard
        patientId={args.patientId ?? ""}
        name={args.name ?? ""}
        summary={args.summary ?? ""}
      />
    ),
  });

  useFrontendTool({
    name: "renderYellowPatientCard",
    description: "Renders the follow-up YELLOW card in the chat.",
    parameters: z.object({
      patientId: z.string(),
      name: z.string(),
      summary: z.string().describe("Why this patient needs monitoring"),
    }),
    render: ({ args }) => (
      <YellowTriageCard
        patientId={args.patientId ?? ""}
        name={args.name ?? ""}
        summary={args.summary ?? ""}
      />
    ),
  });

  useFrontendTool({
    name: "renderGreenPatientCard",
    description: "Renders the recovery GREEN card in the chat.",
    parameters: z.object({
      patientId: z.string(),
      name: z.string(),
      summary: z.string().describe("Status of this stable patient"),
    }),
    render: ({ args }) => (
      <GreenTriageCard
        patientId={args.patientId ?? ""}
        name={args.name ?? ""}
        summary={args.summary ?? ""}
      />
    ),
  });

  // Watch agent tool messages to confirm/revert pending optimistic writes.
  const messageTail =
    (
      agent?.messages as Array<{
        id?: string;
        role?: string;
        content?: unknown;
      }>
    )?.slice(-10) ?? [];

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!agent || !messageTail.length) return;
    for (const m of messageTail) {
      const id = m.id;
      if (!id || m.role !== "tool") continue;
      if (processedToolMsgIds.current.has(id)) continue;
      processedToolMsgIds.current.add(id);

      const content =
        typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content)
            ? m.content
                .map((b) =>
                  typeof b === "string"
                    ? b
                    : (b as { text?: string })?.text ?? "",
                )
                .join("")
            : "";
      if (!content) continue;

      const isFailure =
        content.startsWith("Update failed") ||
        content.startsWith("Insert failed");
      const isSuccess =
        content.startsWith("Updated ") || content.startsWith("Added ");
      if (!isFailure && !isSuccess) continue;

      const pending = Array.from(snapshotsRef.current.entries());
      if (pending.length === 0) continue;

      if (isSuccess) {
        const [patientId] = pending[pending.length - 1];
        snapshotsRef.current.delete(patientId);
        setSyncingIds((prev) => {
          if (!prev.has(patientId)) return prev;
          const next = new Set(prev);
          next.delete(patientId);
          return next;
        });
        flashJustSynced(patientId);
      } else {
        const reverted: Patient[] = [];
        updateState((prev) => {
          let next = prev;
          for (const [, snap] of pending) {
            next = revertPatch(next, snap);
            reverted.push(snap);
          }
          return next;
        });
        snapshotsRef.current.clear();
        setSyncingIds(new Set());
        toast.error(
          reverted.length === 1
            ? `Couldn't sync ${reverted[0].name} to Notion — change reverted.`
            : `Couldn't sync ${reverted.length} patients to Notion — changes reverted.`,
          { duration: 5000 },
        );
      }
    }
  }, [messageTail.map((m) => m.id).join(","), agent, flashJustSynced]);

  // Catch-all tool renderer.
  useDefaultRenderTool({
    render: ({ name, status, result, parameters }) => (
      <ToolFallbackCard
        name={name}
        status={status}
        result={result}
        parameters={parameters}
      />
    ),
  });

  // ── Derived/computed values ─────────────────────────────────────────────────

  const visiblePatients = useMemo(
    () => applyFilter(state.patients, state.filter),
    [state.patients, state.filter],
  );

  const triageGroups = useMemo(
    () => groupByTriage(state.patients),
    [state.patients],
  );

  const handleSelect = (id: string) =>
    updateState((prev) => ({
      ...prev,
      selectedPatientId: prev.selectedPatientId === id ? null : id,
    }));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <main className="flex h-screen flex-col gap-5 overflow-hidden bg-background px-6 py-6">
        <PatientHeader
          title={state.header.title}
          subtitle={state.header.subtitle}
          totalPatients={state.patients.length}
          visiblePatients={visiblePatients.length}
          sync={state.sync}
          redCount={triageGroups.RED.length}
          yellowCount={triageGroups.YELLOW.length}
          greenCount={triageGroups.GREEN.length}
        />

        {state.patients.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
            <div className="max-w-sm space-y-3">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted">
                <span className="text-2xl">🏥</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Ask the assistant to{" "}
                <span className="font-mono text-foreground">
                  pull patient records from Notion
                </span>{" "}
                to populate the triage dashboard.
              </p>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <TriageBoard
              patients={visiblePatients}
              selectedPatientId={state.selectedPatientId}
              highlightedPatientIds={state.highlightedPatientIds}
              onSelect={handleSelect}
              syncingIds={syncingIds}
              justSyncedIds={justSyncedIds}
            />
          </div>
        )}
      </main>

      <CopilotSidebar
        defaultOpen
        width={420}
        input={{ disclaimer: () => null, className: "pb-6" }}
      />

      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            error: "!bg-rose-50 !text-rose-900 !border !border-rose-200",
          },
        }}
      />
    </>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

function PatientsPage() {
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  return (
    <div className={drawerStyles.layout}>
      <ThreadsDrawer
        agentId="default"
        threadId={threadId}
        onThreadChange={setThreadId}
      />
      <div className={drawerStyles.mainPanel}>
        <CopilotChatConfigurationProvider agentId="default" threadId={threadId}>
          <CanvasInner />
        </CopilotChatConfigurationProvider>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ClientOnly>
      <PatientsPage />
    </ClientOnly>
  );
}
