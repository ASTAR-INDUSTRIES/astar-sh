/**
 * Tests for task visibility enforcement (subtask #178).
 *
 * These tests mirror the canAccessTask logic from
 * supabase/functions/skills-api/index.ts and validate that the visibility
 * rules work correctly for all visibility levels and edge cases.
 *
 * Integration-level coverage is not practical here (edge functions require
 * a live Supabase instance), so we unit-test the access-control predicate
 * and the DB-level filter expression that is injected into GET /tasks.
 */

import { describe, it, expect } from "vitest";

// Mirror of canAccessTask from supabase/functions/skills-api/index.ts.
// Keep in sync with the source of truth.
function canAccessTask(
  task: { created_by?: string | null; assigned_to?: string | null; visibility?: string | null },
  user: { email: string },
  project?: { visibility?: string; owner?: string } | null
): boolean {
  if (!task) return false;
  const callerEmail = user.email.toLowerCase();
  const isOwner =
    task.created_by?.toLowerCase() === callerEmail ||
    task.assigned_to?.toLowerCase() === callerEmail;
  if (task.visibility === "private") return isOwner;
  if (isOwner) return true;
  if (project) {
    // simplified canAccessProject
    if (project.visibility === "public") return false; // requires staff in prod
    if (project.visibility === "team") return true;
    return project.owner?.toLowerCase() === callerEmail;
  }
  return task.visibility === "public" || task.visibility === "team";
}

/**
 * Returns the Supabase `.or()` filter string that the GET /tasks handler
 * injects to exclude private tasks for non-owners at the DB level.
 */
function visibilityFilterExpr(callerEmail: string): string {
  return `visibility.neq.private,created_by.eq.${callerEmail},assigned_to.eq.${callerEmail}`;
}

/**
 * Simulates whether a row would pass the DB-level visibility filter.
 * Mirrors the SQL semantics of the OR expression:
 *   visibility != 'private' OR created_by = email OR assigned_to = email
 */
function passesDbFilter(
  row: { visibility?: string | null; created_by?: string | null; assigned_to?: string | null },
  callerEmail: string
): boolean {
  const email = callerEmail.toLowerCase();
  if (row.visibility !== "private") return true; // NULL and non-private both pass
  return (
    row.created_by?.toLowerCase() === email || row.assigned_to?.toLowerCase() === email
  );
}

const ERIK = { email: "erik@astarconsulting.no" };
const MIKAEL = { email: "mikael@astarconsulting.no" };

describe("canAccessTask — private visibility", () => {
  it("creator can access their own private task", () => {
    const task = { created_by: ERIK.email, assigned_to: null, visibility: "private" };
    expect(canAccessTask(task, ERIK)).toBe(true);
  });

  it("assignee can access a private task they are assigned to", () => {
    const task = { created_by: ERIK.email, assigned_to: MIKAEL.email, visibility: "private" };
    expect(canAccessTask(task, MIKAEL)).toBe(true);
  });

  it("non-owner cannot access another user's private task", () => {
    const task = { created_by: ERIK.email, assigned_to: ERIK.email, visibility: "private" };
    expect(canAccessTask(task, MIKAEL)).toBe(false);
  });

  it("email comparison is case-insensitive (task stored with mixed case)", () => {
    const task = { created_by: "Erik@Astarconsulting.NO", assigned_to: null, visibility: "private" };
    expect(canAccessTask(task, ERIK)).toBe(true);
  });

  it("non-owner with mixed-case email does not gain access via case collision", () => {
    const task = { created_by: "ERIK@ASTARCONSULTING.NO", assigned_to: null, visibility: "private" };
    expect(canAccessTask(task, MIKAEL)).toBe(false);
  });

  it("null created_by does not throw and returns false for non-owner", () => {
    const task = { created_by: null, assigned_to: null, visibility: "private" };
    expect(canAccessTask(task, MIKAEL)).toBe(false);
  });
});

describe("canAccessTask — team visibility", () => {
  it("any authenticated user can access team tasks", () => {
    const task = { created_by: ERIK.email, assigned_to: null, visibility: "team" };
    expect(canAccessTask(task, MIKAEL)).toBe(true);
  });

  it("creator can access their own team task", () => {
    const task = { created_by: ERIK.email, assigned_to: null, visibility: "team" };
    expect(canAccessTask(task, ERIK)).toBe(true);
  });
});

describe("canAccessTask — public visibility", () => {
  it("any authenticated user can access public tasks", () => {
    const task = { created_by: ERIK.email, assigned_to: null, visibility: "public" };
    expect(canAccessTask(task, MIKAEL)).toBe(true);
  });
});

describe("canAccessTask — null/missing visibility", () => {
  it("non-owner cannot access a task with null visibility", () => {
    const task = { created_by: ERIK.email, assigned_to: null, visibility: null };
    expect(canAccessTask(task, MIKAEL)).toBe(false);
  });

  it("owner can access their task with null visibility", () => {
    const task = { created_by: ERIK.email, assigned_to: null, visibility: null };
    expect(canAccessTask(task, ERIK)).toBe(true);
  });
});

describe("DB-level visibility filter (passesDbFilter)", () => {
  const caller = MIKAEL.email;

  it("private task owned by caller passes the filter", () => {
    const row = { created_by: MIKAEL.email, assigned_to: null, visibility: "private" };
    expect(passesDbFilter(row, caller)).toBe(true);
  });

  it("private task where caller is assignee passes the filter", () => {
    const row = { created_by: ERIK.email, assigned_to: MIKAEL.email, visibility: "private" };
    expect(passesDbFilter(row, caller)).toBe(true);
  });

  it("private task owned by another user is excluded by the filter", () => {
    const row = { created_by: ERIK.email, assigned_to: ERIK.email, visibility: "private" };
    expect(passesDbFilter(row, caller)).toBe(false);
  });

  it("team task passes the filter regardless of ownership", () => {
    const row = { created_by: ERIK.email, assigned_to: null, visibility: "team" };
    expect(passesDbFilter(row, caller)).toBe(true);
  });

  it("public task passes the filter", () => {
    const row = { created_by: ERIK.email, assigned_to: null, visibility: "public" };
    expect(passesDbFilter(row, caller)).toBe(true);
  });

  it("null visibility passes the filter (canAccessTask handles post-filter exclusion)", () => {
    const row = { created_by: ERIK.email, assigned_to: null, visibility: null };
    expect(passesDbFilter(row, caller)).toBe(true);
  });

  it("filter expression string is correctly constructed", () => {
    expect(visibilityFilterExpr("mikael@astarconsulting.no")).toBe(
      "visibility.neq.private,created_by.eq.mikael@astarconsulting.no,assigned_to.eq.mikael@astarconsulting.no"
    );
  });
});

// ── GET /tasks/:number response-code logic (subtask #179) ───────────────────
//
// Mirrors the response-code logic added to the single-task handler:
//   - Task not found            → 404
//   - Private task, not owner   → 403
//   - Any other access failure  → 404
//   - Access granted            → 200
function getTaskHttpStatus(
  task: { created_by?: string | null; assigned_to?: string | null; visibility?: string | null } | null,
  user: { email: string },
  project?: { visibility?: string; owner?: string } | null
): number {
  if (!task) return 404;
  if (!canAccessTask(task, user, project)) {
    return task.visibility === "private" ? 403 : 404;
  }
  return 200;
}

describe("GET /tasks/:number — response codes (subtask #179)", () => {
  it("returns 404 when the task does not exist", () => {
    expect(getTaskHttpStatus(null, MIKAEL)).toBe(404);
  });

  it("returns 403 when Mikael requests Erik's private task", () => {
    const task = { created_by: ERIK.email, assigned_to: ERIK.email, visibility: "private" };
    expect(getTaskHttpStatus(task, MIKAEL)).toBe(403);
  });

  it("returns 200 when Erik requests his own private task", () => {
    const task = { created_by: ERIK.email, assigned_to: null, visibility: "private" };
    expect(getTaskHttpStatus(task, ERIK)).toBe(200);
  });

  it("returns 200 when Mikael (assignee) requests a private task assigned to him", () => {
    const task = { created_by: ERIK.email, assigned_to: MIKAEL.email, visibility: "private" };
    expect(getTaskHttpStatus(task, MIKAEL)).toBe(200);
  });

  it("returns 200 for a team task regardless of caller", () => {
    const task = { created_by: ERIK.email, assigned_to: null, visibility: "team" };
    expect(getTaskHttpStatus(task, MIKAEL)).toBe(200);
  });

  it("returns 200 for a public task regardless of caller", () => {
    const task = { created_by: ERIK.email, assigned_to: null, visibility: "public" };
    expect(getTaskHttpStatus(task, MIKAEL)).toBe(200);
  });

  it("returns 403 with case-insensitive email comparison (task stored mixed-case)", () => {
    const task = { created_by: "ERIK@ASTARCONSULTING.NO", assigned_to: null, visibility: "private" };
    expect(getTaskHttpStatus(task, MIKAEL)).toBe(403);
  });

  it("returns 200 for owner even when task stored with mixed-case email", () => {
    const task = { created_by: "ERIK@ASTARCONSULTING.NO", assigned_to: null, visibility: "private" };
    expect(getTaskHttpStatus(task, ERIK)).toBe(200);
  });
});

// ── MCP list_tasks — include_all rejection (subtask #180) ───────────────────
//
// Mirrors the guard in supabase/functions/mcp-server/index.ts (case "list_tasks"):
//   if (args.include_all) {
//     return [{ type: "text", text: "Denied: include_all is disabled …" }];
//   }
//
// include_all is rejected for all callers because JWT-backed admin claims are
// not yet issued.  The tool schema also documents it as disabled.

const INCLUDE_ALL_DENIED_MSG =
  "Denied: include_all is disabled until JWT-backed admin claims are enforced server-side.";

/**
 * Minimal replica of the MCP list_tasks include_all guard.
 * Returns the denial text when include_all is truthy; null otherwise.
 */
function mcpListTasksIncludeAllGuard(args: { include_all?: boolean }): string | null {
  if (args.include_all) {
    return INCLUDE_ALL_DENIED_MSG;
  }
  return null;
}

describe("MCP list_tasks — include_all is always rejected (subtask #180)", () => {
  it("include_all: true returns a denial message", () => {
    expect(mcpListTasksIncludeAllGuard({ include_all: true })).toBe(INCLUDE_ALL_DENIED_MSG);
  });

  it("include_all: false does not trigger the guard", () => {
    expect(mcpListTasksIncludeAllGuard({ include_all: false })).toBeNull();
  });

  it("include_all omitted does not trigger the guard", () => {
    expect(mcpListTasksIncludeAllGuard({})).toBeNull();
  });

  it("denial message contains the expected text about admin claims", () => {
    const msg = mcpListTasksIncludeAllGuard({ include_all: true })!;
    expect(msg).toContain("admin claims");
  });

  it("denial message is stable (caller cannot bypass by passing a non-boolean truthy value)", () => {
    // TypeScript coerces the schema boolean, but guard uses truthiness — test that
    // a truthy-coerced value still triggers the deny path.
    const argsWithTruthy = { include_all: 1 as unknown as boolean };
    expect(mcpListTasksIncludeAllGuard(argsWithTruthy)).toBe(INCLUDE_ALL_DENIED_MSG);
  });

  it("Erik calling with include_all: true is still denied (no admin exception yet)", () => {
    // Even the task owner / platform owner gets rejected — no admin claims issued.
    expect(mcpListTasksIncludeAllGuard({ include_all: true })).not.toBeNull();
  });

  it("Mikael calling with include_all: true is denied (cannot enumerate all tasks)", () => {
    expect(mcpListTasksIncludeAllGuard({ include_all: true })).not.toBeNull();
  });
});

// ── MCP mutation tools — visibility enforcement (subtask #181) ──────────────
//
// Mirrors the access-control logic in the four MCP handlers:
//   get_task      → canAccessTask only (read)
//   update_task   → canAccessTask, then canModifyTask
//   complete_task → canAccessTask, then canModifyTask
//   comment_task  → canAccessTask, then canModifyTask
//
// The MCP server now uses case-insensitive email comparison in both
// canAccessTask and canModifyTask, matching the skills-api implementation.

/**
 * Mirror of the updated canAccessTask from mcp-server/index.ts.
 * Uses case-insensitive email comparison.
 */
function mcpCanAccessTask(
  task: { created_by?: string | null; assigned_to?: string | null; visibility?: string | null },
  user: { email: string },
  project?: { visibility?: string; owner?: string } | null
): boolean {
  if (!task) return false;
  const callerEmail = user.email.toLowerCase();
  const isOwner =
    task.created_by?.toLowerCase() === callerEmail ||
    task.assigned_to?.toLowerCase() === callerEmail;
  if (task.visibility === "private") return isOwner;
  if (isOwner) return true;
  if (project) {
    if (project.visibility === "team") return true;
    return project.owner?.toLowerCase() === callerEmail;
  }
  return task.visibility === "public" || task.visibility === "team";
}

/**
 * Mirror of the updated canModifyTask from mcp-server/index.ts.
 * Uses case-insensitive email comparison.
 */
function mcpCanModifyTask(
  task: { created_by?: string | null; assigned_to?: string | null } | null,
  user: { email: string }
): boolean {
  if (!task) return false;
  const callerEmail = user.email.toLowerCase();
  return (
    task.created_by?.toLowerCase() === callerEmail ||
    task.assigned_to?.toLowerCase() === callerEmail
  );
}

/**
 * Simulates the MCP get_task handler response.
 * Returns the error text if access is denied, or null if access is granted.
 */
function mcpGetTask(
  task: { created_by?: string | null; assigned_to?: string | null; visibility?: string | null } | null,
  user: { email: string }
): string | null {
  if (!task) return "Error: Task not found.";
  if (!mcpCanAccessTask(task, user)) return "Error: Task not found.";
  return null; // access granted
}

/**
 * Simulates the MCP update_task handler response.
 * Returns the error text if denied, or null if the caller may proceed.
 */
function mcpUpdateTask(
  task: { created_by?: string | null; assigned_to?: string | null; visibility?: string | null } | null,
  user: { email: string }
): string | null {
  if (!task) return "Error: Task not found.";
  if (!mcpCanAccessTask(task, user)) return "Error: Task not found.";
  if (!mcpCanModifyTask(task, user)) return "Denied: only the creator or assignee can modify this task.";
  return null;
}

/**
 * Simulates the MCP complete_task handler response.
 */
function mcpCompleteTask(
  task: { created_by?: string | null; assigned_to?: string | null; visibility?: string | null } | null,
  user: { email: string }
): string | null {
  if (!task) return "Error: Task not found.";
  if (!mcpCanAccessTask(task, user)) return "Error: Task not found.";
  if (!mcpCanModifyTask(task, user)) return "Denied: only the creator or assignee can complete this task.";
  return null;
}

/**
 * Simulates the MCP comment_task handler response.
 */
function mcpCommentTask(
  task: { created_by?: string | null; assigned_to?: string | null; visibility?: string | null } | null,
  user: { email: string }
): string | null {
  if (!task) return "Error: Task not found.";
  if (!mcpCanAccessTask(task, user)) return "Error: Task not found.";
  if (!mcpCanModifyTask(task, user)) return "Denied: only the creator or assignee can comment on this task.";
  return null;
}

describe("MCP get_task — visibility enforcement (subtask #181)", () => {
  const erikPrivate = { created_by: ERIK.email, assigned_to: ERIK.email, visibility: "private" };
  const erikTeam = { created_by: ERIK.email, assigned_to: ERIK.email, visibility: "team" };
  const erikPublic = { created_by: ERIK.email, assigned_to: ERIK.email, visibility: "public" };

  it("non-owner cannot get_task on a private task", () => {
    expect(mcpGetTask(erikPrivate, MIKAEL)).toBe("Error: Task not found.");
  });

  it("owner can get_task on their own private task", () => {
    expect(mcpGetTask(erikPrivate, ERIK)).toBeNull();
  });

  it("assignee can get_task on a private task assigned to them", () => {
    const task = { created_by: ERIK.email, assigned_to: MIKAEL.email, visibility: "private" };
    expect(mcpGetTask(task, MIKAEL)).toBeNull();
  });

  it("any user can get_task on a team task", () => {
    expect(mcpGetTask(erikTeam, MIKAEL)).toBeNull();
  });

  it("any user can get_task on a public task", () => {
    expect(mcpGetTask(erikPublic, MIKAEL)).toBeNull();
  });

  it("returns Task not found for missing task", () => {
    expect(mcpGetTask(null, MIKAEL)).toBe("Error: Task not found.");
  });

  it("email comparison is case-insensitive", () => {
    const task = { created_by: "ERIK@ASTARCONSULTING.NO", assigned_to: null, visibility: "private" };
    expect(mcpGetTask(task, MIKAEL)).toBe("Error: Task not found.");
    expect(mcpGetTask(task, ERIK)).toBeNull();
  });
});

describe("MCP update_task — visibility and modify enforcement (subtask #181)", () => {
  const erikPrivate = { created_by: ERIK.email, assigned_to: ERIK.email, visibility: "private" };
  const erikTeam = { created_by: ERIK.email, assigned_to: null, visibility: "team" };

  it("non-owner cannot update a private task (returns Task not found)", () => {
    expect(mcpUpdateTask(erikPrivate, MIKAEL)).toBe("Error: Task not found.");
  });

  it("owner can update their own private task", () => {
    expect(mcpUpdateTask(erikPrivate, ERIK)).toBeNull();
  });

  it("non-owner seeing a team task cannot update it (not creator/assignee)", () => {
    expect(mcpUpdateTask(erikTeam, MIKAEL)).toBe(
      "Denied: only the creator or assignee can modify this task."
    );
  });

  it("assignee of a team task can update it", () => {
    const task = { created_by: ERIK.email, assigned_to: MIKAEL.email, visibility: "team" };
    expect(mcpUpdateTask(task, MIKAEL)).toBeNull();
  });

  it("returns Task not found for missing task", () => {
    expect(mcpUpdateTask(null, MIKAEL)).toBe("Error: Task not found.");
  });

  it("email comparison is case-insensitive for ownership check", () => {
    const task = { created_by: "ERIK@ASTARCONSULTING.NO", assigned_to: null, visibility: "private" };
    expect(mcpUpdateTask(task, MIKAEL)).toBe("Error: Task not found.");
    expect(mcpUpdateTask(task, ERIK)).toBeNull();
  });
});

describe("MCP complete_task — visibility and modify enforcement (subtask #181)", () => {
  const erikPrivate = { created_by: ERIK.email, assigned_to: ERIK.email, visibility: "private" };
  const erikTeam = { created_by: ERIK.email, assigned_to: null, visibility: "team" };

  it("non-owner cannot complete a private task", () => {
    expect(mcpCompleteTask(erikPrivate, MIKAEL)).toBe("Error: Task not found.");
  });

  it("owner can complete their own private task", () => {
    expect(mcpCompleteTask(erikPrivate, ERIK)).toBeNull();
  });

  it("non-owner cannot complete a team task they are not assigned to", () => {
    expect(mcpCompleteTask(erikTeam, MIKAEL)).toBe(
      "Denied: only the creator or assignee can complete this task."
    );
  });

  it("assignee can complete a task assigned to them", () => {
    const task = { created_by: ERIK.email, assigned_to: MIKAEL.email, visibility: "team" };
    expect(mcpCompleteTask(task, MIKAEL)).toBeNull();
  });

  it("returns Task not found for missing task", () => {
    expect(mcpCompleteTask(null, MIKAEL)).toBe("Error: Task not found.");
  });

  it("email comparison is case-insensitive", () => {
    const task = { created_by: "MIKAEL@ASTARCONSULTING.NO", assigned_to: null, visibility: "private" };
    expect(mcpCompleteTask(task, MIKAEL)).toBeNull();
  });
});

describe("MCP comment_task — visibility and modify enforcement (subtask #181)", () => {
  const erikPrivate = { created_by: ERIK.email, assigned_to: ERIK.email, visibility: "private" };
  const erikTeam = { created_by: ERIK.email, assigned_to: null, visibility: "team" };

  it("non-owner cannot comment on a private task (returns Task not found)", () => {
    expect(mcpCommentTask(erikPrivate, MIKAEL)).toBe("Error: Task not found.");
  });

  it("owner can comment on their own private task", () => {
    expect(mcpCommentTask(erikPrivate, ERIK)).toBeNull();
  });

  it("non-owner cannot comment on a team task they did not create", () => {
    expect(mcpCommentTask(erikTeam, MIKAEL)).toBe(
      "Denied: only the creator or assignee can comment on this task."
    );
  });

  it("assignee can comment on a task assigned to them", () => {
    const task = { created_by: ERIK.email, assigned_to: MIKAEL.email, visibility: "team" };
    expect(mcpCommentTask(task, MIKAEL)).toBeNull();
  });

  it("returns Task not found for missing task", () => {
    expect(mcpCommentTask(null, MIKAEL)).toBe("Error: Task not found.");
  });

  it("email comparison is case-insensitive", () => {
    const task = { created_by: "ERIK@ASTARCONSULTING.NO", assigned_to: null, visibility: "private" };
    // Mikael is denied visibility
    expect(mcpCommentTask(task, MIKAEL)).toBe("Error: Task not found.");
    // Erik matches case-insensitively
    expect(mcpCommentTask(task, ERIK)).toBeNull();
  });
});

// ── CLI visibility flag resolution (subtask #182) ───────────────────────────
//
// Mirrors the flag-resolution logic in cli/src/commands/todo.ts:
//   const visibility = opts.private ? "private" : opts.public ? "public" : "team";
//
// Default is "team"; --private sets "private"; --public sets "public".
// If both flags are given, --private wins (first check in the ternary).

function resolveVisibility(opts: { private?: boolean; public?: boolean }): string {
  return opts.private ? "private" : opts.public ? "public" : "team";
}

describe("CLI todo — visibility flag resolution (subtask #182)", () => {
  it("defaults to team when no flags are passed", () => {
    expect(resolveVisibility({})).toBe("team");
  });

  it("--private produces visibility=private", () => {
    expect(resolveVisibility({ private: true })).toBe("private");
  });

  it("--public produces visibility=public", () => {
    expect(resolveVisibility({ public: true })).toBe("public");
  });

  it("--private takes precedence over --public when both are set", () => {
    expect(resolveVisibility({ private: true, public: true })).toBe("private");
  });

  it("false flags do not override the default", () => {
    expect(resolveVisibility({ private: false, public: false })).toBe("team");
  });

  it("only --public set produces public, not team", () => {
    expect(resolveVisibility({ private: false, public: true })).toBe("public");
  });
});

describe("end-to-end simulation: user B queries tasks assigned to user A", () => {
  // Simulates what happens when Mikael calls GET /tasks?assigned_to=erik@...
  // The DB filter runs first, then canAccessTask post-filters.

  const erikTasks = [
    { created_by: ERIK.email, assigned_to: ERIK.email, visibility: "private", title: "Erik private" },
    { created_by: ERIK.email, assigned_to: ERIK.email, visibility: "team", title: "Erik team" },
    { created_by: ERIK.email, assigned_to: ERIK.email, visibility: "public", title: "Erik public" },
  ];

  it("Mikael cannot see Erik's private tasks after DB filter", () => {
    const afterDbFilter = erikTasks.filter((t) => passesDbFilter(t, MIKAEL.email));
    expect(afterDbFilter.map((t) => t.title)).not.toContain("Erik private");
  });

  it("Mikael can see Erik's team and public tasks after DB filter", () => {
    const afterDbFilter = erikTasks.filter((t) => passesDbFilter(t, MIKAEL.email));
    expect(afterDbFilter.map((t) => t.title)).toContain("Erik team");
    expect(afterDbFilter.map((t) => t.title)).toContain("Erik public");
  });

  it("canAccessTask post-filter also blocks Erik's private tasks for Mikael", () => {
    const visible = erikTasks.filter((t) => canAccessTask(t, MIKAEL));
    expect(visible.map((t) => t.title)).not.toContain("Erik private");
  });

  it("Erik can still see all his own tasks", () => {
    const afterDbFilter = erikTasks.filter((t) => passesDbFilter(t, ERIK.email));
    const visible = afterDbFilter.filter((t) => canAccessTask(t, ERIK));
    expect(visible).toHaveLength(3);
  });
});
