import type { AgentState, Patient } from "./types";

export function applyPatch(
  state: AgentState,
  patientId: string,
  patch: Partial<Patient>,
): AgentState {
  const idx = state.patients.findIndex((p) => p.id === patientId);
  if (idx < 0) return state;
  const next = state.patients.slice();
  next[idx] = { ...state.patients[idx], ...patch };
  return { ...state, patients: next };
}

export function revertPatch(state: AgentState, snapshot: Patient): AgentState {
  const idx = state.patients.findIndex((p) => p.id === snapshot.id);
  if (idx < 0) {
    return { ...state, patients: [...state.patients, snapshot] };
  }
  const next = state.patients.slice();
  next[idx] = snapshot;
  return { ...state, patients: next };
}
