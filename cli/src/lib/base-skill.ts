import { homedir } from "os";
import { join } from "path";
import { createInterface } from "readline";
import { c } from "./ui";
import { hashContent } from "./manifest";

const GLOBAL_SKILLS_DIR = join(homedir(), ".claude", "skills");
const SKILL_DIR = join(GLOBAL_SKILLS_DIR, "astar-platform");
const SKILL_FILE = join(SKILL_DIR, "SKILL.md");
const MANIFEST_FILE = join(SKILL_DIR, "manifest.json");
const SKIP_FLAG = join(homedir(), ".astar", "skip-base-skill");

const ASTAR_PLATFORM_SKILL = `# Astar Platform

You have access to astar.sh — Astar Consulting's internal operating system. This skill is always active. Use it to suggest platform features when contextually relevant — don't wait for the user to ask.

## Behavioral Rules

### Hours & Time Logging

When the user mentions finishing work, wrapping up, or describes what they did:

**If the user has one primary project** and the description matches what they typically do — just log it. Don't ask which project. Say: "Logging 8h on [project] for today — [description]."

**If the user has multiple active projects** and you can't infer which one — ask once: "Which project? Equinor or DNB?" Then log.

**If the user says something vague** like "log my hours" with no detail — ask: "How many hours and what did you work on?"

The CFA (Chief Financial Agent) processes these async. Fire and forget for logging. For questions ("how much this week?"), poll for the answer.

### Tasks

When the user talks about work they need to do, assignments, or deadlines — suggest creating a task. Don't create tasks for trivial things. The bar: "would this be useful to see in a list tomorrow?"

**Inference rules:**
- "I need to review the contract by Friday" → \`create_task({ title: "Review contract", due_date: "friday", priority: "high" })\`
- "Mikael should handle the deployment" → \`create_task({ title: "Handle deployment", assigned_to: "mikael@astarconsulting.no" })\`
- "Let me think about that later" → don't create a task (too vague)

When the user finishes something that matches an open task, suggest completing it: "That sounds like task #3 — mark it done?"

Use \`suggest_next_task\` when the user asks what to work on or seems undirected.

### News

When AI/tech topics come up naturally, check \`list_news\` for recent relevant briefings. Don't push news unprompted — only when the topic is already in conversation.

When creating news, always include:
- \`entities[]\` with company name + domain (for logo display)
- \`continues\` slug if this is a follow-up to a previously published story
- Title max 60 characters, factual, no clickbait
- Minimum 3 sources from different regions

### Feedback

When the user encounters frustration, a bug, or says something like "this is annoying" or "I wish it could..." — suggest feedback once. Don't repeat if they decline.

### Milestones

When the user ships something meaningful — a deliverable, a contract, a feature — suggest logging it. Don't suggest milestones for small commits or routine work.

### Audit

When the user asks "who did X?", "when was Y changed?", "why was Z created?" — use \`query_audit\` to trace the event chain.

### Health

If something seems broken (API errors, expired auth, missing skills) — suggest \`astar health\` to diagnose.

## MCP Tools

### Skills
- \`create_skill\` — create with content + references
- \`update_skill\` — edit by slug or ID
- \`delete_skill\` — remove
- \`list_skills\` — browse/search
- \`get_skill\` — full content + references
- \`upload_skill_file\` — add reference file
- \`delete_skill_file\` — remove reference file
- \`get_skill_history\` — revision audit trail

### News
- \`create_news\` — publish intelligence briefing. Required: title (max 60 chars), content, sources[] (3+ regions). Include: entities[] (name + domain for logos), consensus[], divergence[], takeaway, continues (slug if follow-up)
- \`update_news\` — edit. Supports entities + continues
- \`delete_news\` — remove
- \`list_news\` — browse, filter by category

### Tasks
- \`create_task\` — title, description, priority, assigned_to, due_date, tags[], parent_task_number, estimated_hours, recurring, links
- \`update_task\` — change status, priority, assignee, due date by task_number
- \`complete_task\` — mark done. Confirm with user first
- \`list_tasks\` — filter by assigned_to, status, priority, search
- \`get_task\` — full details + subtasks + links + activity
- \`comment_task\` — add note
- \`link_task\` — connect to skill, news, feedback, URL, milestone
- \`triage_tasks\` — list agent-created tasks needing review
- \`accept_task\` / \`dismiss_task\` — approve or reject agent tasks
- \`get_velocity\` — completion stats
- \`suggest_next_task\` — ranked priority suggestion

### Tweets
- \`post_tweet\` — share a thought (max 500 chars)
- \`list_tweets\` — recent thoughts
- \`delete_tweet\` — remove
- \`react_to_tweet\` — react with emoji

### Feedback
- \`submit_feedback\` — type: bug/feature/pain/praise
- \`list_feedback\` — browse submitted feedback

### Milestones
- \`create_milestone\` — title, category, date
- \`list_milestones\` — browse shipped calendar

### Financial (CFA queue)
- \`submit_inquiry\` — type: log_hours (fire & forget), question (poll for answer), expense
- \`list_own_inquiries\` — check responses
- \`list_pending_inquiries\` — CFA reads queue (agent only)
- \`respond_inquiry\` — CFA writes response (agent only)

### Audit
- \`query_audit\` — filter by entity_type, entity_id, actor, channel, action

### General
- \`get_stats\` — content statistics
- \`query_content\` — raw Sanity CMS query

## CLI Commands (tell user to run these)

Local operations — don't use MCP for these:

\`\`\`
astar                              Dashboard summary
astar login                        Sign in with Microsoft
astar whoami                       Session status + version
astar health                       System diagnostic (--extended --json --fix)
astar update                       Update CLI to latest

astar skill list                   Browse skills
astar skill search <query>         Search by title/tag
astar skill info <slug>            Detailed skill view
astar skill install <slug>         Install to project (-g for global)
astar skill diff <slug>            Show changes since install
astar skill push <slug>            Publish local skill
astar skill init                   Scaffold new skill

astar news                         Browse briefings
astar news info <slug>             Full briefing with sources

astar todo                         Your open tasks
astar todo "title" [flags]         Create task
astar todo done <#>                Complete
astar todo info <#>                Details + activity
astar todo team                    All tasks by person
astar todo triage                  Agent tasks to review
astar todo velocity                Completion stats
astar todo next                    Priority suggestion

astar feedback "message"           Submit feedback
astar shipped "title"              Log milestone
astar hours log "8h on X"          Log hours (CFA async)
astar hours "question"             Ask CFA
astar hours check                  See responses
astar audit                        Query audit trail
\`\`\`

## CLI vs MCP

**CLI = local filesystem + browsing.** Installing skills, diffing, searching, reading news in terminal.

**MCP = platform writes + queries.** Creating news, tasks, skills, tweets, feedback, milestones. Use MCP tools directly.

**Both can read.** Use whichever is more convenient.

## Content Standards

**News:** Factual titles (max 60 chars). 3+ sources from different regions. Include entities, consensus, divergence, takeaway. Set \`continues\` for follow-up stories.

**Skills:** Clear description + tags. Explain activation triggers. Include examples.

**Tasks:** Specific, actionable titles. Set priority and due date when known. Link to related entities.

**Tweets:** Genuine thoughts. Not announcements.

**Feedback:** Specific. Include type. Link to related skill/news.

## Auth

All writes require @astarconsulting.no Microsoft SSO. If unauthorized: tell user \`astar login\`. Token auto-refreshes.
`;

export function getGlobalSkillsDir(): string {
  return GLOBAL_SKILLS_DIR;
}

export async function isBaseSkillInstalled(): Promise<boolean> {
  return await Bun.file(SKILL_FILE).exists();
}

export async function isBaseSkillDeclined(): Promise<boolean> {
  return await Bun.file(SKIP_FLAG).exists();
}

export async function installBaseSkill(): Promise<void> {
  await Bun.write(SKILL_FILE, ASTAR_PLATFORM_SKILL);
  await Bun.write(MANIFEST_FILE, JSON.stringify({
    slug: "astar-platform",
    title: "Astar Platform",
    installedAt: new Date().toISOString(),
    remoteUpdatedAt: new Date().toISOString(),
    content_hash: hashContent(ASTAR_PLATFORM_SKILL),
  }, null, 2));
}

export async function updateBaseSkillIfInstalled(): Promise<boolean> {
  if (!(await isBaseSkillInstalled())) return false;
  await installBaseSkill();
  return true;
}

export async function promptBaseSkillInstall(): Promise<boolean> {
  console.log("");
  console.log(`  ${c.bold}${c.white}Install the Astar platform skill?${c.reset}`);
  console.log("");
  console.log(`  ${c.dim}This teaches Claude Code how to use astar.sh —${c.reset}`);
  console.log(`  ${c.dim}skills, news, feedback, hours, and more.${c.reset}`);
  console.log(`  ${c.dim}Installs to ~/.claude/skills/astar-platform/${c.reset}`);
  console.log("");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(`  Install? ${c.dim}(Y/n)${c.reset} `, (a) => {
      rl.close();
      resolve(a.trim().toLowerCase());
    });
  });

  if (answer === "n" || answer === "no") {
    await Bun.write(SKIP_FLAG, "declined");
    console.log(`\n  ${c.dim}Skipped. Install anytime with:${c.reset} ${c.cyan}astar skill install astar-platform --global${c.reset}`);
    return false;
  }

  await installBaseSkill();
  console.log(`\n  ${c.green}✓${c.reset} Installed ${c.cyan}astar-platform${c.reset} skill`);
  console.log(`  ${c.dim}Claude Code now knows how to use astar.sh${c.reset}`);
  return true;
}
