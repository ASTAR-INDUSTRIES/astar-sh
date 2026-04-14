import type { Command } from "commander";
import { c } from "../lib/ui";

function showGuide() {
  const d = c.dim;
  const w = c.white;
  const cy = c.cyan;
  const y = c.yellow;
  const g = c.green;
  const r = c.reset;
  const b = c.bold;
  const m = c.magenta;

  console.log(`
  ${b}${w}ASTAR.SH — SYSTEM GUIDE${r}

  astar.sh is a consulting operations platform. It manages skills, tasks,
  projects, events, agents, feedback, audit trails, and overnight automation.
  Everything is connected — this guide explains the ontology.

  ${b}${w}ENTITY RELATIONSHIP MAP${r}

    ${cy}projects${r} ──┬──▶ ${cy}tasks${r} ──▶ ${cy}subtasks${r} (parent_task_id)
               ├──▶ ${cy}events${r} ──▶ ${cy}tasks${r} (event_id)
               ├──▶ ${cy}agents${r}
               └──▶ ${cy}milestones${r}

    ${cy}tasks${r} ──────┬──▶ ${cy}task_links${r} (skill, news, feedback, url, milestone, task)
               └──▶ ${cy}feedback${r} (completing a task with feedback link closes feedback)

    ${cy}overtime_runs${r} ──▶ ${cy}overtime_cycles${r} (per-agent invocation telemetry)
    ${cy}overtime_runs${r} ──▶ ${cy}tasks${r} (parent task + subtasks per requirement)

    ${cy}agents${r} ────▶ ${cy}tasks${r} (agents create tasks, source="agent", requires_triage=true)
    ${cy}audit_events${r} ──▶ all entities (immutable log of every mutation)

  ${b}${w}SUBSYSTEMS${r}

    ${b}${cy}tasks${r} (${cy}astar todo${r})
    Core work tracking. Statuses: open → in_progress → completed | blocked | cancelled.
    Subtasks via parent_task_id. Tasks link to events, projects, feedback, skills.
    Agent-created tasks need triage before appearing in main list.
    Guide: ${cy}astar todo guide${r}

    ${b}${cy}projects${r} (${cy}astar projects${r})
    Workstream grouping. Tasks, events, agents, milestones attach via project_id.
    Visibility: private (owner only) | team (owner + members) | public (all staff).
    Guide: ${cy}astar projects guide${r}

    ${b}${cy}events${r} (${cy}astar events${r})
    Time-bounded activities: conferences, meetings, speaking slots, podcasts.
    Lifecycle: tentative → confirmed → completed | cancelled.
    Tasks link to events via event_id.
    Guide: ${cy}astar events guide${r}

    ${b}${cy}agents${r} (${cy}astar agent${r})
    Non-human employees with Microsoft accounts, heartbeats, and scopes.
    Registered agents run on launchd, read inbox, and act on tasks.
    Overtime agents are ephemeral — spawned per spec, not registered.
    Guide: ${cy}astar agent guide${r}

    ${b}${cy}overtime${r} (${cy}astar overtime${r})
    Overnight automation. Write a spec, spawn U-Agent + E-Agent, wake up to commits.
    U-Agent implements subtasks. E-Agent reviews and approves (LGTM) or rejects.
    Telemetry in overtime_runs + overtime_cycles tables.
    Guide: ${cy}astar overtime guide${r}

    ${b}${cy}audit${r} (${cy}astar audit${r})
    Append-only event log for every platform mutation. Entity types: task, skill,
    news, feedback, inquiry, milestone, agent. Channels: cli, mcp, api, dashboard, system.
    Guide: ${cy}astar audit guide${r}

    ${b}${cy}feedback${r} (${cy}astar feedback${r})
    Bug reports, feature requests, pain points, praise. Types: bug, feature, pain, praise.
    Statuses: new → accepted | rejected | done. Linking to a task auto-closes feedback.

    ${b}${cy}skills${r} (${cy}astar skill${r})
    Reusable Claude Code skill files. Install to .claude/skills/. Versioned with history.

    ${b}${cy}news${r} (${cy}astar news${r})
    Internal briefings for agents and staff. Agents consume news via MCP.

    ${b}${cy}etf${r} (${cy}astar etf${r})
    Internal investment portfolio tracker. Tracks holdings, prices, rebalancing.

  ${b}${w}HOW AGENTS USE THIS SYSTEM${r}

    Agents interact exclusively via MCP tools (never the CLI). Key tools:
      ${m}list_tasks / get_task / create_task / update_task / comment_task${r}
      ${m}list_projects / get_project / list_events / get_event${r}
      ${m}list_agents / get_agent / ask_agent / read_inbox / respond_inbox${r}
      ${m}query_audit / submit_feedback / list_feedback${r}

    ${y}Triage:${r} Agent-created tasks start with requires_triage=true.
    Human runs ${cy}astar todo triage${r} to accept or dismiss them.

    ${y}Scope enforcement:${r} Registered agents can only call tools matching their
    declared scopes. Denied calls are logged to audit with action=scope_denied.

    ${y}Overtime agents:${r} Not registered. Spawned as local Claude processes.
    Use the full MCP toolset. Communicate only via task comments.

  ${b}${w}SUBSYSTEM GUIDES${r}

    ${cy}astar todo guide${r}        task system — data model, statuses, subtasks, links
    ${cy}astar projects guide${r}    project workstreams — visibility, membership, linking
    ${cy}astar events guide${r}      events — lifecycle, types, task linkage
    ${cy}astar agent guide${r}       agent registry — scopes, heartbeat, auth, workstations
    ${cy}astar overtime guide${r}    overnight automation — specs, U/E-Agent, telemetry
    ${cy}astar audit guide${r}       audit trail — entity types, actions, querying

  ${b}${w}AUTHENTICATION${r}

    Human CLI:   ${cy}astar login${r}    OAuth via browser → token stored in ~/.astar/auth.json
    Agents:      Microsoft MSAL token stored in ~/.astar/agents/<slug>/auth.json
    MCP server:  Same token, passed via Authorization header
    Overtime:    Inherits the parent Claude session's MCP credentials

  `);
}

export function registerGuideCommand(program: Command) {
  program
    .command("guide")
    .description("System overview — all subsystems, entity relationships, and agent usage")
    .action(showGuide);
}
