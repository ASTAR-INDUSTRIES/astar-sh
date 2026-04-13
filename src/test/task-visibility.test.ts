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
