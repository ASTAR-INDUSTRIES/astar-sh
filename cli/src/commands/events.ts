import type { Command } from "commander";
import { AstarAPI, type EventAttendee, type Task } from "../lib/api";
import { c, table } from "../lib/ui";
import { getToken } from "../lib/auth";

async function requireAuth(): Promise<string> {
  try {
    return await getToken();
  } catch {
    console.error(`${c.red}✗${c.reset} Not authenticated. Run ${c.cyan}astar login${c.reset} first.`);
    process.exit(1);
  }
}

function collect(value: string, previous: string[] = []) {
  previous.push(value);
  return previous;
}

function truncate(value: string | undefined | null, max: number): string {
  const text = value || "";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function fmtDate(value?: string | null, tentative?: boolean): string {
  if (!value) return tentative ? "TBD" : "—";
  const label = new Date(value + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return tentative ? `${label} (tentative)` : label;
}

function parseExternalAttendee(value: string): EventAttendee {
  const [name, org, role] = value.split("|").map((part) => part.trim());
  if (!name) {
    throw new Error("External attendees must use name|org|role");
  }
  return { kind: "external", name, org: org || undefined, role: role || undefined };
}

function parseAttendees(internal: string[] = [], external: string[] = []): EventAttendee[] {
  return [
    ...internal.map((name) => ({ kind: "internal" as const, name: name.trim() })).filter((attendee) => attendee.name),
    ...external.filter(Boolean).map(parseExternalAttendee),
  ];
}

const typeColors: Record<string, string> = {
  arranged: c.cyan,
  speaking: c.magenta,
  attending: c.white,
  podcast: c.yellow,
};

const statusColors: Record<string, string> = {
  tentative: c.yellow,
  confirmed: c.green,
  completed: c.dim,
  cancelled: c.red,
};

const taskStatusColors: Record<string, string> = {
  open: c.white,
  in_progress: c.yellow,
  completed: c.green,
  blocked: c.red,
  cancelled: c.dim,
};

function renderLinkedTasks(tasks: Task[]) {
  if (!tasks.length) {
    console.log(`  ${c.dim}No linked tasks yet.${c.reset}`);
    return;
  }

  const rows: string[][] = [];
  for (const task of tasks) {
    rows.push([
      `${c.cyan}${task.task_number}${c.reset}`,
      truncate(task.title, 34),
      `${taskStatusColors[task.status] || c.dim}${task.status}${c.reset}`,
      `${task.priority}`,
      task.due_date ? `${c.dim}${fmtDate(task.due_date)}${c.reset}` : `${c.dim}—${c.reset}`,
    ]);
    if (task.subtasks?.length) {
      for (const subtask of task.subtasks) {
        const icon = subtask.status === "completed" ? `${c.green}✓${c.reset}` : `${c.dim}○${c.reset}`;
        rows.push([
          `${c.dim}└${c.reset}${c.cyan}${subtask.task_number}${c.reset}`,
          `${icon} ${c.dim}${truncate(subtask.title, 30)}${c.reset}`,
          `${taskStatusColors[subtask.status] || c.dim}${subtask.status}${c.reset}`,
          `${c.dim}${subtask.priority}${c.reset}`,
          subtask.due_date ? `${c.dim}${fmtDate(subtask.due_date)}${c.reset}` : `${c.dim}—${c.reset}`,
        ]);
      }
    }
  }

  console.log("");
  table(["#", "Task", "Status", "Priority", "Due"], rows);
}

async function renderEventList(api: AstarAPI, filters: { status?: string; type?: string; month?: string; search?: string; project?: string }) {
  const items = await api.listEvents(filters);
  if (!items.length) {
    console.log(`${c.dim}No events found.${c.reset}`);
    return;
  }

  console.log("");
  table(
    ["Slug", "Event", "Type", "Status", "Date", "Project", "Location"],
    items.map((event) => [
      `${c.cyan}${event.slug}${c.reset}`,
      truncate(event.title, 28),
      `${typeColors[event.type] || c.dim}${event.type}${c.reset}`,
      `${statusColors[event.status] || c.dim}${event.status}${c.reset}`,
      `${c.dim}${fmtDate(event.date, event.date_tentative)}${c.reset}`,
      truncate(event.project?.slug || "—", 12),
      truncate(event.location || "—", 18),
    ])
  );
  console.log("");
  console.log(`  ${c.dim}${items.length} event(s)${c.reset}`);
  console.log("");
}

// ── Guide ───────────────────────────────────────────────────────────

function showGuide() {
  const d = c.dim;
  const w = c.white;
  const cy = c.cyan;
  const y = c.yellow;
  const r = c.reset;
  const b = c.bold;
  const m = c.magenta;
  const g = c.green;

  console.log(`
  ${b}${w}ASTAR EVENTS — GUIDE${r}

  Events are first-class time-bounded work items: conferences, partner
  meetings, speaking slots, and podcasts. They provide a time anchor for
  tasks — anything that needs to happen before or at a specific occasion.

  ${b}${w}DATA MODEL${r}

    ${b}events${r} table
      ${cy}id${r}              uuid          Primary key
      ${cy}slug${r}            text          Unique identifier used in CLI and MCP
      ${cy}title${r}           text          Required display name
      ${cy}type${r}            text          arranged | speaking | attending | podcast
      ${cy}status${r}          text          tentative | confirmed | completed | cancelled
      ${cy}goal${r}            text          Required — why this event exists / success criteria
      ${cy}date${r}            date          Optional scheduled date (YYYY-MM-DD)
      ${cy}date_tentative${r}  boolean       true when the date is approximate
      ${cy}location${r}        text          Optional venue or URL
      ${cy}attendees${r}       jsonb         Array of attendee objects (see Attendees below)
      ${cy}visibility${r}      text          private | team | public
      ${cy}project_id${r}      uuid          FK → projects (optional)
      ${cy}created_by${r}      text          Email of creator
      ${cy}created_at${r}      timestamptz
      ${cy}updated_at${r}      timestamptz

    ${b}attendees${r} (inside the jsonb array)
      ${cy}kind${r}    "internal" | "external"
      ${cy}name${r}    Display name
      ${cy}org${r}     Organization (external only, optional)
      ${cy}role${r}    Role or title (external only, optional)

  ${b}${w}STATUS LIFECYCLE${r}

    ${y}tentative${r} → ${g}confirmed${r} → ${d}completed${r}
                          ↘ ${c.red}cancelled${r}

    New events default to ${y}tentative${r}. Move to ${g}confirmed${r} once the date
    and logistics are locked. Mark ${d}completed${r} after the event runs.
    Use ${c.red}cancelled${r} if it falls through.

    The ${cy}date_tentative${r} flag is separate from status — it indicates
    the date is approximate even when the event is confirmed.

  ${b}${w}EVENT TYPES${r}

    ${cy}arranged${r}   You arranged/organized the event (host role)
    ${cy}speaking${r}   You are presenting or speaking
    ${cy}attending${r}  You are attending (default)
    ${cy}podcast${r}    Podcast recording or appearance

  ${b}${w}ATTENDEES MODEL${r}

    Internal attendees have only ${cy}kind${r} and ${cy}name${r}.
    External attendees also carry ${cy}org${r} and ${cy}role${r}.

    CLI: ${cy}--internal "Alice"${r} and ${cy}--external "Bob|Acme Corp|CEO"${r}
    The ${cy}update${r} command replaces the entire attendees array — re-pass
    all attendees when adding one, or use ${cy}--clear-attendees${r} to remove all.

  ${b}${w}TASK LINKAGE${r}

    Tasks attach to an event via ${cy}tasks.event_id${r}.
    When you view an event with ${cy}astar events info <slug>${r}, all linked
    tasks and their subtasks are shown.

    Create a task tied to an event:
      ${cy}astar todo "Prepare slides" --event <slug>${r}
    Filter tasks for an event:
      ${cy}astar todo --event <slug>${r}

    Tasks survive if their event is cancelled — they are not auto-deleted.

  ${b}${w}MCP TOOLS (for agents)${r}

    ${m}create_event${r}   Create an event (title, goal, type, status, date, attendees)
    ${m}list_events${r}    List events — filter by status, type, month, project, search
    ${m}get_event${r}      Full event detail + linked tasks
    ${m}update_event${r}   Patch any event field

  ${b}${w}CLI COMMANDS${r}

    ${cy}astar events${r}                     List all events
    ${cy}astar events "Title" --goal "..."${r} Create an event (goal required)
    ${cy}astar events list${r}                Same as above
    ${cy}astar events list --status confirmed${r}
    ${cy}astar events list --type speaking${r}
    ${cy}astar events list --month 2026-06${r}
    ${cy}astar events list --project <slug>${r}
    ${cy}astar events info <slug>${r}         Full detail + linked tasks
    ${cy}astar events update <slug>${r}       Patch event fields
    ${cy}astar events update <slug> --status confirmed${r}
    ${cy}astar events update <slug> --date 2026-06-15${r}
    ${cy}astar events guide${r}               This guide

  ${b}${w}RELATIONSHIPS TO OTHER SUBSYSTEMS${r}

    ${cy}events → tasks${r}       tasks.event_id scopes tasks to an event
    ${cy}events → projects${r}    events.project_id groups events into workstreams
    ${cy}events → audit${r}       event create/update/delete is logged

  ${b}${w}GOTCHAS${r}

    ${y}Goal is required.${r} You cannot create an event without ${cy}--goal${r}.
    This enforces intentionality — every event must justify itself.

    ${y}Slug is the stable identifier.${r} Use slug for all CLI and MCP calls.
    Auto-derived from title if not set. Changing slug breaks existing references.

    ${y}Attendees are replaced, not merged.${r} Calling update with new attendees
    replaces the entire list. Fetch current attendees first if adding incrementally.

    ${y}date vs date_tentative:${r} A confirmed event can still have a tentative date.
    Use ${cy}--exact-date${r} to clear the tentative flag once the date is locked.

    ${y}Tasks are not deleted with the event.${r} Cancelling or deleting an event
    leaves its tasks intact — they lose the event_id link but remain in the task list.

  ${b}${w}SEE ALSO${r}

    ${cy}astar guide${r}            full system ontology
    ${cy}astar todo guide${r}       task system — subtasks, triage, MCP tools
    ${cy}astar projects guide${r}   project workstreams and membership
    ${cy}astar audit guide${r}      audit trail — querying mutations
  `);
}

// ── Register ────────────────────────────────────────────────────────

export function registerEventCommands(program: Command) {
  const events = program
    .command("events [title]")
    .description("Track events and the work tied to them")
    .option("-g, --goal <text>", "Why this event exists / success criteria")
    .option("-t, --type <type>", "Type: arranged, speaking, attending, podcast")
    .option("-s, --status <status>", "Status: tentative, confirmed, completed, cancelled")
    .option("-d, --date <date>", "Date (YYYY-MM-DD)")
    .option("--tentative", "Mark the date as tentative")
    .option("-l, --location <text>", "Location")
    .option("--slug <slug>", "Custom slug")
    .option("--visibility <visibility>", "Visibility: private, team, public", "team")
    .option("--project <slug>", "Attach to a project")
    .option("--internal <name>", "Internal attendee (repeatable)", collect, [])
    .option("--external <attendee>", "External attendee as name|org|role (repeatable)", collect, [])
    .action(async (title: string | undefined, opts: {
      goal?: string;
      type: string;
      status: string;
      date?: string;
      tentative?: boolean;
      location?: string;
      slug?: string;
      visibility: string;
      project?: string;
      internal?: string[];
      external?: string[];
    }) => {
      if (!title) {
        const token = await requireAuth();
        const api = new AstarAPI(token);
        try {
          await renderEventList(api, { status: opts.status, type: opts.type, project: opts.project });
        } catch (e: any) {
          console.error(`${c.red}✗${c.reset} ${e.message}`);
          process.exit(1);
        }
        return;
      }

      if (!opts.goal) {
        console.error(`${c.red}✗${c.reset} Goal is required. Use ${c.cyan}--goal${c.reset} to define what success looks like.`);
        process.exit(1);
      }

      const token = await requireAuth();
      const api = new AstarAPI(token);

      try {
        const attendees = parseAttendees(opts.internal, opts.external);
        const result = await api.createEvent({
          title,
          goal: opts.goal,
          slug: opts.slug,
          type: opts.type || "attending",
          status: opts.status || "tentative",
          date: opts.date,
          date_tentative: opts.tentative,
          location: opts.location,
          visibility: opts.visibility,
          project: opts.project,
          attendees,
        });
        const typeColor = typeColors[opts.type || "attending"] || c.dim;
        const dateStr = opts.date ? ` ${c.dim}(${fmtDate(opts.date, opts.tentative)})${c.reset}` : "";
        const projectStr = opts.project ? ` ${c.dim}#${opts.project}${c.reset}` : "";
        console.log(`${c.green}✓${c.reset} Event created ${typeColor}${result.slug}${c.reset}${dateStr}${projectStr}`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  events
    .command("list")
    .description("List events")
    .option("-s, --status <status>", "Filter: tentative, confirmed, completed, cancelled")
    .option("-t, --type <type>", "Filter: arranged, speaking, attending, podcast")
    .option("-m, --month <month>", "Filter by month (YYYY-MM)")
    .option("--search <text>", "Search title, goal, or location")
    .option("--project <slug>", "Filter to a single project")
    .action(async (opts: { status?: string; type?: string; month?: string; search?: string; project?: string }) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);

      try {
        await renderEventList(api, opts);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  events
    .command("info <slug>")
    .description("Show an event and its linked tasks")
    .action(async (slug: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);

      try {
        const { event, tasks } = await api.getEvent(slug);
        const typeColor = typeColors[event.type] || c.dim;
        const statusColor = statusColors[event.status] || c.dim;

        console.log("");
        console.log(`  ${c.bold}${event.title}${c.reset}`);
        console.log(`  ${c.cyan}${event.slug}${c.reset} · ${typeColor}${event.type}${c.reset} · ${statusColor}${event.status}${c.reset}`);
        console.log(`  ${c.dim}${event.goal}${c.reset}`);
        console.log("");
        console.log(`  ${c.dim}Date${c.reset} ${fmtDate(event.date, event.date_tentative)}`);
        console.log(`  ${c.dim}Location${c.reset} ${event.location || "—"}`);
        if (event.project?.slug) console.log(`  ${c.dim}Project${c.reset} ${event.project.slug} · ${event.project.name}`);
        console.log(`  ${c.dim}Visibility${c.reset} ${event.visibility}`);
        console.log(`  ${c.dim}Created by${c.reset} ${event.created_by.split("@")[0]}`);

        if (event.attendees?.length) {
          console.log("");
          console.log(`  ${c.bold}${c.white}Attendees${c.reset}`);
          for (const attendee of event.attendees) {
            const prefix = attendee.kind === "internal" ? `${c.cyan}internal${c.reset}` : `${c.yellow}external${c.reset}`;
            const details = [attendee.org, attendee.role].filter(Boolean).join(" · ");
            console.log(`  ${prefix} ${attendee.name}${details ? ` ${c.dim}(${details})${c.reset}` : ""}`);
          }
        }

        console.log("");
        console.log(`  ${c.bold}${c.white}Linked Tasks${c.reset}`);
        renderLinkedTasks(tasks);
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  events
    .command("guide")
    .description("Event system documentation — types, lifecycle, attendees, task linkage, MCP tools")
    .action(showGuide);

  events
    .command("update <slug>")
    .description("Update event fields")
    .option("--title <title>", "New title")
    .option("--goal <text>", "New goal / success criteria")
    .option("-t, --type <type>", "Type: arranged, speaking, attending, podcast")
    .option("-s, --status <status>", "Status: tentative, confirmed, completed, cancelled")
    .option("-d, --date <date>", "Date (YYYY-MM-DD)")
    .option("--clear-date", "Remove the scheduled date")
    .option("--tentative", "Mark the date as tentative")
    .option("--exact-date", "Mark the date as confirmed/exact")
    .option("-l, --location <text>", "Location")
    .option("--clear-location", "Remove the location")
    .option("--visibility <visibility>", "Visibility: private, team, public")
    .option("--project <slug>", "Attach to a project")
    .option("--clear-project", "Remove the project attachment")
    .option("--internal <name>", "Replace internal attendees (repeatable)", collect, [])
    .option("--external <attendee>", "Replace external attendees as name|org|role (repeatable)", collect, [])
    .option("--clear-attendees", "Remove all attendees")
    .action(async (slug: string, opts: {
      title?: string;
      goal?: string;
      type?: string;
      status?: string;
      date?: string;
      clearDate?: boolean;
      tentative?: boolean;
      exactDate?: boolean;
      location?: string;
      clearLocation?: boolean;
      visibility?: string;
      project?: string;
      clearProject?: boolean;
      internal?: string[];
      external?: string[];
      clearAttendees?: boolean;
    }) => {
      const patch: Record<string, any> = {};
      if (opts.title) patch.title = opts.title;
      if (opts.goal) patch.goal = opts.goal;
      if (opts.type) patch.type = opts.type;
      if (opts.status) patch.status = opts.status;
      if (opts.date) patch.date = opts.date;
      if (opts.clearDate) patch.date = null;
      if (opts.tentative) patch.date_tentative = true;
      if (opts.exactDate) patch.date_tentative = false;
      if (opts.location) patch.location = opts.location;
      if (opts.clearLocation) patch.location = null;
      if (opts.visibility) patch.visibility = opts.visibility;
      if (opts.project) patch.project = opts.project;
      if (opts.clearProject) patch.project = null;
      if (opts.clearAttendees) patch.attendees = [];
      if ((opts.internal?.length || 0) > 0 || (opts.external?.length || 0) > 0) {
        patch.attendees = parseAttendees(opts.internal, opts.external);
      }

      if (!Object.keys(patch).length) {
        console.error(`${c.red}✗${c.reset} No updates specified.`);
        process.exit(1);
      }

      const token = await requireAuth();
      const api = new AstarAPI(token);

      try {
        await api.updateEvent(slug, patch);
        console.log(`${c.green}✓${c.reset} Event updated ${c.cyan}${slug}${c.reset}`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });
}
