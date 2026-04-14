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

function showGuide() {
  const d = c.dim;
  const w = c.white;
  const cy = c.cyan;
  const y = c.yellow;
  const r = c.reset;
  const b = c.bold;
  const m = c.magenta;

  console.log(`
  ${b}${w}ASTAR PROJECTS — GUIDE${r}

  Projects are first-class workstream primitives. Tasks, events, agents,
  and milestones attach to a project via project_id. All listing commands
  support ${cy}--project <slug>${r} to scope results to a single workstream.

  ${b}${w}DATA MODEL${r}

    ${b}projects${r} table
      ${cy}id${r}            uuid          Primary key
      ${cy}slug${r}          text          Unique, URL-safe identifier (e.g. ${d}my-project${r})
      ${cy}name${r}          text          Display name (required)
      ${cy}description${r}   text          Optional
      ${cy}visibility${r}    text          private | team | public
      ${cy}owner${r}         text          Email of creator (can be reassigned)
      ${cy}members${r}       jsonb         Array of staff emails (normalized lowercase)
      ${cy}created_at${r}    timestamptz
      ${cy}updated_at${r}    timestamptz

  ${b}${w}VISIBILITY & ACCESS CONTROL${r}

    ${cy}public${r}   Any authenticated ${d}@astarconsulting.no${r} staff member
    ${cy}team${r}     Owner + emails listed in the members array
    ${cy}private${r}  Owner only

    Project access gates cascade to attached entities:
    A task in a private project is only visible to the project owner,
    unless the user is the task's creator or assignee — task-level
    ownership overrides the project gate.

    When in doubt: if you can't see a task, check whether it lives in
    a private project you're not a member of.

  ${b}${w}CREATING A PROJECT${r}

    ${cy}astar projects "My Project"${r}                  creates with team visibility
    ${cy}astar projects "My Project" --visibility private${r}
    ${cy}astar projects "My Project" --slug my-proj --member bob@astarconsulting.no${r}

    Slug is auto-derived from name if not provided (lowercase, hyphens).
    Duplicate slugs are rejected — pick a unique slug.

  ${b}${w}OPERATIONS${r}

    ${cy}astar projects${r}                list all accessible projects
    ${cy}astar projects list${r}           same as above
    ${cy}astar projects info <slug>${r}    project details + tasks, events, agents, milestones
    ${cy}astar projects update <slug>${r}  patch name, slug, description, visibility, members, owner
    ${cy}astar projects delete <slug>${r}  delete project — unlinks all attached work (irreversible)

    ${y}Note:${r} delete only unlinks — it does NOT delete the attached tasks/events/agents.
    Those entities remain but lose their project association.

  ${b}${w}ATTACHING WORK TO A PROJECT${r}

    Tasks:     ${cy}astar todo "Title" --project <slug>${r}
               ${cy}update_task${r} with ${cy}project${r} field (MCP)
    Events:    set ${cy}project${r} field on event create/update
    Agents:    set ${cy}project_id${r} when registering an agent
    Milestones: milestones include a ${cy}project_id${r} foreign key

    To detach a task from its project: ${cy}update_task${r} with ${cy}project=""${r}

  ${b}${w}FILTERING BY PROJECT${r}

    ${cy}--project <slug>${r} works on:
      ${cy}astar todo --project <slug>${r}         tasks in this project
      ${cy}astar events --project <slug>${r}       events in this project
      ${cy}astar shipped list --project <slug>${r} milestones in this project
      ${cy}astar agent list --project <slug>${r}   agents assigned to this project

  ${b}${w}MCP TOOLS (for agents)${r}

    ${m}create_project${r}   Create a new project (name, slug, visibility, members, owner)
    ${m}list_projects${r}    List all accessible projects
    ${m}get_project${r}      Full project detail with attached tasks, events, agents, milestones
    ${m}update_project${r}   Patch project fields (owner-only for visibility/members changes)

    No delete tool via MCP — use CLI for destructive operations.

  ${b}${w}RELATIONSHIPS TO OTHER SUBSYSTEMS${r}

    ${cy}projects → tasks${r}       tasks.project_id — scopes tasks to a workstream
    ${cy}projects → events${r}      events.project_id — groups meetings/milestones by project
    ${cy}projects → agents${r}      agents.project_id — associates an agent with a project
    ${cy}projects → milestones${r}  milestones.project_id — tracks shipped work per project
    ${cy}projects → audit${r}       project CRUD is logged; project_id surfaces in task audit events

  ${b}${w}GOTCHAS${r}

    ${y}Slug is the stable identifier.${r} Use slug (not UUID) for all CLI and MCP calls.
    If you update the slug, all existing ${cy}--project${r} filter references break.

    ${y}Members are not deduplicated automatically.${r} Passing ${cy}--member${r} on update
    replaces the entire members array. To add one member, re-pass all existing ones.

    ${y}Private projects are invisible to non-members.${r} If ${cy}list_projects${r} returns
    an empty list, you may not have access — ask the owner to add you as a member.

    ${y}Delete is unlink, not cascade-delete.${r} Deleting a project does not delete its
    tasks or events — they persist, detached. Archive them separately if needed.

    ${y}Overtime and projects:${r} Overtime runs can be scoped to a project by setting the
    project slug in the spec's context. This links the generated tasks automatically.

  ${b}${w}SEE ALSO${r}

    ${cy}astar guide${r}           full system ontology
    ${cy}astar todo guide${r}      task system — subtasks, triage, MCP tools
    ${cy}astar events guide${r}    event system — types, lifecycle, task linkage
    ${cy}astar audit guide${r}     audit trail — querying mutations
  `);
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

  projects
    .command("guide")
    .description("Project system documentation — data model, visibility, relationships, MCP tools")
    .action(showGuide);
}
