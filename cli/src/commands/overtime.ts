import type { Command } from "commander";
import { spawn, execSync, type ChildProcess } from "child_process";
import { join, basename } from "path";
import { homedir } from "os";
import { unlinkSync, existsSync } from "fs";
import { getToken } from "../lib/auth";
import { getConfig } from "../lib/config";
import { AstarAPI, type Task, type TaskActivity, type OvertimeRun } from "../lib/api";
import { c, table } from "../lib/ui";

// ── Types ───────────────────────────────────────────────────────────

interface OvertimeSpec {
  slug: string;
  title: string;
  type: string;
  context: string;
  requirements: string[];
  notes: string;
}

interface OvertimeSession {
  uPid: number;
  ePid: number;
  taskNumber: number;
  worktree: string;
  startedAt: string;
  runId?: string;
}

type PidFile = Record<string, OvertimeSession>;

// ── Paths ───────────────────────────────────────────────────────────

const OVERTIME_DIR = join(process.cwd(), ".astar", "overtime");
const LOGS_DIR = join(OVERTIME_DIR, "logs");
const PID_FILE = join(OVERTIME_DIR, "pids.json");
const WORKTREE_DIR = join(process.cwd(), ".astar", "worktrees");

// ── Helpers ─────────────────────────────────────────────────────────

async function requireAuth(): Promise<string> {
  try {
    return await getToken();
  } catch {
    console.error(`${c.red}✗${c.reset} Not authenticated. Run ${c.cyan}astar login${c.reset} first.`);
    process.exit(1);
  }
}

async function readPidFile(): Promise<PidFile> {
  try {
    const file = Bun.file(PID_FILE);
    if (await file.exists()) return await file.json();
  } catch {}
  return {};
}

async function writePidFile(data: PidFile): Promise<void> {
  await Bun.write(PID_FILE, JSON.stringify(data, null, 2));
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function ensureClaudeInstalled(): void {
  try {
    execSync("which claude", { stdio: "pipe" });
  } catch {
    console.error(`${c.red}✗${c.reset} claude CLI not found. Install it first: ${c.cyan}https://docs.anthropic.com/claude-code${c.reset}`);
    process.exit(1);
  }
}

// ── Spec parser ─────────────────────────────────────────────────────

function parseSpec(content: string, filename: string): OvertimeSpec {
  const slug = basename(filename, ".md").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const lines = content.split("\n");

  let title = slug;
  let type = "dev";
  const contextLines: string[] = [];
  const requirements: string[] = [];
  const notesLines: string[] = [];

  let section: "preamble" | "context" | "requirements" | "notes" = "preamble";

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("# ") && section === "preamble") {
      title = trimmed.slice(2).trim();
      section = "context";
      continue;
    }

    if (/^overtime:\s*/i.test(trimmed)) {
      type = trimmed.replace(/^overtime:\s*/i, "").trim() || "dev";
      if (section === "preamble") section = "context";
      continue;
    }

    if (/^##\s+requirements/i.test(trimmed)) {
      section = "requirements";
      continue;
    }

    if (/^##\s+notes/i.test(trimmed)) {
      section = "notes";
      continue;
    }

    if (/^##\s+/.test(trimmed) && section !== "preamble") {
      // Unknown H2 — treat as notes
      section = "notes";
      notesLines.push(line);
      continue;
    }

    switch (section) {
      case "context":
        contextLines.push(line);
        break;
      case "requirements": {
        const match = trimmed.match(/^- \[[ x]\]\s+(.+)$/i);
        if (match) requirements.push(match[1]);
        break;
      }
      case "notes":
        notesLines.push(line);
        break;
    }
  }

  return {
    slug,
    title,
    type,
    context: contextLines.join("\n").trim(),
    requirements,
    notes: notesLines.join("\n").trim(),
  };
}

// ── Task creation ───────────────────────────────────────────────────

async function findExistingTask(api: AstarAPI, title: string): Promise<Task | null> {
  const tasks = await api.listTasks({ search: `[overtime] ${title}`, include_subtasks: true });
  return tasks.find((t) => t.title === `[overtime] ${title}`) || null;
}

async function createOvertimeTasks(
  api: AstarAPI,
  spec: OvertimeSpec
): Promise<{ parentTaskNumber: number; subtaskCount: number; existed: boolean }> {
  const existing = await findExistingTask(api, spec.title);
  if (existing) {
    return { parentTaskNumber: existing.task_number, subtaskCount: spec.requirements.length, existed: true };
  }

  const description = [
    spec.context,
    spec.notes ? `\n---\n**Notes:** ${spec.notes}` : "",
  ].filter(Boolean).join("\n");

  const parent = await api.createTask({
    title: `[overtime] ${spec.title}`,
    description,
    priority: "medium",
    tags: ["overtime", spec.type],
  });

  for (const req of spec.requirements) {
    await api.createTask({
      title: req,
      parent_task_number: parent.task_number,
      tags: ["overtime"],
      priority: "medium",
    });
  }

  return { parentTaskNumber: parent.task_number, subtaskCount: spec.requirements.length, existed: false };
}

// ── Worktree ────────────────────────────────────────────────────────

function setupWorktree(slug: string): string {
  const worktreePath = join(WORKTREE_DIR, `overtime-${slug}`);
  const branchName = `overtime/${slug}`;

  try {
    const list = execSync("git worktree list --porcelain", { stdio: "pipe" }).toString();
    if (list.includes(worktreePath)) return worktreePath;
  } catch {}

  try {
    execSync(`mkdir -p "${WORKTREE_DIR}"`, { stdio: "pipe" });
    execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, { stdio: "pipe" });
  } catch {
    // Branch might already exist
    try {
      execSync(`git worktree add "${worktreePath}" "${branchName}"`, { stdio: "pipe" });
    } catch (e: any) {
      console.error(`${c.red}✗${c.reset} Failed to create worktree: ${e.message}`);
      process.exit(1);
    }
  }

  return worktreePath;
}

// ── Context file ─────────────────────────────────────────────────────

async function loadContextFile(slug: string): Promise<string | null> {
  // Check slug-specific context first, then fall back to shared context.md
  const candidates = [
    join(OVERTIME_DIR, `${slug}-context.md`),
    join(OVERTIME_DIR, "context.md"),
  ];
  for (const path of candidates) {
    const f = Bun.file(path);
    if (await f.exists()) {
      return (await f.text()).trim();
    }
  }
  return null;
}

// ── Agent prompts ───────────────────────────────────────────────────

function uAgentPrompt(taskNumber: number, spec: OvertimeSpec, envContext?: string | null): string {
  const envBlock = envContext
    ? `\nENVIRONMENT CONTEXT:\n${envContext}\n`
    : "";
  return `You are U-Agent, an implementation engineer working overnight on behalf of a human developer.
${envBlock}
TASK: #${taskNumber} — ${spec.title}
CONTEXT: ${spec.context}
${spec.notes ? `NOTES: ${spec.notes}` : ""}

CYCLE:
1. Call get_task for #${taskNumber} to see the parent task and its subtasks.
2. Find the first subtask with status "open". If none remain, you are done — exit.
3. Call update_task to set that subtask to "in_progress".
4. Read the subtask title carefully — it is your requirement.
5. Implement the requirement. Edit files, write code, add tests if appropriate.
6. Run any existing tests to make sure you haven't broken anything.
7. Git add and commit your changes with a clear message referencing the subtask.
8. Call comment_task on the subtask describing what you did, which files you changed, and the commit hash.
9. Call update_task to set the subtask to "completed".

RULES:
- One subtask per cycle. Do it well, then exit.
- Always commit before marking complete.
- Keep commits atomic. Reference the subtask number in the commit message.
- If blocked, comment on the subtask explaining why and skip to the next one.
- Do not modify files unrelated to the current subtask.
- Before depending on any unfamiliar identifier from existing code (a function, type, constant, config key, DB column, API field, etc.), write a task comment: "I believe X means Y based on [file:line]". Do this before writing code that relies on it. This catches misread signatures, wrong assumptions about types, and silently wrong semantics.
- Do not route around problems. If something doesn't work (import fails, test breaks, API behaves unexpectedly), fix the root cause. Never add workarounds, stubs, placeholder returns, or test hacks. If you cannot fix it, comment on the subtask explaining the blocker and move on. Do not paper over it.`;
}

function eAgentPrompt(taskNumber: number, spec: OvertimeSpec, doneFile: string, envContext?: string | null): string {
  const envBlock = envContext
    ? `\nENVIRONMENT CONTEXT:\n${envContext}\n`
    : "";
  return `You are E-Agent, a code reviewer working overnight. You review the work of U-Agent.
${envBlock}
TASK: #${taskNumber} — ${spec.title}
CONTEXT: ${spec.context}
${spec.notes ? `NOTES: ${spec.notes}` : ""}

CYCLE:
1. Call get_task for #${taskNumber} to see the parent task and its subtasks.
2. Look for subtasks with status "completed" that do NOT have an "LGTM" comment from a previous review.
3. If no subtasks need review and some are still "open" or "in_progress", exit and wait for the next cycle.
4. For each subtask needing review:
   a. Read the task comments to understand what U-Agent changed and the commit hash.
   b. Use git log and git diff to review the actual code changes.
   c. Run any existing tests.
   d. Verify the requirement is actually met — not just that code was written, but that it solves the stated problem.
   e. If the implementation is GOOD: call comment_task with "LGTM — [brief reason]"
   f. If the implementation has ISSUES: call update_task to set the subtask back to "open", then call comment_task with specific feedback on what to fix.

5. FINAL SIGN-OFF — only when ALL subtasks have LGTM comments, perform a comprehensive final review before closing:

   a. Run "git diff main...HEAD" to see the ENTIRE branch diff — review every changed file holistically.
   b. Run the full test suite. If any test fails, do NOT sign off. Reopen the relevant subtask.
   c. Walk through each original requirement one by one. For each, verify the code change actually satisfies it:
${spec.requirements.map((r, i) => `      - Requirement ${i + 1}: "${r}"`).join("\n")}
   d. Check for unintended side effects: were any files modified that shouldn't have been?
   e. Check for regressions: does the existing functionality still work?
   f. Check for security issues: any hardcoded secrets, injection vectors, or unsafe operations?
   g. Check that commits are clean and atomic — no debug code, no commented-out blocks, no leftover TODOs.

   If EVERYTHING passes:
   - Call comment_task on parent #${taskNumber} with a detailed sign-off report:
     "SIGN-OFF: All requirements verified."
     Then list each requirement and how it was verified.
     Include: files changed, tests run, branch diff summary.
   - Call update_task on #${taskNumber} to set status to "completed".
   - Run: touch ${doneFile}

   If ANY check fails during final review:
   - Do NOT sign off. Reopen the failing subtask with specific feedback.
   - Do NOT create the done file.

RULES:
- Be thorough. The human is asleep — you are the last line of defense before they see this work.
- Focus on correctness: does the code actually satisfy the requirement?
- Run tests. If they fail, reject.
- Be specific in rejection feedback — say exactly what to fix.
- Do not nitpick style. Focus on logic, correctness, edge cases.
- You cannot edit code. You can only review and comment.
- The done file (touch command) is critical — it signals the overnight session to stop.`;
}

const U_TOOLS = [
  "Bash", "Read", "Write", "Edit", "Glob", "Grep",
  "mcp__astar_sh__get_task", "mcp__astar_sh__update_task",
  "mcp__astar_sh__comment_task", "mcp__astar_sh__list_tasks",
].join(",");

const E_TOOLS = [
  "Bash", "Read", "Glob", "Grep",
  "mcp__astar_sh__get_task", "mcp__astar_sh__update_task",
  "mcp__astar_sh__comment_task", "mcp__astar_sh__list_tasks",
].join(",");

// ── Agent spawning ──────────────────────────────────────────────────

function makeAgentScript(
  name: string,
  prompt: string,
  tools: string,
  maxTurns: number,
  worktree: string,
  cooldown: number,
  doneFile: string,
  agentChar: "u" | "e" = "u",
  runId: string = "",
  apiUrl: string = "",
  token: string = "",
): string {
  const escaped = prompt.replace(/'/g, "'\\''");

  // Finalization block: runs after the while loop exits (E-Agent only).
  // Queries the cycle records from the API, aggregates totals, and PATCHes
  // the run record to status=done. Gracefully degrades if jq/curl is absent.
  const finalizationBlock = (agentChar === "e" && runId) ? `
if command -v jq &>/dev/null && command -v curl &>/dev/null; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') [${name}] Finalizing run record..."
  FINAL_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  GIT_COMMITS=$(git -C "${worktree}" log --format="%H" main..HEAD 2>/dev/null | jq -R . | jq -sc . 2>/dev/null)
  [ -z "$GIT_COMMITS" ] && GIT_COMMITS="[]"
  CYCLES_RESP=$(curl -sf "${apiUrl}/overtime/runs/${runId}/cycles" \\
    -H "Authorization: Bearer $AUTH_TOKEN" 2>/dev/null)
  TOTAL_U=$(echo "$CYCLES_RESP" | jq '[.cycles[] | select(.agent=="u")] | length' 2>/dev/null || echo "0")
  TOTAL_E=$(echo "$CYCLES_RESP" | jq '[.cycles[] | select(.agent=="e")] | length' 2>/dev/null || echo "0")
  TOTAL_COST=$(echo "$CYCLES_RESP" | jq '[.cycles[].cost_usd // 0] | add // null' 2>/dev/null || echo "null")
  FINALIZE_JSON=$(jq -nc \\
    --arg status "done" \\
    --arg completed_at "$FINAL_TS" \\
    --argjson git_commits "$GIT_COMMITS" \\
    --argjson total_cycles_u "\${TOTAL_U:-0}" \\
    --argjson total_cycles_e "\${TOTAL_E:-0}" \\
    --argjson total_cost_usd "\${TOTAL_COST:-null}" \\
    '{status: $status, completed_at: $completed_at, git_commits: $git_commits, total_cycles_u: $total_cycles_u, total_cycles_e: $total_cycles_e, total_cost_usd: $total_cost_usd}' 2>/dev/null)
  if [ -n "$FINALIZE_JSON" ]; then
    curl -sf -X PATCH "${apiUrl}/overtime/runs/${runId}" \\
      -H "Authorization: Bearer $AUTH_TOKEN" \\
      -H "Content-Type: application/json" \\
      -d "$FINALIZE_JSON" >/dev/null 2>&1 || true
    echo "$(date '+%Y-%m-%d %H:%M:%S') [${name}] Run finalized (done, U=$TOTAL_U E=$TOTAL_E cycles)."
  fi
fi` : "";

  // Telemetry block: parse JSON output and POST a cycle record to astar.sh.
  // Only included when a runId is available. Uses jq + curl; gracefully degrades
  // if either is missing. All --arg values are strings; jq converts to numbers.
  const telemetryBlock = runId ? `
  if command -v jq &>/dev/null; then
    RESULT_TEXT=$(jq -r '.result // ""' "$TMPOUT" 2>/dev/null)
    TOKENS_IN=$(jq -r 'if .usage then ((.usage.input_tokens // 0) + (.usage.cache_creation_input_tokens // 0) + (.usage.cache_read_input_tokens // 0) | tostring) else "" end' "$TMPOUT" 2>/dev/null)
    TOKENS_OUT=$(jq -r 'if .usage.output_tokens then (.usage.output_tokens | tostring) else "" end' "$TMPOUT" 2>/dev/null)
    COST_USD=$(jq -r 'if .total_cost_usd then (.total_cost_usd | tostring) else "" end' "$TMPOUT" 2>/dev/null)
    MODEL=$(jq -r '(.modelUsage // {}) | keys[0] // ""' "$TMPOUT" 2>/dev/null)
    TURNS_USED=$(jq -r 'if .num_turns then (.num_turns | tostring) else "" end' "$TMPOUT" 2>/dev/null)
    TOOL_CALLS=$(jq -r 'if .usage.iterations then (.usage.iterations | length | tostring) else "" end' "$TMPOUT" 2>/dev/null)
    if [ -n "$RESULT_TEXT" ]; then
      echo "$RESULT_TEXT"
    else
      cat "$TMPOUT"
    fi
    echo "$(date '+%Y-%m-%d %H:%M:%S') [${name}] tokens: in=$TOKENS_IN out=$TOKENS_OUT cost=$COST_USD turns=$TURNS_USED tool_calls=$TOOL_CALLS model=$MODEL"
    CYCLE_JSON=$(jq -nc \\
      --arg run_id "${runId}" \\
      --arg agent "${agentChar}" \\
      --arg cycle_number "$CYCLE_NUM" \\
      --arg started_at "$CYCLE_STARTED" \\
      --arg completed_at "$CYCLE_ENDED" \\
      --arg exit_code "$EXIT_CODE" \\
      --arg model "$MODEL" \\
      --arg max_turns "${maxTurns}" \\
      --arg tokens_in "$TOKENS_IN" \\
      --arg tokens_out "$TOKENS_OUT" \\
      --arg cost_usd "$COST_USD" \\
      --arg turns_used "$TURNS_USED" \\
      --arg tool_calls "$TOOL_CALLS" \\
      '{
        run_id: $run_id,
        agent: $agent,
        cycle_number: ($cycle_number | tonumber),
        started_at: $started_at,
        completed_at: $completed_at,
        exit_code: ($exit_code | tonumber),
        model: (if $model == "" then null else $model end),
        max_turns: ($max_turns | tonumber),
        tokens_in: (if $tokens_in == "" then null else ($tokens_in | tonumber) end),
        tokens_out: (if $tokens_out == "" then null else ($tokens_out | tonumber) end),
        cost_usd: (if $cost_usd == "" then null else ($cost_usd | tonumber) end),
        turns_used: (if $turns_used == "" then null else ($turns_used | tonumber) end),
        tool_calls_count: (if $tool_calls == "" then null else ($tool_calls | tonumber) end)
      }' 2>/dev/null)
    if [ -n "$CYCLE_JSON" ]; then
      curl -sf -X POST "${apiUrl}/overtime/cycles" \\
        -H "Authorization: Bearer $AUTH_TOKEN" \\
        -H "Content-Type: application/json" \\
        -d "$CYCLE_JSON" >/dev/null 2>&1 || true
    fi
  else
    cat "$TMPOUT"
  fi` : `
  cat "$TMPOUT"`;

  const authFile = join(homedir(), ".astar", "auth.json");
  return `
cd "${worktree}"
AUTH_TOKEN="${token}"
CYCLE_NUM=0
while true; do
  if [ -f "${doneFile}" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [${name}] Done file found. Shutting down."
    break
  fi
  # Refresh token from auth cache each cycle (survives token expiry + re-auth)
  if [ -f "${authFile}" ] && command -v jq &>/dev/null; then
    FRESH_TOKEN=$(jq -r '.accessToken // empty' "${authFile}" 2>/dev/null)
    if [ -n "$FRESH_TOKEN" ]; then
      AUTH_TOKEN="$FRESH_TOKEN"
    fi
  fi
  CYCLE_NUM=$((CYCLE_NUM + 1))
  CYCLE_STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  TMPOUT=$(mktemp /tmp/claude-cycle-XXXXXX.json)
  echo "$(date '+%Y-%m-%d %H:%M:%S') [${name}] Starting cycle $CYCLE_NUM..."
  claude -p '${escaped}' \\
    --allowedTools "${tools}" \\
    --max-turns ${maxTurns} \\
    --output-format json \\
    --dangerously-skip-permissions > "$TMPOUT"
  EXIT_CODE=$?
  CYCLE_ENDED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo "$(date '+%Y-%m-%d %H:%M:%S') [${name}] Cycle $CYCLE_NUM done (exit: $EXIT_CODE)"${telemetryBlock}
  rm -f "$TMPOUT"
  if [ -f "${doneFile}" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [${name}] Done file found. Shutting down."
    break
  fi
  sleep ${cooldown}
done
${finalizationBlock}
echo "$(date '+%Y-%m-%d %H:%M:%S') [${name}] Exited."
`;
}

function spawnAgent(script: string, logPath: string): ChildProcess {
  const proc = spawn("bash", ["-c", script], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  const logFile = Bun.file(logPath);
  const writer = logFile.writer();

  proc.stdout?.on("data", (d: Buffer) => writer.write(d));
  proc.stderr?.on("data", (d: Buffer) => writer.write(d));
  proc.on("close", () => writer.end());

  proc.unref();
  return proc;
}

// ── Commands ────────────────────────────────────────────────────────

async function startOvertime(fileFilter?: string) {
  const token = await requireAuth();
  const api = new AstarAPI(token);
  const config = await getConfig();
  ensureClaudeInstalled();

  // Find spec files
  const glob = new Bun.Glob("*.md");
  const specs: OvertimeSpec[] = [];

  try {
    for await (const file of glob.scan({ cwd: OVERTIME_DIR })) {
      const slug = basename(file, ".md").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (fileFilter && slug !== fileFilter && !file.startsWith(fileFilter)) continue;
      const content = await Bun.file(join(OVERTIME_DIR, file)).text();
      specs.push(parseSpec(content, file));
    }
  } catch {
    console.error(`${c.red}✗${c.reset} No .astar/overtime/ directory found.`);
    console.log(`  Create spec files in ${c.cyan}.astar/overtime/*.md${c.reset} first.`);
    console.log("");
    console.log(`  Example:`);
    console.log(`  ${c.dim}# Auth Refactor${c.reset}`);
    console.log(`  ${c.dim}overtime: dev${c.reset}`);
    console.log(`  ${c.dim}## Requirements${c.reset}`);
    console.log(`  ${c.dim}- [ ] JWT refresh handles concurrent requests safely${c.reset}`);
    process.exit(1);
  }

  if (!specs.length) {
    console.error(`${c.red}✗${c.reset} No spec files found${fileFilter ? ` matching "${fileFilter}"` : ""}.`);
    process.exit(1);
  }

  const pids = await readPidFile();

  // Ensure logs dir
  await Bun.write(join(LOGS_DIR, ".keep"), "");

  console.log("");
  console.log(`  ${c.bold}${c.white}OVERTIME${c.reset}`);
  console.log("");

  for (const spec of specs) {
    // Skip if already running
    if (pids[spec.slug] && isAlive(pids[spec.slug].uPid)) {
      console.log(`  ${c.yellow}⟳${c.reset} ${c.white}${spec.title}${c.reset} — already running (PID ${pids[spec.slug].uPid})`);
      continue;
    }

    // Clean stale done file from previous run
    try { unlinkSync(join(OVERTIME_DIR, `.done-${spec.slug}`)); } catch {}

    if (spec.requirements.length === 0) {
      console.log(`  ${c.yellow}⚠${c.reset} ${c.white}${spec.title}${c.reset} — no requirements, skipping`);
      continue;
    }

    // Create tasks
    const { parentTaskNumber, subtaskCount, existed } = await createOvertimeTasks(api, spec);
    const taskLabel = existed ? "existing" : "created";

    // Setup worktree
    const worktree = setupWorktree(spec.slug);

    // Load optional context file (.astar/overtime/<slug>-context.md or context.md)
    const envContext = await loadContextFile(spec.slug);

    // Spawn agents
    const doneFile = join(OVERTIME_DIR, `.done-${spec.slug}`);
    const branchName = `overtime/${spec.slug}`;

    // Create the run record so cycle telemetry has a run_id to reference.
    let runId = "";
    try {
      const runResult = await api.createOvertimeRun({
        slug: spec.slug,
        spec_title: spec.title,
        type: spec.type,
        parent_task_number: parentTaskNumber,
        worktree_path: worktree,
        branch_name: branchName,
      });
      runId = runResult.id;
    } catch (e: any) {
      console.log(`    ${c.dim}(telemetry run record unavailable: ${e.message})${c.reset}`);
    }

    const uScript = makeAgentScript("U-Agent", uAgentPrompt(parentTaskNumber, spec, envContext), U_TOOLS, 100, worktree, 180, doneFile, "u", runId, config.apiUrl, token);
    const eScript = makeAgentScript("E-Agent", eAgentPrompt(parentTaskNumber, spec, doneFile, envContext), E_TOOLS, 100, worktree, 180, doneFile, "e", runId, config.apiUrl, token);

    // E-Agent starts with a 5-minute delay baked in
    const eScriptWithDelay = `echo "$(date '+%Y-%m-%d %H:%M:%S') [E-Agent] Waiting 5m for U-Agent to start..."\nsleep 300\n${eScript}`;

    const logPath = join(LOGS_DIR, `${spec.slug}.log`);
    const uProc = spawnAgent(uScript, logPath);
    const eProc = spawnAgent(eScriptWithDelay, logPath);

    pids[spec.slug] = {
      uPid: uProc.pid!,
      ePid: eProc.pid!,
      taskNumber: parentTaskNumber,
      worktree,
      startedAt: new Date().toISOString(),
      runId: runId || undefined,
    };

    console.log(`  ${c.green}✓${c.reset} ${c.white}${spec.title}${c.reset}`);
    console.log(`    Task #${c.cyan}${parentTaskNumber}${c.reset} (${taskLabel}) · ${subtaskCount} subtasks · ${c.dim}${spec.type}${c.reset}`);
    if (envContext) console.log(`    ${c.dim}Context file loaded${c.reset}`);
    console.log(`    U-Agent PID ${c.dim}${uProc.pid}${c.reset}  E-Agent PID ${c.dim}${eProc.pid}${c.reset}`);
    console.log(`    Branch ${c.dim}overtime/${spec.slug}${c.reset}`);
    console.log("");
  }

  await writePidFile(pids);

  console.log(`  ${c.dim}Logs: .astar/overtime/logs/${c.reset}`);
  console.log(`  ${c.dim}Stop: astar overtime stop${c.reset}`);
  console.log("");
}

async function showStatus() {
  const pids = await readPidFile();
  const slugs = Object.keys(pids);

  if (!slugs.length) {
    console.log(`\n  ${c.dim}No overtime sessions.${c.reset}\n`);
    return;
  }

  let token: string | undefined;
  try {
    token = await getToken();
  } catch {}

  console.log("");
  console.log(`  ${c.bold}${c.white}OVERTIME STATUS${c.reset}`);
  console.log("");

  const rows: string[][] = [];

  for (const slug of slugs) {
    const s = pids[slug];
    const uAlive = isAlive(s.uPid);
    const eAlive = isAlive(s.ePid);
    const doneFileExists = existsSync(join(OVERTIME_DIR, `.done-${slug}`));
    const state = doneFileExists
      ? `${c.green}done${c.reset}`
      : uAlive || eAlive
        ? `${c.yellow}running${c.reset}`
        : `${c.red}stopped${c.reset}`;

    let progress = "—";
    if (token) {
      try {
        const api = new AstarAPI(token);
        const { subtasks } = await api.getTask(s.taskNumber);
        const done = subtasks.filter((t) => t.status === "completed").length;
        progress = `${done}/${subtasks.length}`;
      } catch {}
    }

    const started = new Date(s.startedAt);
    const elapsed = Math.floor((Date.now() - started.getTime()) / 60000);
    const uptime = elapsed < 60 ? `${elapsed}m` : `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`;

    rows.push([
      `${c.white}${slug}${c.reset}`,
      `#${c.cyan}${s.taskNumber}${c.reset}`,
      progress,
      state,
      `${c.dim}${uptime}${c.reset}`,
    ]);
  }

  table(["Session", "Task", "Progress", "State", "Uptime"], rows);
  console.log("");
}

async function showRecap() {
  const token = await requireAuth();
  const api = new AstarAPI(token);

  const [tasks, allRuns, pids] = await Promise.all([
    api.listTasks({ search: "[overtime]", include_subtasks: true }),
    api.listOvertimeRuns().catch(() => [] as OvertimeRun[]),
    readPidFile(),
  ]);
  const parents = tasks.filter((t) => t.title.startsWith("[overtime]"));

  if (!parents.length) {
    console.log(`\n  ${c.dim}No overtime tasks found.${c.reset}\n`);
    return;
  }

  console.log("");
  console.log(`  ${c.bold}${c.white}OVERNIGHT RECAP${c.reset}`);

  for (const parent of parents) {
    const { subtasks, activity } = await api.getTask(parent.task_number);
    const done = subtasks.filter((t) => t.status === "completed").length;
    const allDone = done === subtasks.length;
    const taskStatusColor = allDone ? c.green : c.yellow;

    console.log("");
    console.log(`  ${c.white}${parent.title.replace("[overtime] ", "")}${c.reset}  #${c.cyan}${parent.task_number}${c.reset}  ${taskStatusColor}${done}/${subtasks.length}${c.reset}`);
    console.log("");

    for (const sub of subtasks) {
      const icon = sub.status === "completed" ? `${c.green}✓${c.reset}` : sub.status === "in_progress" ? `${c.yellow}▸${c.reset}` : `${c.dim}○${c.reset}`;
      console.log(`    ${icon}  #${c.dim}${sub.task_number}${c.reset}  ${sub.title}`);
    }

    // ── Telemetry block ──────────────────────────────────────────────
    // Find the most recent run for this task (by parent_task_number)
    const run = allRuns.find((r) => r.parent_task_number === parent.task_number);
    if (run) {
      const startMs = new Date(run.started_at).getTime();
      const endMs = run.completed_at ? new Date(run.completed_at).getTime() : Date.now();
      const durationMs = endMs - startMs;
      const running = run.status === "running";

      console.log("");
      console.log(
        `  ${c.dim}Run:${c.reset} ${c.white}${run.slug}${c.reset}` +
        `  ${statusColor(run.status)}` +
        `  ${c.dim}${fmtDuration(durationMs)}${running ? "…" : ""}${c.reset}`
      );

      // Cost + cycle summary on one line
      const parts: string[] = [];
      if (run.total_cost_usd != null) parts.push(`${c.dim}Cost:${c.reset} ${fmtCost(run.total_cost_usd)}`);
      const totalCycles = (run.total_cycles_u ?? 0) + (run.total_cycles_e ?? 0);
      if (totalCycles > 0) {
        parts.push(
          `${c.dim}Cycles:${c.reset} ${c.cyan}${run.total_cycles_u}U${c.reset} ${c.magenta}${run.total_cycles_e}E${c.reset}`
        );
      }
      if ((run.total_rejections ?? 0) > 0) {
        parts.push(`${c.dim}Rejections:${c.reset} ${c.red}${run.total_rejections}${c.reset}`);
      }
      if (parts.length) console.log(`  ${parts.join("  ")}`);

      // Fetch cycles for rejection history and timeline
      try {
        const cycles = await api.listOvertimeCycles(run.id);

        // Rejection history — show which subtasks were rejected and by which e-cycle
        const rejections = cycles.filter((cy) => cy.action_taken === "rejected");
        if (rejections.length) {
          console.log("");
          console.log(`  ${c.dim}Rejection history:${c.reset}`);
          for (const rej of rejections) {
            const taskRef = rej.subtask_number != null ? `#${rej.subtask_number}` : "—";
            const ts = rej.completed_at
              ? new Date(rej.completed_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
              : "?";
            console.log(
              `    ${c.dim}${ts}${c.reset}  ${c.magenta}E${c.reset}${c.dim}#${rej.cycle_number}${c.reset}  ${c.dim}rejected${c.reset} ${taskRef}`
            );
          }
        }

        // Compact cycle timeline — show per-subtask cost/token summary
        const subtaskNumbers = [...new Set(cycles.filter((cy) => cy.subtask_number != null).map((cy) => cy.subtask_number!))];
        if (subtaskNumbers.length > 0) {
          const totalTokensIn = cycles.reduce((a, cy) => a + (cy.tokens_in ?? 0), 0);
          const totalTokensOut = cycles.reduce((a, cy) => a + (cy.tokens_out ?? 0), 0);
          if (totalTokensIn > 0 || totalTokensOut > 0) {
            console.log("");
            console.log(
              `  ${c.dim}Tokens:${c.reset} ${c.dim}${totalTokensIn.toLocaleString()} in / ${totalTokensOut.toLocaleString()} out${c.reset}`
              + (run.total_cost_usd != null && subtaskNumbers.length > 0
                ? `  ${c.dim}(≈${fmtCost(run.total_cost_usd / subtaskNumbers.length)}/subtask)${c.reset}`
                : "")
            );
          }
        }

        // Branch / commit count
        if (run.git_commits?.length) {
          console.log(
            `  ${c.dim}Commits: ${run.git_commits.length}  Branch: ${run.branch_name || "—"}${c.reset}`
          );
        }
      } catch {
        // Cycles unavailable — show branch from run record
        if (run.branch_name) {
          console.log(`  ${c.dim}Branch: ${run.branch_name}${c.reset}`);
        }
      }
    }

    // ── Recent activity ──────────────────────────────────────────────
    const comments = activity.filter((a: any) => a.action === "commented").slice(-8);
    if (comments.length) {
      console.log("");
      console.log(`  ${c.dim}Recent activity:${c.reset}`);
      for (const a of comments as any[]) {
        const ts = a.timestamp || a.created_at;
        const time = ts ? new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "??:??";
        const who = ((a.actor_email || a.actor || "") as string).split("@")[0] || "agent";
        const msg = (a.state_after?.comment || a.details?.comment || a.context?.comment || "commented") as string;
        console.log(`    ${c.dim}${time}${c.reset}  ${who}  ${c.dim}${msg.split("\n")[0].slice(0, 80)}${c.reset}`);
      }
    }

    // ── Branch info from pid file (for live sessions) ─────────────────
    if (!run) {
      const slug = Object.keys(pids).find((k) => pids[k].taskNumber === parent.task_number);
      if (slug) {
        console.log("");
        console.log(`  ${c.dim}Branch: overtime/${slug}${c.reset}`);
        console.log(`  ${c.dim}Worktree: ${pids[slug].worktree}${c.reset}`);
      }
    }
  }

  console.log("");
  console.log(`  ${c.dim}For full telemetry: astar overtime stats${c.reset}`);
  console.log("");
}

async function stopOvertime(opts: { clean?: boolean }) {
  const pids = await readPidFile();
  const slugs = Object.keys(pids);

  if (!slugs.length) {
    console.log(`\n  ${c.dim}No overtime sessions to stop.${c.reset}\n`);
    return;
  }

  let token: string | undefined;
  let api: AstarAPI | undefined;
  try {
    token = await getToken();
    api = new AstarAPI(token);
  } catch {}

  console.log("");

  for (const slug of slugs) {
    const s = pids[slug];
    let killed = false;

    for (const pid of [s.uPid, s.ePid]) {
      if (isAlive(pid)) {
        try {
          process.kill(pid, "SIGTERM");
          killed = true;
        } catch {}
      }
    }

    // Wait a moment then force kill if needed
    if (killed) {
      await new Promise((r) => setTimeout(r, 2000));
      for (const pid of [s.uPid, s.ePid]) {
        if (isAlive(pid)) {
          try { process.kill(pid, "SIGKILL"); } catch {}
        }
      }
    }

    console.log(`  ${c.green}✓${c.reset} Stopped ${c.white}${slug}${c.reset} (task #${s.taskNumber})`);

    // Finalize the run record in telemetry
    if (s.runId && api) {
      try {
        const isDone = existsSync(join(OVERTIME_DIR, `.done-${slug}`));
        const finalStatus = isDone ? "done" : "stopped";

        // Collect commits on the branch since main
        let gitCommits: string[] = [];
        try {
          const worktreeDir = s.worktree || process.cwd();
          const log = execSync(
            `git -C "${worktreeDir}" log --format="%H" main..HEAD 2>/dev/null`,
            { stdio: "pipe" }
          ).toString().trim();
          if (log) gitCommits = log.split("\n").filter(Boolean);
        } catch {}

        // Aggregate cycle stats from stored cycle records
        let totalCyclesU = 0;
        let totalCyclesE = 0;
        let totalCostUsd: number | null = null;
        try {
          const cycles = await api.listOvertimeCycles(s.runId);
          totalCyclesU = cycles.filter((cyc) => cyc.agent === "u").length;
          totalCyclesE = cycles.filter((cyc) => cyc.agent === "e").length;
          const costs = cycles
            .map((cyc) => cyc.cost_usd)
            .filter((v): v is number => v !== null && v !== undefined);
          if (costs.length) totalCostUsd = costs.reduce((a, b) => a + b, 0);
        } catch {}

        await api.updateOvertimeRun(s.runId, {
          status: finalStatus,
          completed_at: new Date().toISOString(),
          total_cycles_u: totalCyclesU,
          total_cycles_e: totalCyclesE,
          total_cost_usd: totalCostUsd,
          git_commits: gitCommits,
        });
        console.log(`    ${c.dim}Run record finalized (${finalStatus}, ${totalCyclesU + totalCyclesE} cycles)${c.reset}`);
      } catch (e: any) {
        console.log(`    ${c.dim}(telemetry update skipped: ${e.message})${c.reset}`);
      }
    }

    if (opts.clean && s.worktree) {
      try {
        execSync(`git worktree remove "${s.worktree}" --force`, { stdio: "pipe" });
        console.log(`    ${c.dim}Removed worktree${c.reset}`);
      } catch {}
    }

    delete pids[slug];
  }

  await writePidFile(pids);
  console.log("");
}

// ── Stats ────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtCost(usd: number | null | undefined): string {
  if (usd == null) return c.dim + "—" + c.reset;
  return `$${usd.toFixed(4)}`;
}

function statusColor(status: string): string {
  if (status === "done") return c.green + status + c.reset;
  if (status === "running") return c.yellow + status + c.reset;
  if (status === "failed") return c.red + status + c.reset;
  return c.dim + status + c.reset;
}

async function showStats(runId?: string) {
  const token = await requireAuth();
  const api = new AstarAPI(token);

  if (!runId) {
    // List recent runs
    let runs;
    try {
      runs = await api.listOvertimeRuns();
    } catch (e: any) {
      console.error(`${c.red}✗${c.reset} ${e.message}`);
      process.exit(1);
    }

    if (!runs.length) {
      console.log(`\n  ${c.dim}No overtime runs found.${c.reset}\n`);
      return;
    }

    console.log("");
    console.log(`  ${c.bold}${c.white}OVERTIME RUNS${c.reset}`);
    console.log("");

    table(
      ["Slug", "Status", "U", "E", "Reject", "Cost", "Duration"],
      runs.map((r) => {
        const dur =
          r.completed_at
            ? fmtDuration(new Date(r.completed_at).getTime() - new Date(r.started_at).getTime())
            : r.status === "running"
              ? fmtDuration(Date.now() - new Date(r.started_at).getTime()) + "…"
              : "—";
        return [
          `${c.white}${r.slug}${c.reset}`,
          statusColor(r.status),
          String(r.total_cycles_u),
          String(r.total_cycles_e),
          String(r.total_rejections),
          fmtCost(r.total_cost_usd),
          `${c.dim}${dur}${c.reset}`,
        ];
      })
    );
    console.log("");
    console.log(`  ${c.dim}Pass a run ID to see per-cycle breakdown: astar overtime stats <id>${c.reset}`);
    console.log("");
    return;
  }

  // Detailed view for a specific run
  let run;
  let cycles;
  try {
    [run, cycles] = await Promise.all([
      api.getOvertimeRun(runId),
      api.listOvertimeCycles(runId),
    ]);
  } catch (e: any) {
    console.error(`${c.red}✗${c.reset} ${e.message}`);
    process.exit(1);
  }

  const startMs = new Date(run.started_at).getTime();
  const endMs = run.completed_at ? new Date(run.completed_at).getTime() : Date.now();
  const durationMs = endMs - startMs;

  const totalTokensIn = cycles.reduce((a, c) => a + (c.tokens_in ?? 0), 0);
  const totalTokensOut = cycles.reduce((a, c) => a + (c.tokens_out ?? 0), 0);
  const totalCost = cycles.reduce((a, c) => a + (c.cost_usd ?? 0), 0);

  const completedCycles = cycles.filter((c) => c.completed_at);
  const avgCycleMs =
    completedCycles.length
      ? completedCycles.reduce((sum, cy) => {
          const s = new Date(cy.started_at).getTime();
          const e = new Date(cy.completed_at!).getTime();
          return sum + (e - s);
        }, 0) / completedCycles.length
      : null;

  const subtaskCount = new Set(
    cycles.filter((c) => c.subtask_number != null).map((c) => c.subtask_number)
  ).size;

  const costPerSubtask =
    subtaskCount > 0 && totalCost > 0 ? totalCost / subtaskCount : null;

  console.log("");
  console.log(`  ${c.bold}${c.white}OVERTIME STATS${c.reset}  ${c.dim}${run.slug}${c.reset}`);
  console.log("");
  console.log(`  ${c.dim}Spec:${c.reset}       ${c.white}${run.spec_title}${c.reset}`);
  console.log(`  ${c.dim}Status:${c.reset}     ${statusColor(run.status)}`);
  console.log(`  ${c.dim}Branch:${c.reset}     ${c.dim}${run.branch_name || "—"}${c.reset}`);
  console.log(`  ${c.dim}Started:${c.reset}    ${c.dim}${new Date(run.started_at).toLocaleString()}${c.reset}`);
  if (run.completed_at) {
    console.log(`  ${c.dim}Ended:${c.reset}      ${c.dim}${new Date(run.completed_at).toLocaleString()}${c.reset}`);
  }
  console.log("");
  console.log(`  ${c.bold}${c.white}Summary${c.reset}`);
  console.log(`  ${c.dim}Duration:${c.reset}         ${fmtDuration(durationMs)}`);
  console.log(`  ${c.dim}U-Agent cycles:${c.reset}   ${run.total_cycles_u}`);
  console.log(`  ${c.dim}E-Agent cycles:${c.reset}   ${run.total_cycles_e}`);
  console.log(`  ${c.dim}Rejections:${c.reset}       ${run.total_rejections}`);
  console.log(`  ${c.dim}Tokens in:${c.reset}        ${totalTokensIn > 0 ? totalTokensIn.toLocaleString() : "—"}`);
  console.log(`  ${c.dim}Tokens out:${c.reset}       ${totalTokensOut > 0 ? totalTokensOut.toLocaleString() : "—"}`);
  console.log(`  ${c.dim}Total cost:${c.reset}       ${totalCost > 0 ? `$${totalCost.toFixed(4)}` : "—"}`);
  console.log(`  ${c.dim}Avg cycle time:${c.reset}   ${avgCycleMs != null ? fmtDuration(avgCycleMs) : "—"}`);
  console.log(`  ${c.dim}Cost/subtask:${c.reset}     ${costPerSubtask != null ? `$${costPerSubtask.toFixed(4)}` : "—"}`);

  if (cycles.length) {
    console.log("");
    console.log(`  ${c.bold}${c.white}Cycles${c.reset}`);
    console.log("");
    table(
      ["#", "Agent", "Subtask", "Action", "Turns", "Tokens", "Cost", "Duration"],
      cycles.map((cy) => {
        const cyDur =
          cy.completed_at
            ? fmtDuration(new Date(cy.completed_at).getTime() - new Date(cy.started_at).getTime())
            : "—";
        const tokens =
          cy.tokens_in != null || cy.tokens_out != null
            ? `${(cy.tokens_in ?? 0) + (cy.tokens_out ?? 0)}`
            : "—";
        const agentColor = cy.agent === "u" ? c.cyan : c.magenta;
        return [
          `${c.dim}${cy.cycle_number}${c.reset}`,
          `${agentColor}${cy.agent}${c.reset}`,
          cy.subtask_number != null ? `#${cy.subtask_number}` : `${c.dim}—${c.reset}`,
          cy.action_taken ? `${c.dim}${cy.action_taken}${c.reset}` : `${c.dim}—${c.reset}`,
          cy.turns_used != null ? `${cy.turns_used}/${cy.max_turns ?? "?"}` : `${c.dim}—${c.reset}`,
          `${c.dim}${tokens}${c.reset}`,
          cy.cost_usd != null ? `$${cy.cost_usd.toFixed(4)}` : `${c.dim}—${c.reset}`,
          `${c.dim}${cyDur}${c.reset}`,
        ];
      })
    );
  }

  if (run.git_commits?.length) {
    console.log("");
    console.log(`  ${c.dim}Commits (${run.git_commits.length}):${c.reset}`);
    for (const hash of run.git_commits.slice(0, 10)) {
      console.log(`    ${c.dim}${hash.slice(0, 12)}${c.reset}`);
    }
    if (run.git_commits.length > 10) {
      console.log(`    ${c.dim}…and ${run.git_commits.length - 10} more${c.reset}`);
    }
  }

  console.log("");
}

// ── Guide ───────────────────────────────────────────────────────────

function showGuide() {
  const d = c.dim;
  const w = c.white;
  const cy = c.cyan;
  const y = c.yellow;
  const g = c.green;
  const r = c.reset;

  console.log(`
  ${c.bold}${w}ASTAR OVERTIME — GUIDE${r}

  Drop a markdown spec in ${cy}.astar/overtime/${r}, run ${cy}astar overtime start${r},
  and two agents work through the night. One implements, one reviews.

  ${c.bold}${w}HOW IT WORKS${r}

    You write a spec    U-Agent implements    E-Agent reviews
         │                    │                     │
         ▼                    ▼                     ▼
    .astar/overtime/    picks first open      reviews completed
    my-task.md          subtask, codes it,    subtasks, approves
                        commits, comments     or rejects with
                        on the task           specific feedback
                              │                     │
                              └──── task queue ──────┘
                                (astar.sh tasks +
                                 comments are the
                                 only communication)

  ${c.bold}${w}SPEC FORMAT${r}

    ${d}# Title of the Work${r}
    ${d}${r}
    ${d}overtime: dev${r}
    ${d}${r}
    ${d}Context about what needs doing. Write this like a note${r}
    ${d}to yourself before leaving. The more context, the better${r}
    ${d}the agents perform.${r}
    ${d}${r}
    ${d}## Requirements${r}
    ${d}- [ ] Each checkbox becomes one subtask${r}
    ${d}- [ ] Be specific and verifiable${r}
    ${d}- [ ] Order matters — agents work top to bottom${r}
    ${d}${r}
    ${d}## Notes${r}
    ${d}Constraints. What NOT to touch. Boundaries.${r}

  ${c.bold}${w}CONTEXT FILES${r}

    For facts the agents can't infer from the code — deployment topology,
    service users, reboot policies, file paths, runtime constraints — create
    a context file alongside your spec:

    ${d}.astar/overtime/context.md${r}         ${d}# shared by all specs${r}
    ${d}.astar/overtime/<slug>-context.md${r}  ${d}# specific to one spec${r}

    The slug-specific file takes precedence. Contents are injected verbatim
    into both agent prompts as an ENVIRONMENT CONTEXT block.

    Example ${d}.astar/overtime/auth-context.md${r}:
    ${d}Service user: www-data (no sudo). Deployment: Kubernetes, restart via${r}
    ${d}kubectl rollout restart. Config lives in /etc/myapp/config.yaml.${r}
    ${d}Test command: make test-integration (requires $DB_URL set).${r}

  ${c.bold}${w}WRITING GOOD REQUIREMENTS${r}

    ${c.red}Bad:${r}   ${d}- [ ] Improve error handling${r}
    ${g}Good:${r}  ${d}- [ ] Return RFC 7807 problem details on all 4xx/5xx responses${r}

    ${c.red}Bad:${r}   ${d}- [ ] Refactor and clean up the auth module${r}
    ${g}Good:${r}  ${d}- [ ] Extract token refresh into a standalone function with tests${r}

    ${c.red}Bad:${r}   ${d}- [ ] Fix the tests${r}
    ${g}Good:${r}  ${d}- [ ] Make the 3 skipped tests in auth.test.ts pass without mocking${r}

  ${c.bold}${w}TIPS${r}

    ${y}Context is everything${r}
    The agents don't know what you were thinking. Tell them what you
    observed, what you suspect, which files are involved, and what
    "done" looks like.

    ${y}Use Notes to set boundaries${r}
    "Don't touch the OAuth flow." "Only the CLI, not the API."
    "Use vitest, not jest." Agents follow Notes strictly.

    ${y}Right-size requirements${r}
    Too small (10 min each) = agents spend more time polling than working.
    Too big (multi-hour) = harder to review, more rejection loops.
    Sweet spot: 30-90 minutes of focused work per requirement.

    ${y}One concern per spec file${r}
    Don't mix "fix auth" and "add dark mode" in one file.
    Use separate specs — they get separate worktrees and task trees.

  ${c.bold}${w}TYPES${r}

    ${d}overtime: dev${r}    feature work, bug fixes, refactoring
    ${d}overtime: ops${r}    infrastructure, CI/CD, deploy configs
    ${d}overtime: docs${r}   documentation, READMEs, wiki pages
    ${d}overtime: test${r}   test coverage, test infrastructure

  ${c.bold}${w}COMMANDS${r}

    ${cy}astar overtime start${r}              spawn agents for all specs
    ${cy}astar overtime start --file auth${r}   specific spec only
    ${cy}astar overtime status${r}              what's running + progress
    ${cy}astar overtime recap${r}               morning summary
    ${cy}astar overtime stop${r}                kill agents
    ${cy}astar overtime stop --clean${r}        kill + remove worktrees
    ${cy}astar overtime stats${r}                cost, cycles, tokens across all runs
    ${cy}astar overtime stats <id>${r}           per-cycle breakdown for a specific run
    ${cy}astar overtime guide${r}               this guide

  ${c.bold}${w}EXAMPLE USE CASES${r}

    ${w}Before leaving work:${r}
    ${d}mkdir -p .astar/overtime${r}
    ${d}vim .astar/overtime/auth-hardening.md    # write your spec${r}
    ${d}astar overtime start                     # agents take over${r}

    ${w}Next morning:${r}
    ${d}astar overtime recap                     # see what happened${r}
    ${d}cd .astar/worktrees/overtime-auth-hardening${r}
    ${d}git log                                  # review commits${r}
    ${d}git diff main...HEAD                     # full diff${r}

    ${w}Happy with it:${r}
    ${d}git checkout main${r}
    ${d}git merge overtime/auth-hardening${r}
    ${d}astar overtime stop --clean${r}

  ${c.bold}${w}THE E-AGENT SIGN-OFF${r}

    E-Agent doesn't just rubber-stamp. Before marking the job done,
    it performs a comprehensive final review:

    ${d}1. Full branch diff (git diff main...HEAD)${r}
    ${d}2. Full test suite run${r}
    ${d}3. Each requirement verified individually${r}
    ${d}4. Side effect check — no unintended changes${r}
    ${d}5. Regression check — existing code still works${r}
    ${d}6. Security check — no secrets, injections, unsafe ops${r}
    ${d}7. Clean commits — no debug code, no TODOs left behind${r}

    Only when everything passes does it sign off and stop the session.
`);
}

// ── Register ────────────────────────────────────────────────────────

export function registerOvertimeCommands(program: Command) {
  const overtime = program
    .command("overtime")
    .description("Spawn overnight agents to implement and review work")
    .action(() => showStatus());

  overtime
    .command("start")
    .description("Parse spec files and spawn U-Agent + E-Agent")
    .option("-f, --file <slug>", "Only run a specific spec file")
    .action(async (opts: { file?: string }) => {
      await startOvertime(opts.file);
    });

  overtime
    .command("status")
    .description("Check running sessions and progress")
    .action(showStatus);

  overtime
    .command("recap")
    .description("Morning summary of overnight work")
    .action(showRecap);

  overtime
    .command("stats [run-id]")
    .description("Show telemetry for overtime runs — list all or detail for a specific run")
    .action(async (runId?: string) => {
      await showStats(runId);
    });

  overtime
    .command("guide")
    .description("Best practices for writing overnight specs")
    .action(showGuide);

  overtime
    .command("stop")
    .description("Kill all running overtime agents")
    .option("--clean", "Also remove git worktrees")
    .action(stopOvertime);
}
