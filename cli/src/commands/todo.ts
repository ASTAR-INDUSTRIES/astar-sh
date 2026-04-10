import type { Command } from "commander";
import { AstarAPI, type Task } from "../lib/api";
import { c, table } from "../lib/ui";
import { getToken } from "../lib/auth";
import { getAuthStatus } from "../lib/auth";

async function requireAuth(): Promise<string> {
  try {
    return await getToken();
  } catch {
    console.error(`${c.red}✗${c.reset} Not authenticated. Run ${c.cyan}astar login${c.reset} first.`);
    process.exit(1);
  }
}

function fmtDate(d: string): string {
  if (!d) return "";
  if (d.length === 10) return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function parseNum(s: string): number {
  return parseInt(s.replace("#", ""));
}

const statusColors: Record<string, string> = {
  open: c.white,
  in_progress: c.yellow,
  completed: c.green,
  blocked: c.red,
  cancelled: c.dim,
};

const priorityColors: Record<string, string> = {
  low: c.dim,
  medium: c.white,
  high: c.yellow,
  critical: c.red,
};

function renderTaskTable(tasks: Task[]) {
  if (!tasks.length) {
    console.log(`${c.dim}No tasks found.${c.reset}`);
    return;
  }
  const rows: string[][] = [];
  for (const t of tasks) {
    const subCount = t.subtasks?.length || 0;
    const subDone = t.subtasks?.filter((s) => s.status === "completed").length || 0;
    const titleSuffix = subCount > 0 ? ` ${c.dim}[${subDone}/${subCount}]${c.reset}` : "";
    const eventSuffix = t.event?.slug ? ` ${c.dim}@${t.event.slug}${c.reset}` : "";
    const projectSuffix = t.project?.slug ? ` ${c.dim}#${t.project.slug}${c.reset}` : "";
    rows.push([
      `${c.cyan}${t.task_number}${c.reset}`,
      truncate(t.title, 35) + titleSuffix + eventSuffix + projectSuffix,
      `${statusColors[t.status] || c.dim}${t.status}${c.reset}`,
      `${priorityColors[t.priority] || c.dim}${t.priority}${c.reset}`,
      `${c.dim}${t.assigned_to?.split("@")[0] || "—"}${c.reset}`,
      t.due_date ? `${c.dim}${fmtDate(t.due_date)}${c.reset}` : `${c.dim}—${c.reset}`,
    ]);
    if (t.subtasks?.length) {
      for (const s of t.subtasks) {
        const icon = s.status === "completed" ? `${c.green}✓${c.reset}` : s.status === "in_progress" ? `${c.yellow}›${c.reset}` : `${c.dim}○${c.reset}`;
        rows.push([
          `${c.dim} └${c.reset}${c.cyan}${s.task_number}${c.reset}`,
          `${icon} ${c.dim}${truncate(s.title, 32)}${c.reset}`,
          `${statusColors[s.status] || c.dim}${s.status}${c.reset}`,
          `${c.dim}${s.priority}${c.reset}`,
          `${c.dim}${s.assigned_to?.split("@")[0] || "—"}${c.reset}`,
          s.due_date ? `${c.dim}${fmtDate(s.due_date)}${c.reset}` : `${c.dim}—${c.reset}`,
        ]);
      }
    }
  }
  console.log("");
  table(["#", "Title", "Status", "Priority", "Assigned", "Due"], rows);
  console.log("");
  console.log(`  ${c.dim}${tasks.length} task(s)${c.reset}`);
  console.log("");
}

const priorityBars: Record<string, string> = {
  critical: "█",
  high: "█",
  medium: "▓",
  low: "░",
};

let monitorExpanded = false;
let lastOpenTasks: Task[] = [];
let lastCompletedTasks: Task[] = [];
let monitorError = "";

async function renderMonitor(api: AstarAPI, opts: { mineOnly?: boolean; myEmail?: string; event?: string; project?: string } = {}) {
  try {
    const [open, done] = await Promise.all([
      api.listTasks({ assigned_to: opts.mineOnly ? undefined : "all", event: opts.event, project: opts.project, include_subtasks: true }),
      api.listTasks({ assigned_to: opts.mineOnly ? undefined : "all", event: opts.event, project: opts.project, status: "completed" }),
    ]);
    lastOpenTasks = open;
    lastCompletedTasks = done;
    monitorError = "";
  } catch (e: any) {
    const code = e.code || "";
    monitorError = code === "AUTH_EXPIRED"
      ? "session expired — re-run astar login"
      : code === "NETWORK_ERROR"
        ? "API unreachable — check your connection"
        : e.message || "unknown error";
  }
  const openTasks = lastOpenTasks;
  const completedTasks = lastCompletedTasks;

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const doneToday = completedTasks.filter((t) => t.completed_at?.startsWith(todayStr));
  const open = openTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");

  const sorted = [...open].sort((a, b) => {
    const po: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (po[a.priority] ?? 2) - (po[b.priority] ?? 2);
  });

  process.stdout.write("\x1b[2J\x1b[H");

  const cols = process.stdout.columns || 100;
  const rightWidth = 30;
  const titleWidth = Math.max(20, cols - rightWidth - 10);
  const descWidth = Math.max(20, cols - 12);

  console.log("");
  const baseLabel = opts.mineOnly ? "MY TASKS" : "TASKS";
  const scopeLabel = [opts.event ? `@${opts.event}` : "", opts.project ? `#${opts.project}` : ""].filter(Boolean).join(" ");
  const headerLabel = scopeLabel ? `${baseLabel} ${scopeLabel}` : baseLabel;
  const headerPad = Math.max(1, cols - 13 - headerLabel.length);
  console.log(`  ${c.bold}${headerLabel}${c.reset}${" ".repeat(headerPad)}${c.dim}${time}${c.reset}`);
  console.log("");

  for (const t of sorted) {
    const bar = priorityBars[t.priority] || "░";
    const pColor = priorityColors[t.priority] || c.dim;
    const due = t.due_date ? fmtDate(t.due_date) : "—";
    const assignee = t.assigned_to?.split("@")[0] || "—";
    const overdue = t.due_date && t.due_date < todayStr;
    const num = `#${t.task_number}`;
    const numPad = num.length < 4 ? " ".repeat(4 - num.length) : "";
    const title = t.title.length > titleWidth ? t.title.slice(0, titleWidth - 1) + "…" : t.title;
    const titlePad = " ".repeat(Math.max(1, titleWidth - title.length));

    const subCount = t.subtasks?.length || 0;
    const subDone = t.subtasks?.filter((s) => s.status === "completed").length || 0;
    const subLabel = subCount > 0 ? ` [${subDone}/${subCount}]` : "";
    const scopeTag = [t.event?.slug ? `@${t.event.slug}` : "", t.project?.slug ? `#${t.project.slug}` : ""].filter(Boolean).join(" ");
    const suffix = `${subLabel}${scopeTag ? ` ${scopeTag}` : ""}`;
    const isMine = opts.myEmail && t.assigned_to === opts.myEmail;
    const titleColor = isMine && !opts.mineOnly ? c.white : "";
    const titleReset = isMine && !opts.mineOnly ? c.reset : "";
    const assigneeColor = isMine && !opts.mineOnly ? c.white : c.dim;

    const maxTitle = titleWidth - suffix.length;
    const trimmedTitle = t.title.length > maxTitle ? t.title.slice(0, maxTitle - 1) + "…" : t.title;
    const fullTitle = `${trimmedTitle}${suffix}`;
    const fullTitlePad = " ".repeat(Math.max(1, titleWidth - fullTitle.length));
    const renderedTitle = `${titleColor}${trimmedTitle}${titleReset}${suffix ? `${c.dim}${suffix}${c.reset}` : ""}`;

    console.log(`  ${pColor}${bar}${c.reset} ${c.cyan}${num}${c.reset}${numPad}  ${renderedTitle}${fullTitlePad}${pColor}${t.priority.padEnd(9)}${c.reset}${overdue ? c.red : c.dim}${due.padEnd(8)}${c.reset}${assigneeColor}${assignee}${c.reset}`);

    if (monitorExpanded && t.description) {
      const desc = t.description.length > descWidth ? t.description.slice(0, descWidth - 1) + "…" : t.description;
      console.log(`  ${c.dim}  ${" ".repeat(num.length + numPad.length)} ${desc}${c.reset}`);
    }

    if (monitorExpanded && t.subtasks?.length) {
      for (const s of t.subtasks) {
        const sIcon = s.status === "completed" ? `${c.green}✓${c.reset}` : s.status === "in_progress" ? `${c.yellow}›${c.reset}` : `${c.dim}○${c.reset}`;
        const sTitle = s.title.length > titleWidth - 4 ? s.title.slice(0, titleWidth - 5) + "…" : s.title;
        console.log(`  ${c.dim}  ${" ".repeat(num.length + numPad.length)} ${sIcon} ${c.cyan}#${s.task_number}${c.reset} ${c.dim}${sTitle}${c.reset}`);
      }
    }
  }

  if (doneToday.length) {
    console.log("");
    console.log(`  ${c.dim}─${c.reset}`);
    for (const t of doneToday) {
      const doneTime = t.completed_at ? new Date(t.completed_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "";
      const num = `#${t.task_number}`;
      const numPad = num.length < 4 ? " ".repeat(4 - num.length) : "";
      const title = t.title.length > titleWidth ? t.title.slice(0, titleWidth - 1) + "…" : t.title;
      const titlePad = " ".repeat(Math.max(1, titleWidth - title.length));
      console.log(`  ${c.green}✓${c.reset} ${c.dim}${num}${c.reset}${numPad}  ${c.dim}${title}${titlePad}done${" ".repeat(5)}${doneTime}${c.reset}`);
    }
  }

  console.log("");
  if (monitorError) {
    console.log(`  ${c.yellow}⚠${c.reset}  ${c.yellow}${monitorError}${c.reset} ${c.dim}— showing last known state${c.reset}`);
  }
  console.log(`  ${c.dim}${sorted.length} open · ${doneToday.length} done today${c.reset}${" ".repeat(Math.max(1, cols - 60))}${c.dim}ctrl+o ${monitorExpanded ? "collapse" : "expand"} · ctrl+c quit${c.reset}`);
}

export function registerTodoCommands(program: Command) {
  const todo = program
    .command("todo [title]")
    .description("Manage tasks — create, complete, and track work")
    .option("-p, --priority <priority>", "Priority: low, medium, high, critical", "medium")
    .option("-d, --due <date>", "Due date (YYYY-MM-DD)")
    .option("-a, --assign <email>", "Assign to (default: yourself)")
    .option("-t, --tag <tag>", "Add tag")
    .option("--description <text>", "Task description")
    .option("--parent <number>", "Parent task number (creates subtask)")
    .option("--skill <slug>", "Link to a skill")
    .option("--event <slug>", "Assign or filter tasks by event")
    .option("--project <slug>", "Assign or filter tasks by project")
    .option("--estimate <hours>", "Estimated hours")
    .option("--recurring <interval>", "Recurring: weekly, monthly, quarterly")
    .option("--monitor", "Live-updating task view (refreshes every 10s)")
    .action(async (title: string | undefined, opts) => {
      if (opts.monitor) {
        const authStatus = await getAuthStatus();
        const myEmail = authStatus?.email;
        async function freshApi(): Promise<AstarAPI> {
          const token = await getToken();
          return new AstarAPI(token);
        }
        async function tick() {
          try { const api = await freshApi(); await renderMonitor(api, { myEmail, event: opts.event, project: opts.project }); } catch { /* token dead, renderMonitor handles display */ }
        }
        await tick();
        const interval = setInterval(tick, 10000);

        if (process.stdin.isTTY) {
          process.stdin.setRawMode(true);
          process.stdin.resume();
          process.stdin.on("data", (key: Buffer) => {
            if (key[0] === 0x03) { clearInterval(interval); process.stdin.setRawMode(false); console.log(""); process.exit(0); }
            if (key[0] === 0x0f) { monitorExpanded = !monitorExpanded; tick(); }
          });
        } else {
          process.on("SIGINT", () => { clearInterval(interval); console.log(""); process.exit(0); });
        }

        await new Promise(() => {});
        return;
      }

      if (!title) {
        const token = await requireAuth();
        const api = new AstarAPI(token);
        try {
          const tasks = await api.listTasks({ status: "open", event: opts.event, project: opts.project, include_subtasks: true });
          renderTaskTable(tasks);
        } catch (e: any) {
          console.error(`${c.red}✗${c.reset} ${e.message}`);
          process.exit(1);
        }
        return;
      }

      const token = await requireAuth();
      const api = new AstarAPI(token);

      try {
        const createPayload: any = {
          title,
          description: opts.description,
          priority: opts.priority,
          assigned_to: opts.assign,
          due_date: opts.due,
          tags: opts.tag ? [opts.tag] : undefined,
          parent_task_number: opts.parent ? parseNum(opts.parent) : undefined,
          estimated_hours: opts.estimate ? parseFloat(opts.estimate) : undefined,
          recurring: opts.recurring ? { interval: opts.recurring } : undefined,
          event: opts.event || undefined,
          project: opts.project || undefined,
          links: opts.skill ? [{ type: "skill", ref: opts.skill }] : undefined,
        };
        const result = await api.createTask(createPayload);
        const dueStr = opts.due ? ` ${c.dim}(due ${fmtDate(opts.due)})${c.reset}` : "";
        const assignStr = opts.assign ? ` → ${c.dim}${opts.assign}${c.reset}` : "";
        const eventStr = opts.event ? ` ${c.dim}@${opts.event}${c.reset}` : "";
        const projectStr = opts.project ? ` ${c.dim}#${opts.project}${c.reset}` : "";
        console.log(`${c.green}✓${c.reset} Task ${c.cyan}#${result.task_number}${c.reset} created${assignStr}${dueStr}${eventStr}${projectStr}`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  todo
    .command("done <number>")
    .description("Mark a task as completed")
    .action(async (num: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        await api.updateTask(parseNum(num), { status: "completed" });
        console.log(`${c.green}✓${c.reset} Task ${c.cyan}#${parseNum(num)}${c.reset} completed`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  todo
    .command("info <number>")
    .description("Show task details and activity log")
    .action(async (num: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const { task: t, activity, subtasks, links } = await api.getTask(parseNum(num));

        console.log("");
        console.log(`  ${c.bold}${c.cyan}#${t.task_number}${c.reset} ${c.bold}${t.title}${c.reset}`);
        console.log(`  ${statusColors[t.status]}${t.status}${c.reset} · ${priorityColors[t.priority]}${t.priority}${c.reset}`);
        if (t.description) console.log(`  ${c.dim}${t.description}${c.reset}`);
        console.log(`  ${c.dim}Created by${c.reset} ${t.created_by.split("@")[0]} · ${c.dim}Assigned to${c.reset} ${t.assigned_to?.split("@")[0] || "unassigned"}`);
        if (t.due_date) console.log(`  ${c.dim}Due${c.reset} ${fmtDate(t.due_date)}`);
        if (t.event?.slug) console.log(`  ${c.dim}Event${c.reset} ${t.event.slug} · ${t.event.title}`);
        if (t.project?.slug) console.log(`  ${c.dim}Project${c.reset} ${t.project.slug} · ${t.project.name}`);
        if (t.estimated_hours) console.log(`  ${c.dim}Estimate${c.reset} ${t.estimated_hours}h`);
        if (t.recurring) console.log(`  ${c.dim}Recurring${c.reset} ${t.recurring.interval}`);
        if (t.tags?.length) console.log(`  ${c.dim}Tags${c.reset} ${t.tags.join(", ")}`);

        if (subtasks.length) {
          const done = subtasks.filter((s) => s.status === "completed").length;
          console.log("");
          console.log(`  ${c.bold}${c.white}Subtasks${c.reset} ${c.dim}(${done}/${subtasks.length} done)${c.reset}`);
          for (const s of subtasks) {
            const icon = s.status === "completed" ? `${c.green}✓${c.reset}` : ` `;
            console.log(`  ${icon} ${c.cyan}#${s.task_number}${c.reset} ${s.title}`);
          }
        }

        if (links.length) {
          console.log("");
          console.log(`  ${c.bold}${c.white}Links${c.reset}`);
          for (const l of links) {
            console.log(`  ${c.dim}${l.link_type}${c.reset}  ${l.link_ref}`);
          }
        }

        if (activity.length) {
          console.log("");
          console.log(`  ${c.bold}${c.white}Activity${c.reset}`);
          for (const a of activity) {
            const actor = (a.actor_email || a.actor || "").split("@")[0] || "system";
            const ts = a.timestamp || a.created_at;
            const detail = a.action === "commented" ? `: ${a.state_after?.comment || a.details?.comment || ""}` : "";
            const reason = a.context?.reason ? ` ${c.dim}— ${a.context.reason}${c.reset}` : "";
            console.log(`  ${c.dim}${fmtDate(ts)}${c.reset} ${actor} ${c.dim}${a.action}${detail}${c.reset}${reason}`);
          }
        }
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  todo
    .command("assign <number> <email>")
    .description("Reassign a task")
    .action(async (num: string, email: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        await api.updateTask(parseNum(num), { assigned_to: email });
        console.log(`${c.green}✓${c.reset} Task #${parseNum(num)} assigned to ${c.cyan}${email}${c.reset}`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  todo
    .command("mine")
    .description("List your open tasks")
    .option("--event <slug>", "Filter to a single event")
    .option("--project <slug>", "Filter to a single project")
    .option("--monitor", "Live-updating view of your tasks")
    .action(async (opts) => {
      if (opts.monitor) {
        const authStatus = await getAuthStatus();
        const myEmail = authStatus?.email;
        async function freshApi(): Promise<AstarAPI> {
          const token = await getToken();
          return new AstarAPI(token);
        }
        async function tick() {
          try { const api = await freshApi(); await renderMonitor(api, { mineOnly: true, myEmail, event: opts.event, project: opts.project }); } catch { /* token dead, renderMonitor handles display */ }
        }
        await tick();
        const interval = setInterval(tick, 10000);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(true);
          process.stdin.resume();
          process.stdin.on("data", (key: Buffer) => {
            if (key[0] === 0x03) { clearInterval(interval); process.stdin.setRawMode(false); console.log(""); process.exit(0); }
            if (key[0] === 0x0f) { monitorExpanded = !monitorExpanded; tick(); }
          });
        } else {
          process.on("SIGINT", () => { clearInterval(interval); console.log(""); process.exit(0); });
        }
        await new Promise(() => {});
        return;
      }
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const tasks = await api.listTasks({ status: "open", event: opts.event, project: opts.project, include_subtasks: true });
        renderTaskTable(tasks);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  todo
    .command("team")
    .description("All tasks grouped by assignee")
    .option("--event <slug>", "Filter to a single event")
    .option("--project <slug>", "Filter to a single project")
    .action(async (opts: { event?: string; project?: string }) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const tasks = await api.listTasks({ assigned_to: "all", event: opts.event, project: opts.project, include_subtasks: true });
        if (!tasks.length) {
          console.log(`${c.dim}No tasks found.${c.reset}`);
          return;
        }
        const grouped: Record<string, Task[]> = {};
        for (const t of tasks) {
          const key = t.assigned_to?.split("@")[0] || "unassigned";
          (grouped[key] ||= []).push(t);
        }
        for (const [assignee, items] of Object.entries(grouped)) {
          console.log(`\n  ${c.bold}${c.white}${assignee}${c.reset}`);
          renderTaskTable(items);
        }
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  todo
    .command("list")
    .description("List tasks with filters")
    .option("--status <status>", "Filter: open, in_progress, completed, blocked, cancelled")
    .option("--prio <priority>", "Filter: low, medium, high, critical")
    .option("--due <due>", "Filter: today, overdue, week")
    .option("--search <text>", "Search title/description")
    .option("--event <slug>", "Filter to a single event")
    .option("--project <slug>", "Filter to a single project")
    .action(async (opts) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const tasks = await api.listTasks({ status: opts.status, priority: opts.prio, due: opts.due, search: opts.search, event: opts.event, project: opts.project, assigned_to: "all", include_subtasks: true });
        renderTaskTable(tasks);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  todo
    .command("triage")
    .description("Review agent-created tasks")
    .action(async () => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const tasks = await api.triageTasks();
        if (!tasks.length) {
          console.log(`${c.dim}No tasks need triage.${c.reset}`);
          return;
        }
        console.log("");
        table(
          ["#", "Source", "Confidence", "Title"],
          tasks.map((t) => [
            `${c.cyan}${t.task_number}${c.reset}`,
            `${c.dim}${t.source}${c.reset}`,
            t.confidence ? `${c.yellow}${(t.confidence * 100).toFixed(0)}%${c.reset}` : `${c.dim}—${c.reset}`,
            truncate(t.title, 40),
          ])
        );
        console.log("");
        console.log(`  ${c.dim}Accept:${c.reset} ${c.cyan}astar todo accept <#>${c.reset}`);
        console.log(`  ${c.dim}Dismiss:${c.reset} ${c.cyan}astar todo dismiss <#>${c.reset}`);
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  todo
    .command("accept <number>")
    .description("Accept an agent task into the main list")
    .action(async (num: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        await api.triageAction(parseNum(num), "accept");
        console.log(`${c.green}✓${c.reset} Task #${parseNum(num)} accepted`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  todo
    .command("dismiss <number>")
    .description("Dismiss an agent task")
    .option("-r, --reason <reason>", "Reason for dismissal")
    .action(async (num: string, opts: { reason?: string }) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        await api.triageAction(parseNum(num), "dismiss", opts.reason);
        console.log(`${c.green}✓${c.reset} Task #${parseNum(num)} dismissed`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  todo
    .command("link <number>")
    .description("Link a task to a skill, URL, or other entity")
    .option("--skill <slug>", "Link to a skill")
    .option("--url <url>", "Link to a URL")
    .option("--news <slug>", "Link to a news post")
    .option("--feedback <id>", "Link to feedback")
    .action(async (num: string, opts: { skill?: string; url?: string; news?: string; feedback?: string }) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        if (opts.skill) await api.linkTask(parseNum(num), "skill", opts.skill);
        else if (opts.url) await api.linkTask(parseNum(num), "url", opts.url);
        else if (opts.news) await api.linkTask(parseNum(num), "news", opts.news);
        else if (opts.feedback) await api.linkTask(parseNum(num), "feedback", opts.feedback);
        else {
          console.error(`${c.red}✗${c.reset} Specify --skill, --url, --news, or --feedback`);
          process.exit(1);
        }
        console.log(`${c.green}✓${c.reset} Link added to task #${parseNum(num)}`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  todo
    .command("velocity")
    .description("Task completion stats")
    .option("--month", "Show monthly stats instead of weekly")
    .action(async (opts: { month?: boolean }) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      const period = opts.month ? "month" : "week";
      try {
        const stats = await api.getVelocity(period);
        console.log("");
        console.log(`  ${c.bold}${c.white}Velocity${c.reset} ${c.dim}(${period})${c.reset}`);
        console.log("");
        console.log(`  ${c.green}${stats.completed}${c.reset} completed · ${c.cyan}${stats.created}${c.reset} created · ${c.dim}avg ${stats.avg_days_to_close} days to close${c.reset}`);
        console.log(`  ${c.white}${stats.backlog}${c.reset} backlog ${stats.overdue > 0 ? `${c.red}(${stats.overdue} overdue)${c.reset}` : `${c.dim}(0 overdue)${c.reset}`}`);
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  todo
    .command("next")
    .description("Suggest what to work on next")
    .action(async () => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const suggestions = await api.suggestNextTask();
        if (!suggestions.length) {
          console.log(`${c.dim}No open tasks. You're clear!${c.reset}`);
          return;
        }

        console.log("");
        const top = suggestions[0];
        console.log(`  ${c.bold}${c.white}Suggested next:${c.reset}`);
        console.log("");
        console.log(`  ${c.cyan}#${top.task.task_number}${c.reset}  ${c.bold}${top.task.title}${c.reset}`);
        console.log(`  ${c.dim}${top.reasons.join(" · ")}${c.reset} ${c.dim}(score: ${top.score})${c.reset}`);

        if (suggestions.length > 1) {
          console.log("");
          console.log(`  ${c.dim}Also consider:${c.reset}`);
          for (const s of suggestions.slice(1)) {
            console.log(`  ${c.cyan}#${s.task.task_number}${c.reset}  ${s.task.title} ${c.dim}(${s.reasons.join(", ")})${c.reset}`);
          }
        }
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });
}
