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
  console.log("");
  table(
    ["#", "Title", "Status", "Priority", "Assigned", "Due"],
    tasks.map((t) => [
      `${c.cyan}${t.task_number}${c.reset}`,
      truncate(t.title, 35),
      `${statusColors[t.status] || c.dim}${t.status}${c.reset}`,
      `${priorityColors[t.priority] || c.dim}${t.priority}${c.reset}`,
      `${c.dim}${t.assigned_to?.split("@")[0] || "—"}${c.reset}`,
      t.due_date ? `${c.dim}${fmtDate(t.due_date)}${c.reset}` : `${c.dim}—${c.reset}`,
    ])
  );
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

async function renderMonitor(api: AstarAPI) {
  const [openTasks, completedTasks] = await Promise.all([
    api.listTasks({ assigned_to: "all" }).catch(() => []),
    api.listTasks({ assigned_to: "all", status: "completed" }).catch(() => []),
  ]);

  const status = await getAuthStatus();
  const name = status?.name || "Unknown";
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

  console.log("");
  console.log(`  ${c.bold}TASKS${c.reset}${" ".repeat(50)}${c.dim}${time}${c.reset}`);
  console.log("");

  for (const t of sorted) {
    const bar = priorityBars[t.priority] || "░";
    const pColor = priorityColors[t.priority] || c.dim;
    const due = t.due_date ? fmtDate(t.due_date) : "—";
    const assignee = t.assigned_to?.split("@")[0] || "—";
    const overdue = t.due_date && t.due_date < todayStr;

    console.log(`  ${pColor}${bar}${c.reset} ${c.cyan}#${t.task_number}${c.reset}   ${t.title.slice(0, 38)}${" ".repeat(Math.max(1, 40 - t.title.length))}${pColor}${t.priority}${c.reset}  ${overdue ? c.red : c.dim}${due}${c.reset}  ${c.dim}${assignee}${c.reset}`);
  }

  if (doneToday.length) {
    console.log("");
    console.log(`  ${c.dim}─${c.reset}`);
    for (const t of doneToday) {
      const time = t.completed_at ? new Date(t.completed_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "";
      console.log(`  ${c.green}✓${c.reset} ${c.dim}#${t.task_number}${c.reset}   ${c.dim}${t.title.slice(0, 38)}${c.reset}${" ".repeat(Math.max(1, 40 - t.title.length))}${c.dim}done${c.reset}    ${c.dim}${time}${c.reset}`);
    }
  }

  console.log("");
  console.log(`  ${c.dim}${sorted.length} open · ${doneToday.length} done today${c.reset}${" ".repeat(30)}${c.dim}ctrl+c quit${c.reset}`);
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
    .option("--estimate <hours>", "Estimated hours")
    .option("--recurring <interval>", "Recurring: weekly, monthly, quarterly")
    .option("--monitor", "Live-updating task view (refreshes every 10s)")
    .action(async (title: string | undefined, opts) => {
      if (opts.monitor) {
        const token = await requireAuth();
        const api = new AstarAPI(token);
        await renderMonitor(api);
        const interval = setInterval(() => renderMonitor(api), 10000);
        process.on("SIGINT", () => { clearInterval(interval); console.log(""); process.exit(0); });
        await new Promise(() => {});
        return;
      }

      if (!title) {
        await todo.commands.find((cmd) => cmd.name() === "mine")!.parseAsync([], { from: "user" });
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
          links: opts.skill ? [{ type: "skill", ref: opts.skill }] : undefined,
        };
        const result = await api.createTask(createPayload);
        const dueStr = opts.due ? ` ${c.dim}(due ${fmtDate(opts.due)})${c.reset}` : "";
        const assignStr = opts.assign ? ` → ${c.dim}${opts.assign}${c.reset}` : "";
        console.log(`${c.green}✓${c.reset} Task ${c.cyan}#${result.task_number}${c.reset} created${assignStr}${dueStr}`);
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
            const detail = a.action === "commented" ? `: ${a.details?.comment || ""}` : "";
            console.log(`  ${c.dim}${fmtDate(a.created_at)}${c.reset} ${a.actor.split("@")[0]} ${c.dim}${a.action}${detail}${c.reset}`);
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
    .action(async () => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const tasks = await api.listTasks({ status: "open" });
        renderTaskTable(tasks);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  todo
    .command("team")
    .description("All tasks grouped by assignee")
    .action(async () => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const tasks = await api.listTasks({ assigned_to: "all" });
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
    .action(async (opts) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const tasks = await api.listTasks({ status: opts.status, priority: opts.prio, due: opts.due, search: opts.search, assigned_to: "all" });
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
