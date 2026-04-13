import type { Command } from "commander";
import { AstarAPI } from "../lib/api";
import { getToken } from "../lib/auth";
import { c, table } from "../lib/ui";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

const channelColors: Record<string, string> = {
  cli: c.cyan,
  mcp: c.magenta,
  api: c.white,
  dashboard: c.yellow,
  system: c.dim,
};

const actorTypeIcons: Record<string, string> = {
  human: "",
  agent: " [agent]",
  system: " [sys]",
};

async function requireAuth(): Promise<string> {
  try {
    return await getToken();
  } catch {
    console.error(`${c.red}✗${c.reset} Not authenticated. Run ${c.cyan}astar login${c.reset} first.`);
    process.exit(1);
  }
}

function showGuide() {
  const d = c.dim;
  const w = c.white;
  const cy = c.cyan;
  const y = c.yellow;
  const r = c.reset;
  const b = c.bold;
  const m = c.magenta;

  console.log(`
  ${b}${w}ASTAR AUDIT — GUIDE${r}

  Append-only event sourcing for every mutation on the platform.
  Every create, update, delete, and scope denial is logged to
  ${cy}audit_events${r}. Nothing is ever deleted from this table.

  ${b}${w}DATA MODEL${r}

    ${b}audit_events${r} table
      ${cy}id${r}              uuid          Primary key
      ${cy}timestamp${r}       timestamptz   When the event occurred (default: now())
      ${cy}actor_email${r}     text          Who triggered the event (human or agent email)
      ${cy}actor_name${r}      text          Display name of the actor
      ${cy}actor_type${r}      text          ${y}human${r} | ${y}agent${r} | ${y}system${r}
      ${cy}actor_agent_id${r}  text          Agent slug — only set when actor_type = agent
      ${cy}entity_type${r}     text          Required — what kind of thing was affected
      ${cy}entity_id${r}       text          Identifier of the affected entity
      ${cy}action${r}          text          Required — what happened
      ${cy}state_before${r}    jsonb         Previous state snapshot (for diffs)
      ${cy}state_after${r}     jsonb         New state snapshot
      ${cy}channel${r}         text          How the mutation arrived (see channels below)
      ${cy}raw_input${r}       jsonb         Original request payload as received
      ${cy}context${r}         jsonb         Extra context: task_uuid, reason, project slug, etc.

  ${b}${w}ACTOR TYPES${r}

    ${y}human${r}     A logged-in user acting via CLI, dashboard, or API
    ${y}agent${r}     A registered agent (actor_agent_id holds the slug)
    ${y}system${r}    Automated platform logic — recurring tasks, link effects,
              overtime orchestration. actor_email may be null.

  ${b}${w}ENTITY TYPES${r}

    ${cy}task${r}        Tasks and subtasks (create, update, complete, comment, link)
    ${cy}skill${r}       Agent skills (upload, update, delete)
    ${cy}news${r}        News posts (create, publish, update, delete)
    ${cy}feedback${r}    Feedback entries (submit, update)
    ${cy}inquiry${r}     Inquiries sent between agents and humans
    ${cy}milestone${r}   Project milestones (create, update)
    ${cy}agent${r}       Agent lifecycle events (register, pause, retire, heartbeat)

    Entity types are extensible — new subsystems add their own.

  ${b}${w}ACTION TYPES${r}

    ${cy}created${r}             New entity was inserted
    ${cy}updated${r}             Existing entity was modified
    ${cy}completed${r}           Task or milestone marked done
    ${cy}published${r}           News post made public
    ${cy}deleted${r}             Entity removed (record is kept in audit)
    ${cy}assigned${r}            Task assigned to a new owner
    ${cy}linked${r}              Task linked to another entity (event, project, feedback)
    ${cy}commented${r}           Comment added to a task
    ${cy}scope_denied${r}        Agent tried to call an MCP tool outside its declared scopes
    ${cy}triage_accepted${r}     Task accepted during triage
    ${cy}triage_dismissed${r}    Task dismissed during triage
    ${cy}recurring_created${r}   System auto-created a recurring task

    Actions are extensible — the table accepts any string.

  ${b}${w}CHANNELS${r}

    ${cy}cli${r}         ${d}astar${r} CLI commands run by a human or script
    ${m}mcp${r}         MCP tool calls — agent or Claude session
    ${cy}api${r}         Direct REST API calls
    ${y}dashboard${r}   Web dashboard interactions
    ${d}system${r}      Automated platform effects (no user involved)

  ${b}${w}HOW TO QUERY${r}

    ${b}CLI${r}
      ${cy}astar audit${r}                           Last 30 events
      ${cy}astar audit --today${r}                  Today only
      ${cy}astar audit --entity task${r}             Filter by entity type
      ${cy}astar audit --actor erik@example.com${r}  Filter by actor
      ${cy}astar audit --agent cfa${r}               Filter by agent slug
      ${cy}astar audit --channel mcp${r}             Filter by channel
      ${cy}astar audit --action scope_denied${r}     Filter by action
      ${cy}astar audit -n 100${r}                    Up to 100 results

    ${b}MCP${r} (scope: ${cy}audit.read${r})
      ${m}query_audit${r}  entity_type, entity_id, actor, actor_agent_id,
                   channel, action, since, limit

    ${b}REST API${r}
      ${cy}GET /audit${r} — same filter params as the MCP tool

  ${b}${w}AUDIT AND OVERTIME${r}

    Every action taken during an overnight run is logged with:
      ${cy}channel${r}     = mcp  (U-Agent/E-Agent call tools via MCP)
      ${cy}actor_type${r}  = human  (overtime agents run as the human's token)
      ${cy}actor_email${r} = the human owner's email

    To isolate overtime activity in the audit trail:
      ${cy}astar audit --channel mcp --today${r}

    Overtime run telemetry (cycles, cost, tokens) lives in the separate
    ${cy}overtime_runs${r} and ${cy}overtime_cycles${r} tables — use ${cy}astar overtime stats${r}
    for that. Audit covers what changed; overtime tables cover how much
    was spent doing it.

  ${b}${w}SCOPE DENIED EVENTS${r}

    When a registered agent calls an MCP tool not in its ${cy}scopes${r} array,
    the MCP server rejects the call and writes an audit event:

      action      = ${y}scope_denied${r}
      actor_type  = ${y}agent${r}
      entity_type = ${cy}agent${r}
      context     = { tool: "the_tool_name", scope_required: "scope.name" }

    Query them:
      ${cy}astar audit --action scope_denied${r}
      ${cy}astar audit --action scope_denied --agent <slug>${r}

  ${b}${w}GOTCHAS${r}

    ${y}audit_events is append-only.${r} There is no delete or update on this
    table. state_before/state_after show what changed; the event itself
    is permanent.

    ${y}actor_email can be null for system events.${r} Always check actor_type
    before reading actor_email.

    ${y}entity_id is a text field, not a foreign key.${r} It holds task numbers,
    slugs, UUIDs, or other identifiers depending on entity_type. Do not
    expect it to be a uuid for all types.

    ${y}state_before/state_after are snapshots, not diffs.${r} They hold the full
    object at that point in time. Compute diffs yourself if needed.

    ${y}channel=system events have no actor.${r} Recurring task creation, link
    propagation, and other automated effects use actor_type=system with
    null actor_email and actor_agent_id.

  ${b}${w}SEE ALSO${r}

    ${cy}astar guide${r}           full system ontology
    ${cy}astar agent guide${r}     agent scopes — what triggers scope_denied
    ${cy}astar overtime guide${r}  overnight agents — how audit captures their work
  `);
}

export function registerAuditCommands(program: Command) {
  const audit = program
    .command("audit")
    .description("Query the audit trail — who did what, when, how")
    .option("--entity <type>", "Filter: task, skill, news, feedback, inquiry, milestone")
    .option("--id <id>", "Filter by entity ID")
    .option("--project <slug>", "Filter by project slug")
    .option("--actor <email>", "Filter by actor email")
    .option("--agent <id>", "Filter by agent ID (e.g. cfa)")
    .option("--channel <ch>", "Filter: cli, mcp, api, dashboard, system")
    .option("--action <action>", "Filter by action")
    .option("--today", "Only today's events")
    .option("-n, --limit <n>", "Max results", "30")
    .action(async (opts) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const since = opts.today ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString() : undefined;
        const events = await api.queryAudit({
          entity_type: opts.entity,
          entity_id: opts.id,
          project: opts.project,
          actor: opts.actor,
          actor_agent_id: opts.agent,
          channel: opts.channel,
          action: opts.action,
          since,
          limit: parseInt(opts.limit),
        });

        if (!events.length) {
          console.log(`${c.dim}No audit events found.${c.reset}`);
          return;
        }

        console.log("");
        table(
          ["Time", "Actor", "Channel", "Entity", "Action", "Detail"],
          events.map((e) => {
            const chColor = channelColors[e.channel || ""] || c.dim;
            const actorName = e.actor_email?.split("@")[0] || e.actor_type;
            const typeIcon = actorTypeIcons[e.actor_type] || "";
            const entityStr = e.entity_id ? `${e.entity_type} #${e.entity_id}` : e.entity_type;
            const detail = e.project?.slug
              ? `${e.project.slug} · ${e.state_after?.title || e.state_after?.comment || e.state_after?.type || ""}`.trim()
              : e.state_after?.title || e.state_after?.comment || e.state_after?.type || "";
            return [
              `${c.dim}${fmtTime(e.timestamp)}${c.reset}`,
              `${actorName}${c.dim}${typeIcon}${c.reset}`,
              `${chColor}${e.channel || "—"}${c.reset}`,
              `${c.cyan}${truncate(entityStr, 20)}${c.reset}`,
              `${c.white}${e.action}${c.reset}`,
              `${c.dim}${truncate(detail, 25)}${c.reset}`,
            ];
          })
        );
        console.log("");
        console.log(`  ${c.dim}${events.length} event(s)${c.reset}`);
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  audit
    .command("guide")
    .description("Audit system documentation — data model, entity types, channels, MCP tools")
    .action(showGuide);
}
