"""Backend tool loader (lead-form usecase, MCP-Use + local-store edition).

Exposes the LangChain backend tools the agent always has available.
Tool names retain their Notion-flavored prefix for prompt compatibility,
but every data-touching tool now routes through `lead_store.get_store()`
so the same tools work whether the user has wired Notion or is running
on the bundled local seed (see `lead_store.py`).

Read path:
- `fetch_notion_leads`: pull leads from the configured store (Notion via
  `@notionhq/notion-mcp-server`, or `agent/data/leads.local.json` if the
  user hasn't set NOTION_TOKEN + NOTION_LEADS_DATABASE_ID) AND apply
  them to canvas state as a Command(update=) — see issue 006.
- `default_notion_database_id`: returns the env-configured database ID so
  the agent doesn't have to ask the user every time. Notion-only.
- `notion_health_check`: confirm the MCP server is reachable and that
  the source schema still has the properties the canvas expects.
  Notion-only — returns a "skipped: local store" payload otherwise.

Write path (phase 04):
- `update_notion_lead`: patch one lead in the active store AND patch
  `state.leads` in one Command(update=).
- `insert_notion_lead`: append one lead to the active store AND
  `state.leads`.

Both write tools pull the current `state.leads` via `InjectedState` so
they can return the FULL post-write list on success — the frontend's
STATE_SNAPSHOT picks the change up in one shot. On failure, only the
ToolMessage is emitted (leads stay unchanged), letting the frontend's
optimistic-rollback path re-assert the truth.

The previous `list_notion_lead_databases` helper was Composio-specific
(used `NOTION_SEARCH_NOTION_PAGE`). The Notion MCP server exposes
`API-post-search` for the same job, but we don't register it on the
agent's tool list — the kit's UX assumes the user has either already
pinned `NOTION_LEADS_DATABASE_ID` in `.env` or wants the local-store
fallback. Add it back if you want the agent to discover databases at
runtime.
"""

from __future__ import annotations

import json
import os
from collections import Counter
from datetime import datetime, timezone
from typing import Annotated, Any, Dict, List

from dotenv import load_dotenv
from langchain_core.messages import ToolMessage
from langchain_core.tools import tool, InjectedToolCallId
from langgraph.prebuilt import InjectedState
from langgraph.types import Command

# Load environment variables early to support local development via .env
load_dotenv()


@tool
def fetch_notion_patients(
    database_id: Annotated[
        str,
        "Notion database ID. Pass an empty string to use NOTION_LEADS_DATABASE_ID from env, or to use the bundled local store when Notion isn't configured.",
    ] = "",
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """Fetch leads from the active store AND apply them to the canvas in one shot.

    The active store is Notion when both NOTION_TOKEN and
    NOTION_LEADS_DATABASE_ID are set; otherwise it's the bundled local
    JSON (50 starter leads sourced from the v2a Notion export). The
    agent doesn't need to know which one is active — it just calls this
    tool and gets a populated canvas back.

    Returns a `Command` that updates `leads`, `header.subtitle`, and
    `sync` directly on the agent state. The frontend's STATE_SNAPSHOT
    picks that up so the canvas is populated as a side-effect of this
    single tool call. The agent does NOT need to call setLeads /
    setHeader / setSyncMeta after this — just reply with a brief summary.

    Why this returns a Command instead of JSON: Gemini 3 Pro stalls for
    minutes when asked to construct `setLeads(leads=[50 fat objects])`
    as tool-call output (issue 006). Routing the rows through agent
    state via Command sidesteps the construction step entirely.
    """
    try:
        from .lead_store import get_store

        store = get_store()
        rows = store.list_leads()

        if not rows and not store.is_local():
            # Notion path failed — keep the existing actionable error so
            # users with a misconfigured token know where to look.
            msg = (
                "Failed to fetch leads from Notion. Check NOTION_TOKEN, "
                "NOTION_LEADS_DATABASE_ID, and that the integration has "
                "been shared on the database (... -> Connections in Notion)."
            )
            return Command(
                update={
                    "messages": [ToolMessage(content=msg, tool_call_id=tool_call_id)],
                }
            )

        # Compute the summary the model would otherwise have to compute itself.
        triage_counts = Counter(
            (r.get("triage_status") or "UNKNOWN") for r in rows
        )
        red_count = triage_counts.get("RED", 0)

        db_title = store.database_title()
        source_label = "local starter data" if store.is_local() else "Notion"

        summary = (
            f"Imported {len(rows)} patients from {source_label}. "
            f"Critical (RED): {red_count} patients."
        )

        update: dict[str, Any] = {
            "patients": rows,
            "header": {
                "title": "Dhwani GenUI Triage",
                "subtitle": f"{len(rows)} patients from {source_label} · RED: {red_count}",
            },
            "sync": {
                # `databaseId` stays Notion-flavored on Notion, blank on
                # local — the frontend doesn't currently use it for
                # routing, so the asymmetry is harmless.
                "databaseId": database_id
                or os.getenv("NOTION_PATIENTS_DATABASE_ID", "")
                or "local",
                "databaseTitle": db_title,
                "syncedAt": datetime.now(timezone.utc).isoformat(),
            },
            "messages": [ToolMessage(content=summary, tool_call_id=tool_call_id)],
        }
        return Command(update=update)
    except Exception as e:  # noqa: BLE001 - surface error text to the LLM
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=f"Error fetching leads: {str(e)}",
                        tool_call_id=tool_call_id,
                    )
                ],
            }
        )


@tool
def find_patient(
    query: Annotated[
        str,
        "A name (or partial name) to look up in state.patients. Case-insensitive. "
        "Examples: 'ethan moore', 'ethan', 'moore', 'Devon'.",
    ],
    state: Annotated[Dict[str, Any], InjectedState] = None,
) -> str:
    """Look up the real patient id for a name from state.patients.

    Use this BEFORE calling selectLead / update_notion_lead /
    commitLeadEdit / renderLeadMiniCard when you only have a name. NEVER
    fabricate ids like "<name>-id-placeholder" — they don't exist in
    state.leads, so selectLead will silently set selectedLeadId to a
    non-existent id and the modal will not open. Always resolve the real
    id through this tool.

    Returns a JSON string:
      - on a single match: {"match": {id, name, role, company, email}}
      - on multiple matches: {"matches": [<top 5>], "hint": "ask user to disambiguate"}
      - on no match: {"matches": [], "hint": "no leads matched <query>"}
      - on empty state: {"error": "no leads loaded — call fetch_notion_leads first"}
    """
    patients_raw = (state or {}).get("patients") or []
    patients: List[Dict[str, Any]] = [
        l for l in patients_raw if isinstance(l, dict) and l.get("id")
    ]
    if not patients:
        return json.dumps(
            {
                "error": (
                    "no patients loaded — call fetch_notion_patients(database_id='') "
                    "first, then retry."
                )
            }
        )

    q = (query or "").strip().lower()
    if not q:
        return json.dumps({"matches": [], "hint": "query was empty"})

    # Score: exact name = 3, full-name contains query = 2, any token starts with
    # query = 1, otherwise 0. Tie-broken by which appears earlier in state.leads.
    scored: list[tuple[int, int, Dict[str, Any]]] = []
    for idx, patient in enumerate(patients):
        name = str(patient.get("name") or "").lower()
        if not name:
            continue
        if name == q:
            score = 3
        elif q in name:
            score = 2
        elif any(tok.startswith(q) for tok in name.split()):
            score = 1
        else:
            score = 0
        if score > 0:
            scored.append((score, -idx, patient))

    if not scored:
        return json.dumps(
            {
                "matches": [],
                "hint": f"no leads matched {query!r}. Names are stored as 'First Last'.",
            }
        )

    scored.sort(reverse=True)
    top_score = scored[0][0]
    best = [l for s, _, l in scored if s == top_score]

    def _slim(l: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": l.get("id"),
            "name": l.get("name"),
            "phone": l.get("phone"),
            "triage_status": l.get("triage_status"),
        }

    if len(best) == 1:
        return json.dumps({"match": _slim(best[0])}, ensure_ascii=False)
    return json.dumps(
        {
            "matches": [_slim(l) for l in best[:5]],
            "hint": "multiple matches — ask the user which one they meant.",
        },
        ensure_ascii=False,
    )


@tool
def default_notion_database_id() -> str:
    """Return the configured Notion DB id, or a local-store sentinel.

    Returns:
      - the env value when NOTION_LEADS_DATABASE_ID is set
      - "local" when the active store is the local JSON fallback (no
        misconfiguration — this is the intentional no-Notion path)
      - an actionable error string only when env is unset AND we're not
        falling back to local for some other reason (shouldn't happen).
    """
    db_id = os.getenv("NOTION_LEADS_DATABASE_ID", "").strip()
    if db_id:
        return db_id
    from .lead_store import get_store

    if get_store().is_local():
        return "local"
    return "NOTION_LEADS_DATABASE_ID is not set in agent/.env."


@tool
def notion_health_check() -> str:
    """Verify the active store. Notion when configured; local cache otherwise.

    Returns a JSON string. On Notion, it's the full
    `{user_id, db_title, row_count, expected_props, actual_props,
    missing_props, error}` shape. On the local store it's a slim
    `{source: "local", row_count, error: null}` so the agent can still
    decide whether to import. Use this before claiming an import will
    succeed — if `error` is set or `row_count` is 0, surface the
    failure to the user verbatim instead of pulling.
    """
    try:
        from .lead_store import get_store

        store = get_store()
        if store.is_local():
            rows = store.list_leads()
            return json.dumps(
                {
                    "source": "local",
                    "db_title": store.database_title(),
                    "row_count": len(rows),
                    "error": None,
                },
                ensure_ascii=False,
            )

        from .notion_integration import health_check  # type: ignore

        db_id = os.getenv("NOTION_LEADS_DATABASE_ID", "")
        return json.dumps(
            {**health_check(db_id), "source": "notion"}, ensure_ascii=False
        )
    except Exception as e:  # noqa: BLE001 - surface error text to the LLM
        return json.dumps(
            {"error": f"health_check failed: {e}"}, ensure_ascii=False
        )


# --- write path (phase 04) --------------------------------------------------


def _summarize_patch(patch: Dict[str, Any]) -> str:
    """Render a Lead patch as a short human-readable diff line.

    Used in the ToolMessage so the user sees what changed without scrolling
    through the raw JSON. Multi-select / list values show count, not the
    full list, to keep replies readable.
    """
    if not patch:
        return "(no fields)"
    parts: List[str] = []
    for k, v in patch.items():
        if k in ("id", "url"):
            continue
        if isinstance(v, list):
            parts.append(f"{k}=[{len(v)} items]")
        elif isinstance(v, bool):
            parts.append(f"{k}={'on' if v else 'off'}")
        elif v == "":
            parts.append(f"{k}=<cleared>")
        else:
            s = str(v)
            parts.append(f"{k}={s if len(s) <= 40 else s[:37] + '...'}")
    return ", ".join(parts) if parts else "(no fields)"


@tool
def update_notion_patient(
    patient_id: Annotated[str, "Notion page id of the patient row to patch."],
    patch: Annotated[
        Dict[str, Any],
        "Partial Patient. Keys match the Patient shape (triage_status / symptoms / "
        "doctor_notes / etc.). Only include the fields that change. id and url are "
        "ignored.",
    ],
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
    state: Annotated[Dict[str, Any], InjectedState] = None,
) -> Command:
    """Update a single patient in the active store and apply the patch to canvas state.

    The active store is Notion when configured, the local JSON cache
    otherwise — the agent doesn't need to branch on which one it is.

    On success, returns a Command(update=) that:
      1. Replaces `state.leads` with the same list with the patched row updated
         in place. The frontend's STATE_SNAPSHOT picks this up automatically.
      2. Emits a ToolMessage of the form "Updated <name>: <summary>" so the
         agent has a confirmation to relay to the user.

    On failure, only the ToolMessage is emitted — leads stay unchanged so the
    frontend's optimistic-rollback path re-asserts the truth.
    """
    try:
        from .lead_store import get_store

        if not patient_id:
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            content="Update failed: patient_id is required.",
                            tool_call_id=tool_call_id,
                        )
                    ],
                }
            )

        store = get_store()
        merged = store.update_lead(patient_id, patch or {})
        if merged is None:
            store_hint = (
                "Local store: patient_id may be stale. Re-import to refresh."
                if store.is_local()
                else (
                    "Notion call errored. Check NOTION_TOKEN and that the "
                    "database is shared with the integration."
                )
            )
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            content=f"Update failed for patient {patient_id}: {store_hint}",
                            tool_call_id=tool_call_id,
                        )
                    ],
                }
            )

        # Patch the patients list in-place from the agent's current state snapshot.
        current: List[Dict[str, Any]] = list((state or {}).get("patients", []) or [])
        new_patients: List[Dict[str, Any]] = []
        replaced = False
        for patient in current:
            if isinstance(patient, dict) and patient.get("id") == patient_id:
                new_patients.append({**patient, **(patch or {}), **merged, "id": patient_id})
                replaced = True
            else:
                new_patients.append(patient)
        if not replaced:
            # Patient wasn't in the agent's snapshot
            new_patients.append({**(merged or {}), "id": patient_id})

        display_name = (merged or {}).get("name") or "patient"
        summary = _summarize_patch(patch or {})
        return Command(
            update={
                "patients": new_patients,
                "messages": [
                    ToolMessage(
                        content=f"Updated {display_name}: {summary}.",
                        tool_call_id=tool_call_id,
                    )
                ],
            }
        )
    except Exception as e:  # noqa: BLE001 - surface error text to the LLM
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=f"Update failed for patient {patient_id}: {e}",
                        tool_call_id=tool_call_id,
                    )
                ],
            }
        )


@tool
def insert_notion_patient(
    patient: Annotated[
        Dict[str, Any],
        "Full Patient dict (name, phone, language, symptoms, medications, "
        "triage_status, etc.). id/url are "
        "ignored — Notion assigns them.",
    ],
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
    state: Annotated[Dict[str, Any], InjectedState] = None,
) -> Command:
    """Create a new patient row in the active store and append it to canvas state.

    Mirror of `update_notion_lead` for creates. Routes through the same
    `LeadStore` so it works for both Notion and the local fallback.
    Returns a Command(update=) that appends the new row to `state.leads`
    and emits a one-line confirmation. On failure, the ToolMessage
    carries the error and leads stay unchanged.
    """
    try:
        from .lead_store import get_store

        store = get_store()
        new_patient = store.insert_lead(patient or {})
        if new_patient is None:
            store_hint = (
                "Local store write failed — check that agent/data is writable."
                if store.is_local()
                else (
                    "Notion call errored. Check NOTION_TOKEN, that the "
                    "database is shared with the integration, and that the "
                    "schema matches."
                )
            )
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            content=f"Insert failed: {store_hint}",
                            tool_call_id=tool_call_id,
                        )
                    ],
                }
            )

        current: List[Dict[str, Any]] = list((state or {}).get("patients", []) or [])
        new_patients = current + [new_patient]

        display_name = new_patient.get("name") or "(unnamed)"
        source_label = "local store" if store.is_local() else "Notion"
        return Command(
            update={
                "patients": new_patients,
                "messages": [
                    ToolMessage(
                        content=(
                            f"Added {display_name} to {source_label} "
                            f"({new_patient.get('id', '')})."
                        ),
                        tool_call_id=tool_call_id,
                    )
                ],
            }
        )
    except Exception as e:  # noqa: BLE001 - surface error text to the LLM
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=f"Insert failed: {e}",
                        tool_call_id=tool_call_id,
                    )
                ],
            }
        )


@tool
def post_lead_comment(
    leadId: Annotated[str, "The Notion page id of the lead to comment on."],
    subject: Annotated[
        str,
        "The email subject the user approved. Posted as the first bold line of the comment.",
    ],
    body: Annotated[str, "The full email body the user approved."],
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """Post an approved email draft as a comment on the lead's Notion page.

    Called AFTER the user clicks Send on the renderEmailDraft HITL card.
    The comment text is `Subject: …\n\n<body>` so it shows up cleanly in
    Notion's discussion thread.
    """
    try:
        from .notion_mcp import has_notion_token, mcp_create_comment

        if not has_notion_token():
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            content=(
                                "Comment skipped: NOTION_TOKEN is not set. "
                                "Set it and re-share the database with the integration."
                            ),
                            tool_call_id=tool_call_id,
                        )
                    ]
                }
            )

        text = f"Subject: {subject}\n\n{body}"
        mcp_create_comment(page_id=leadId, text=text)
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=f"Posted email comment to lead {leadId}.",
                        tool_call_id=tool_call_id,
                    )
                ]
            }
        )
    except Exception as e:  # noqa: BLE001 - surface error to the LLM
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=f"Comment failed: {e}",
                        tool_call_id=tool_call_id,
                    )
                ]
            }
        )


def load_notion_tools() -> List[Any]:
    """Return the Notion-flavored backend tool list for the agent.

    Always includes:
    - `fetch_notion_leads`        (Command(update=) — see issue 006)
    - `find_lead`                 (state.leads name → real id resolver)
    - `default_notion_database_id`
    - `notion_health_check`
    - `update_notion_lead`        (phase 04 — Command(update=) write-back)
    - `insert_notion_lead`        (phase 04 — Command(update=) write-back)

    The Notion MCP server is spawned per-call inside `notion_mcp.py`, so
    no setup happens here — the only env this function depends on is
    `NOTION_LEADS_DATABASE_ID` (read by the tools themselves).
    """
    tools: List[Any] = [
        fetch_notion_patients,
        find_patient,
        default_notion_database_id,
        notion_health_check,
        update_notion_patient,
        insert_notion_patient,
        post_lead_comment,
    ]
    print(f"Backend tools loaded: {len(tools)} tools")
    return tools


# --- CLI entry point (phase 05 pre-flight) ---------------------------------
#
# `scripts/check-env.sh` calls `uv run python -m src.notion_tools --check` to
# verify the live Notion integration before `npm run dev` boots the rest of
# the stack. Prints a single-line `OK: <db_title> rows=<n>` on success, or a
# multi-line `FAIL: ...` with the most common fix (share the database with
# the integration directly, not via parent-page inheritance — the exact
# failure we hit during the post-pivot smoke test on 2026-05-08).
#
# We deliberately call the underlying `health_check()` here, not the
# `@tool`-wrapped `notion_health_check` — calling a LangChain tool from a
# bare `__main__` is awkward (it expects to be invoked from a graph).

if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        description="Notion integration pre-flight check."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="run notion_health_check and print OK/FAIL with fix instructions",
    )
    args = parser.parse_args()

    if args.check:
        from .notion_integration import health_check

        db_id = os.getenv("NOTION_LEADS_DATABASE_ID", "") or ""
        result = health_check(db_id)
        err = result.get("error")
        if err:
            print(f"FAIL: {err}")
            # The post-pivot smoke test on 2026-05-08 surfaced exactly this
            # gotcha: an integration inherited from a parent page returns
            # `data_sources: []` rather than a 404. Surface the fix verbatim
            # whenever the error mentions sharing or data_sources so the user
            # doesn't have to translate it.
            err_l = str(err).lower()
            if "data_sources" in err_l or "shared with this integration" in err_l:
                print()
                print(
                    "Fix: open the database in Notion, click ... -> Connections -> + Add connection,"
                )
                print(
                    "     pick your integration directly (not via parent-page inheritance)."
                )
            sys.exit(1)

        rows = result.get("row_count", 0) or 0
        title = result.get("db_title") or "<unknown>"
        if rows == 0:
            print(f"FAIL: database '{title}' has 0 rows visible to the integration.")
            print()
            print(
                "Fix: confirm the database id is correct AND that the integration"
            )
            print(
                "     has been shared on the database itself (... -> Connections)."
            )
            sys.exit(1)
        print(f"OK: '{title}' rows={rows}")
        sys.exit(0)

    parser.print_help()
    sys.exit(2)
