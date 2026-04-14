import type { Command } from "commander";
import { AstarAPI, type Agent, type Event, type Milestone, type OvertimeRun, type Project, type Task } from "../lib/api";
import { getToken } from "../lib/auth";
import { c, table } from "../lib/ui";

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

function renderProjectList(projects: Project[]) {
  if (!projects.length) {
    console.log(`${c.dim}No projects found.${c.reset}`);
    return;
  }

  console.log("");
  table(
    ["Slug", "Project", "Visibility", "Owner", "Members"],
    projects.map((project) => [
      `${c.cyan}${project.slug}${c.reset}`,
      truncate(project.name, 30),
      project.visibility,
      `${c.dim}${project.owner.split("@")[0]}${c.reset}`,
      project.members.length ? `${c.dim}${project.members.length}${c.reset}` : `${c.dim}—${c.reset}`,
    ])
  );
  console.log("");
  console.log(`  ${c.dim}${projects.length} project(s)${c.reset}`);
  console.log("");
}

function renderTaskRows(tasks: Task[]) {
  return tasks.map((task) => [
    `${c.cyan}${task.task_number}${c.reset}`,
    truncate(task.title, 38),
    task.status,
    task.priority,
  ]);
}

function renderEventRows(events: Event[]) {
  return events.map((event) => [
    `${c.cyan}${event.slug}${c.reset}`,
    truncate(event.title, 34),
    event.status,
    event.type,
  ]);
}

function renderAgentRows(agents: Agent[]) {
  return agents.map((agent) => [
    `${c.cyan}${agent.slug}${c.reset}`,
    truncate(agent.name, 34),
    agent.status,
    `${c.dim}${agent.owner.split("@")[0]}${c.reset}`,
  ]);
}

function renderMilestoneRows(milestones: Milestone[]) {
  return milestones.map((milestone) => [
    `${c.dim}${milestone.date}${c.reset}`,
    truncate(milestone.title, 36),
    milestone.category,
    `${c.dim}${milestone.created_by || "—"}${c.reset}`,
  ]);
}

function renderOvertimeRunRows(runs: OvertimeRun[]) {
  return runs.map((run) => [
    `${c.cyan}${run.slug}${c.reset}`,
    truncate(run.spec_title, 32),
    run.status,
    run.total_cost_usd != null ? `$${run.total_cost_usd.toFixed(2)}` : `${c.dim}—${c.reset}`,
    run.subtask_count != null ? String(run.subtask_count) : `${c.dim}—${c.reset}`,
  ]);
}

function printSection(title: string, headers: string[], rows: string[][], empty: string) {
  console.log("");
  console.log(`  ${c.bold}${c.white}${title}${c.reset}`);
  if (!rows.length) {
    console.log(`  ${c.dim}${empty}${c.reset}`);
    return;
  }
  console.log("");
  table(headers, rows);
}

export function registerProjectCommands(program: Command) {
  const projects = program
    .command("projects [name]")
    .description("Create, inspect, and scope work by project")
    .option("--slug <slug>", "Custom slug")
    .option("--description <text>", "Project description")
    .option("--visibility <visibility>", "Visibility: private, team, public", "team")
    .option("--member <email>", "Project member email (repeatable)", collect, [])
    .option("--owner <email>", "Owner email (defaults to you)")
    .action(async (name: string | undefined, opts: {
      slug?: string;
      description?: string;
      visibility: string;
      member?: string[];
      owner?: string;
    }) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);

      if (!name) {
        try {
          const items = await api.listProjects();
          renderProjectList(items);
        } catch (e: any) {
          console.error(`${c.red}✗${c.reset} ${e.message}`);
          process.exit(1);
        }
        return;
      }

      try {
        const result = await api.createProject({
          name,
          slug: opts.slug,
          description: opts.description,
          visibility: opts.visibility,
          owner: opts.owner,
          members: opts.member || [],
        });
        console.log(`${c.green}✓${c.reset} Project created ${c.cyan}${result.slug}${c.reset}`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  projects
    .command("list")
    .description("List projects")
    .action(async () => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        renderProjectList(await api.listProjects());
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  projects
    .command("info <slug>")
    .description("Show a project and its attached work")
    .action(async (slug: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const { project, tasks, events, agents, milestones, overtime_runs } = await api.getProject(slug);

        console.log("");
        console.log(`  ${c.bold}${project.name}${c.reset}`);
        console.log(`  ${c.cyan}${project.slug}${c.reset} · ${project.visibility} · ${c.dim}owner${c.reset} ${project.owner}`);
        if (project.description) console.log(`  ${c.dim}${project.description}${c.reset}`);
        if (project.members.length) console.log(`  ${c.dim}members${c.reset} ${project.members.join(", ")}`);

        printSection("Tasks", ["#", "Task", "Status", "Priority"], renderTaskRows(tasks), "No attached tasks.");
        printSection("Events", ["Slug", "Event", "Status", "Type"], renderEventRows(events), "No attached events.");
        printSection("Agents", ["Slug", "Agent", "Status", "Owner"], renderAgentRows(agents), "No attached agents.");
        printSection("Milestones", ["Date", "Milestone", "Category", "By"], renderMilestoneRows(milestones), "No attached milestones.");
        printSection("Overtime Runs", ["Slug", "Spec", "Status", "Cost", "Subtasks"], renderOvertimeRunRows(overtime_runs || []), "No linked overtime runs.");
        console.log("");
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  projects
    .command("update <slug>")
    .description("Update project metadata")
    .option("--name <name>", "New project name")
    .option("--slug <slug>", "New slug")
    .option("--description <text>", "Project description")
    .option("--visibility <visibility>", "Visibility: private, team, public")
    .option("--member <email>", "Replace members with these emails (repeatable)", collect, [])
    .option("--owner <email>", "Owner email")
    .action(async (slug: string, opts: {
      name?: string;
      slug?: string;
      description?: string;
      visibility?: string;
      member?: string[];
      owner?: string;
    }) => {
      const patch: Record<string, any> = {};
      if (opts.name) patch.name = opts.name;
      if (opts.slug) patch.slug = opts.slug;
      if (opts.description !== undefined) patch.description = opts.description;
      if (opts.visibility) patch.visibility = opts.visibility;
      if (opts.owner) patch.owner = opts.owner;
      if (opts.member && opts.member.length > 0) patch.members = opts.member;

      if (!Object.keys(patch).length) {
        console.error(`${c.red}✗${c.reset} No updates specified.`);
        process.exit(1);
      }

      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        const result = await api.updateProject(slug, patch);
        console.log(`${c.green}✓${c.reset} Project updated ${c.cyan}${result.slug}${c.reset}`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  projects
    .command("delete <slug>")
    .description("Delete a project (unlinks all attached work)")
    .action(async (slug: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      try {
        await api.deleteProject(slug);
        console.log(`${c.green}✓${c.reset} Project deleted ${c.cyan}${slug}${c.reset}`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });
}
