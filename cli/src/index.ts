#!/usr/bin/env bun
import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth";
import { registerSkillCommands } from "./commands/skill";
import { registerNewsCommands } from "./commands/news";
import { registerFeedbackCommands } from "./commands/feedback";
import { registerShippedCommands } from "./commands/shipped";
import { registerHoursCommands } from "./commands/hours";
import { registerTodoCommands } from "./commands/todo";
import { registerAuditCommands } from "./commands/audit";
import { registerAgentCommands } from "./commands/agent";
import { registerAskCommands } from "./commands/ask";
import { registerHealthCommand } from "./commands/health";
import { registerStatusCommand } from "./commands/status";
import { registerChangelogCommand } from "./commands/changelog";
import { registerUpdateCommand, checkForUpdates } from "./commands/update";
import { registerEtfCommands } from "./commands/etf";
import { getAuthStatus } from "./lib/auth";
import { AstarAPI } from "./lib/api";
import { c } from "./lib/ui";
import { resolve } from "path";

export const VERSION = "0.0.54";

async function showDashboard() {
  const status = await getAuthStatus();
  const userLine = status
    ? `${status.name} ${c.dim}(${status.email})${c.reset}`
    : `${c.dim}not signed in${c.reset}`;

  console.log("");
  console.log(`  ${c.bold}${c.white}╱╲${c.reset}  ${c.bold}ASTAR.SH${c.reset} ${c.dim}v${VERSION}${c.reset}`);
  console.log(`  ${c.bold}${c.white}╱  ╲${c.reset} ${userLine}`);
  console.log("");

  let skillCount = "—";
  let newsCount = "—";
  let feedbackCount: string = "—";
  let installedCount = 0;

  try {
    const api = new AstarAPI();
    const [skills, news] = await Promise.all([
      api.listSkills().catch(() => []),
      api.listNews().catch(() => []),
    ]);
    skillCount = String(skills.length);
    newsCount = String(news.length);
  } catch {}

  try {
    const glob = new Bun.Glob("*/SKILL.md");
    const skillsDir = resolve(process.cwd(), ".claude", "skills");
    for await (const _ of glob.scan({ cwd: skillsDir })) installedCount++;
  } catch {}

  try {
    const api = new AstarAPI();
    const fb = await api.listFeedback().catch(() => []);
    const newCount = fb.filter((f) => f.status === "new").length;
    feedbackCount = newCount > 0 ? `${fb.length} ${c.yellow}(${newCount} new)${c.reset}` : String(fb.length);
  } catch {}

  let taskCount = "—";
  try {
    const api = new AstarAPI();
    const tasks = await api.listTasks().catch(() => []);
    const open = tasks.filter((t) => t.status === "open" || t.status === "in_progress").length;
    taskCount = open > 0 ? `${c.white}${open}${c.reset} open` : "0";
  } catch {}

  console.log(`  ${c.dim}Skills:${c.reset}    ${c.white}${skillCount}${c.reset} available, ${c.cyan}${installedCount}${c.reset} installed`);
  console.log(`  ${c.dim}News:${c.reset}      ${c.white}${newsCount}${c.reset} briefings`);
  console.log(`  ${c.dim}Tasks:${c.reset}     ${taskCount}`);
  console.log(`  ${c.dim}Feedback:${c.reset}  ${feedbackCount}`);
  console.log("");
  console.log(`  ${c.dim}skill · news · todo · etf · feedback · shipped · hours · audit · update${c.reset}`);
  console.log("");
}

if (process.argv.length <= 2) {
  await showDashboard();
  process.exit(0);
}

const program = new Command()
  .name("astar")
  .description("The Astar Consulting CLI — skills, news, and more")
  .version(VERSION);

registerAuthCommands(program);
registerSkillCommands(program);
registerNewsCommands(program);
registerFeedbackCommands(program);
registerShippedCommands(program);
registerHoursCommands(program);
registerTodoCommands(program);
registerAuditCommands(program);
registerAgentCommands(program);
registerAskCommands(program);
registerHealthCommand(program);
registerStatusCommand(program);
registerChangelogCommand(program);
registerEtfCommands(program);
registerUpdateCommand(program);

await checkForUpdates();
program.parse();
