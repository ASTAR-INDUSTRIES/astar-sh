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

async function renderEventList(api: AstarAPI, filters: { status?: string; type?: string; month?: string; search?: string }) {
  const items = await api.listEvents(filters);
  if (!items.length) {
    console.log(`${c.dim}No events found.${c.reset}`);
    return;
  }

  console.log("");
  table(
    ["Slug", "Event", "Type", "Status", "Date", "Location"],
    items.map((event) => [
      `${c.cyan}${event.slug}${c.reset}`,
      truncate(event.title, 28),
      `${typeColors[event.type] || c.dim}${event.type}${c.reset}`,
      `${statusColors[event.status] || c.dim}${event.status}${c.reset}`,
      `${c.dim}${fmtDate(event.date, event.date_tentative)}${c.reset}`,
      truncate(event.location || "—", 18),
    ])
  );
  console.log("");
  console.log(`  ${c.dim}${items.length} event(s)${c.reset}`);
  console.log("");
}

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
      internal?: string[];
      external?: string[];
    }) => {
      if (!title) {
        const token = await requireAuth();
        const api = new AstarAPI(token);
        try {
          await renderEventList(api, { status: opts.status, type: opts.type });
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
          attendees,
        });
        const typeColor = typeColors[opts.type || "attending"] || c.dim;
        const dateStr = opts.date ? ` ${c.dim}(${fmtDate(opts.date, opts.tentative)})${c.reset}` : "";
        console.log(`${c.green}✓${c.reset} Event created ${typeColor}${result.slug}${c.reset}${dateStr}`);
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
    .action(async (opts: { status?: string; type?: string; month?: string; search?: string }) => {
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
