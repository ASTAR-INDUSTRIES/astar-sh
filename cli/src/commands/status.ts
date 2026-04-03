import { resolve } from "path";
import type { Command } from "commander";
import { AstarAPI } from "../lib/api";
import { c } from "../lib/ui";
import { getToken } from "../lib/auth";
import { VERSION } from "../index";
import { getConfig } from "../lib/config";

async function requireAuth(): Promise<string> {
  try {
    return await getToken();
  } catch {
    console.error(`${c.red}✗${c.reset} Not authenticated. Run ${c.cyan}astar login${c.reset} first.`);
    process.exit(1);
  }
}

function bar(value: number, max: number, width: number = 20): string {
  if (max === 0) return "░".repeat(width);
  const filled = Math.round((value / max) * width);
  return "█".repeat(Math.min(filled, width)) + "░".repeat(Math.max(0, width - filled));
}

function streakColor(streak: number): string {
  if (streak >= 5) return c.green;
  if (streak >= 3) return c.cyan;
  if (streak >= 1) return c.yellow;
  return c.dim;
}

export function registerStatusCommand(program: Command) {
  program
    .command("status")
    .description("Your personal dashboard — activity, tasks, streak")
    .option("--full", "Include leaderboard and breakdown")
    .option("--json", "Output as JSON")
    .action(async (opts: { full?: boolean; json?: boolean }) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);

      try {
        const data = await api.getStatus();

        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        const { user, week, streak, top_task, open_tasks, leaderboard } = data;
        const maxActions = Math.max(...week.days.map((d: any) => d.actions), 1);

        const sc = streakColor(streak);

        console.log("");
        console.log(`  ${c.dim}┌──────────────────────────────────────────────────────┐${c.reset}`);
        console.log(`  ${c.dim}│${c.reset}  ${c.bold}W${week.number}${c.reset} ${c.dim}·${c.reset} ${c.bold}${c.white}${user.name}${c.reset}${" ".repeat(Math.max(1, 34 - user.name.length - String(week.number).length))}${sc}streak: ${streak}d${c.reset}  ${c.dim}│${c.reset}`);
        console.log(`  ${c.dim}│${c.reset}${" ".repeat(54)}${c.dim}│${c.reset}`);

        for (const day of week.days) {
          const dayDate = new Date(day.date + "T00:00:00");
          const isToday = day.date === new Date().toISOString().split("T")[0];
          const isFuture = dayDate > new Date();
          const dayLabel = isToday ? `${c.bold}${c.white}${day.day}${c.reset}` : isFuture ? `${c.dim}${day.day}${c.reset}` : `${day.day}`;
          const actionBar = isFuture ? `${c.dim}${"░".repeat(20)}${c.reset}` : day.actions > 0 ? `${c.green}${bar(day.actions, maxActions)}${c.reset}` : `${c.dim}${"░".repeat(20)}${c.reset}`;
          const count = isFuture ? "" : day.actions > 0 ? `${c.dim}${day.actions}${c.reset}` : `${c.dim}—${c.reset}`;
          console.log(`  ${c.dim}│${c.reset}  ${dayLabel}  ${actionBar}  ${count}${" ".repeat(Math.max(1, 26 - String(day.actions || "—").length))}${c.dim}│${c.reset}`);
        }

        console.log(`  ${c.dim}│${c.reset}${" ".repeat(54)}${c.dim}│${c.reset}`);

        const tasksDone = week.tasks_completed;
        const tasksOpen = week.tasks_open;
        const tasksTotal = tasksDone + tasksOpen;
        const taskPct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;
        console.log(`  ${c.dim}│${c.reset}  ${c.white}Tasks${c.reset}    ${c.green}${tasksDone}${c.reset} done / ${c.cyan}${tasksOpen}${c.reset} open   ${bar(tasksDone, tasksTotal, 14)} ${c.dim}${taskPct}%${c.reset}   ${c.dim}│${c.reset}`);
        console.log(`  ${c.dim}│${c.reset}  ${c.white}News${c.reset}     ${week.news_published} published${" ".repeat(33)}${c.dim}│${c.reset}`);
        console.log(`  ${c.dim}│${c.reset}  ${c.white}Feedback${c.reset} ${week.feedback_submitted} submitted${" ".repeat(33)}${c.dim}│${c.reset}`);

        if (top_task) {
          console.log(`  ${c.dim}│${c.reset}${" ".repeat(54)}${c.dim}│${c.reset}`);
          const pColor = top_task.priority === "critical" ? c.red : top_task.priority === "high" ? c.yellow : c.dim;
          const dueStr = top_task.due_date || "no date";
          const taskStr = `#${top_task.task_number} ${top_task.title}`;
          console.log(`  ${c.dim}│${c.reset}  ${c.dim}Next:${c.reset} ${c.cyan}${taskStr.slice(0, 30)}${c.reset} ${pColor}${top_task.priority}${c.reset} ${c.dim}${dueStr}${c.reset}${" ".repeat(Math.max(1, 5))}${c.dim}│${c.reset}`);
        }

        console.log(`  ${c.dim}└──────────────────────────────────────────────────────┘${c.reset}`);

        if (opts.full && leaderboard?.length) {
          console.log("");
          console.log(`  ${c.bold}${c.white}Leaderboard${c.reset} ${c.dim}(this week)${c.reset}`);
          const lbMax = leaderboard[0]?.count || 1;
          for (let i = 0; i < leaderboard.length; i++) {
            const lb = leaderboard[i];
            const name = lb.name.length > 12 ? lb.name.slice(0, 12) : lb.name;
            const pad = " ".repeat(Math.max(1, 14 - name.length));
            console.log(`  ${c.dim}${i + 1}.${c.reset} ${i === 0 ? c.cyan : c.dim}${name}${c.reset}${pad}${bar(lb.count, lbMax, 16)} ${c.dim}${lb.count}${c.reset}`);
          }
        }

        if (opts.full) {
          const totalActions = week.days.reduce((sum: number, d: any) => sum + d.actions, 0);
          const breakdown: Record<string, number> = {};
          for (const day of week.days) {
            for (const [type, count] of Object.entries(day.breakdown || {})) {
              breakdown[type] = (breakdown[type] || 0) + (count as number);
            }
          }
          if (Object.keys(breakdown).length) {
            console.log("");
            console.log(`  ${c.bold}${c.white}Breakdown${c.reset} ${c.dim}(${totalActions} actions)${c.reset}`);
            const sorted = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
            const bMax = sorted[0]?.[1] || 1;
            for (const [type, count] of sorted) {
              const name = type.length > 10 ? type.slice(0, 10) : type;
              const pad = " ".repeat(Math.max(1, 12 - name.length));
              console.log(`  ${c.dim}${name}${c.reset}${pad}${c.green}${bar(count, bMax, 16)}${c.reset} ${c.dim}${count}${c.reset}`);
            }
          }
        }

        let installedCount = 0;
        const skillNames: string[] = [];
        try {
          const glob = new Bun.Glob("*/SKILL.md");
          const homeSkills = `${process.env.HOME}/.claude/skills`;
          for await (const path of glob.scan({ cwd: homeSkills })) {
            installedCount++;
            skillNames.push(path.replace("/SKILL.md", ""));
          }
        } catch {}

        console.log("");
        console.log(`  ${c.dim}Skills: ${skillNames.slice(0, 3).join(" · ") || "none"}${skillNames.length > 3 ? ` +${skillNames.length - 3} more` : ""}${c.reset}`);

        let cfaStatus = "?";
        try {
          const config = await getConfig();
          const res = await fetch(`${config.apiUrl}/inquiries/health`);
          if (res.ok) {
            const h = await res.json();
            cfaStatus = h.last_completed_at ? "online" : h.pending_count > 0 ? "offline" : "idle";
          }
        } catch { cfaStatus = "?"; }

        console.log(`  ${c.dim}CFA: ${cfaStatus} · v${VERSION}${c.reset}`);
        console.log("");

      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });
}
