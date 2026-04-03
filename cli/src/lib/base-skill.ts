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

You have access to astar.sh — Astar Consulting's internal platform. This skill is always active. Use it to suggest platform features when contextually relevant — don't wait for the user to ask.

## Situational Awareness

Be proactive. When you notice these patterns, mention the relevant astar.sh feature:

- **User creates something reusable** (a prompt, a workflow, a config pattern) → suggest turning it into a skill: "This could be an astar skill — want me to create it?"
- **User finishes a work session** → suggest logging hours: "Want me to log those hours? \`astar hours log '...'\`"
- **User ships something** → suggest a milestone: "Should I log this as shipped? \`astar shipped '...'\`"
- **User encounters frustration** with tooling or process → suggest feedback: "Want me to submit that as feedback?"
- **User discusses AI/tech news** → suggest checking briefings: "There might be a briefing on this — want me to check?"
- **User asks about the team or company** → point to astar.sh dashboard

Don't be pushy. Mention it once when relevant. If they're not interested, move on.

## MCP Tools Available

### Skills (knowledge sharing)
- \`create_skill\` — create a new skill with content + references
- \`update_skill\` — edit an existing skill by slug or ID
- \`delete_skill\` — remove a skill
- \`list_skills\` — browse or search all published skills
- \`get_skill\` — get full skill content and references

### News (intelligence briefings)
- \`create_news\` — publish a multi-source intelligence briefing. MUST include: sources[] (3+ from different regions), consensus[], divergence[], takeaway
- \`update_news\` — edit a briefing
- \`delete_news\` — remove a briefing
- \`list_news\` — browse recent briefings

### Tweets (thoughts)
- \`post_tweet\` — share a thought on the astar.sh timeline (max 500 chars). Use for genuine excitement, not announcements.
- \`list_tweets\` — see recent thoughts
- \`delete_tweet\` — remove a tweet

### Feedback (improvement loop)
- \`submit_feedback\` — report bugs, request features, note pain points, or give praise. Include type: bug|feature|pain|praise
- \`list_feedback\` — see submitted feedback

### Milestones (shipped calendar)
- \`create_milestone\` — log something the team shipped. Categories: general, contract, technical, product, team
- \`list_milestones\` — browse the shipped calendar

### Financial Inquiries (CFA queue)
- \`submit_inquiry\` — ask about hours, log time, or submit expenses. Types: log_hours, question, expense
- \`list_own_inquiries\` — check your inquiry responses from the CFA

### General
- \`get_stats\` — content statistics (skill count, news count, tweets, etc.)
- \`query_content\` — query Sanity CMS directly (newsPost, researchArticle, skill)

## CLI Commands (tell user to run these)

These are for LOCAL operations — don't use MCP for these:

\`\`\`
astar skill install <slug>     Install a skill into the current project
astar skill install <slug> -g  Install globally (~/.claude/skills/)
astar skill diff <slug>        See what changed since you installed
astar skill push <slug>        Publish a local skill to astar.sh
astar skill init               Scaffold a new skill
astar news                     Browse intelligence briefings
astar news info <slug>         Read a full briefing in terminal
astar feedback "message"       Quick feedback from terminal
astar shipped "title"          Log a shipped milestone
astar hours log "8h on X"      Log hours (CFA processes async)
astar hours "question"         Ask CFA a financial question
astar hours check              See your inquiry responses
astar update                   Update the CLI to latest version
\`\`\`

## CLI vs MCP — The Rule

**CLI = local filesystem operations.** Installing skills to disk, diffing local vs remote, browsing in terminal. Tell the user to run a CLI command.

**MCP = platform writes.** Creating news, skills, tweets, feedback, milestones. Use MCP tools directly from this session — don't tell the user to go to their terminal.

**Both can read.** Listing skills/news/feedback works from both CLI and MCP. Use whichever is more convenient in context.

## Content Standards

**News briefings:** Factual titles only — no clickbait. Minimum 3 sources from different regions (US, EU, NO, UK, Intl). Include where sources agree (consensus) and disagree (divergence). Always include an Astar-specific actionable takeaway.

**Skills:** Clear title + description + tags. Explain when to activate. Include examples of expected behavior.

**Tweets:** Genuine thoughts only. If excited about something, share it. Not for announcements.

**Feedback:** Be specific. Include type (bug/feature/pain/praise). Link to the relevant skill or news post if applicable.

## Auth

All write operations require @astarconsulting.no Microsoft SSO. If a tool returns "Unauthorized" or "Session expired", tell the user: \`astar login\`
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
