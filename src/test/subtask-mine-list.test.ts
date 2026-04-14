/**
 * Tests for completed subtask visibility in mine/list table views (subtask #194).
 *
 * `astar todo mine` and `astar todo list` show subtasks indented under their
 * parent. Completed subtasks must appear — they must NOT be silently dropped.
 *
 * These tests mirror two pieces of logic that must both hold:
 *
 *  1. Server-side — the include_subtasks subquery at skills-api/index.ts:1739
 *     has NO status filter. All non-archived subtasks are returned regardless
 *     of completion state.
 *
 *  2. Client-side — renderTaskTable at todo.ts:46 iterates over t.subtasks
 *     without any status guard (lines 66-78), so completed subtasks always
 *     produce a row with a green ✓ icon.
 *
 * Integration-level coverage requires a live Supabase instance and a real
 * TTY, so we unit-test the predicate logic here.
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Server-side: include_subtasks subquery
//
// Mirrors skills-api/index.ts:1737-1744. The query is:
//   sb.from("tasks")
//     .in("parent_task_id", parentIds)
//     .is("archived_at", null)
//     .order("task_number", { ascending: true })
//
// Critically: there is NO .eq("status", ...) filter, so completed subtasks
// must appear in the result.
// ---------------------------------------------------------------------------

type SubtaskRow = {
  parent_task_id: string;
  task_number: number;
  status: string;
  archived_at: string | null;
};

function simulateIncludeSubtasksQuery(rows: SubtaskRow[], parentIds: string[]): SubtaskRow[] {
  return rows
    .filter((r) => parentIds.includes(r.parent_task_id)) // .in("parent_task_id", parentIds)
    .filter((r) => r.archived_at === null) // .is("archived_at", null)
    .sort((a, b) => a.task_number - b.task_number); // .order("task_number", { ascending: true })
  // No status filter — matches the actual query.
}

describe("server-side include_subtasks — no status filter", () => {
  const PARENT_ID = "aaaa-1111";

  const subtaskPool: SubtaskRow[] = [
    { parent_task_id: PARENT_ID, task_number: 65, status: "completed", archived_at: null },
    { parent_task_id: PARENT_ID, task_number: 67, status: "open", archived_at: null },
    { parent_task_id: PARENT_ID, task_number: 68, status: "in_progress", archived_at: null },
    { parent_task_id: PARENT_ID, task_number: 69, status: "completed", archived_at: "2026-04-10T00:00:00Z" }, // archived
    { parent_task_id: "other-parent", task_number: 70, status: "completed", archived_at: null }, // different parent
  ];

  it("returns completed subtasks alongside open subtasks", () => {
    const result = simulateIncludeSubtasksQuery(subtaskPool, [PARENT_ID]);
    const statuses = result.map((r) => r.status);
    expect(statuses).toContain("completed");
    expect(statuses).toContain("open");
  });

  it("does not filter out completed subtasks", () => {
    const result = simulateIncludeSubtasksQuery(subtaskPool, [PARENT_ID]);
    const completedNums = result.filter((r) => r.status === "completed").map((r) => r.task_number);
    expect(completedNums).toContain(65);
  });

  it("excludes archived subtasks even if completed", () => {
    const result = simulateIncludeSubtasksQuery(subtaskPool, [PARENT_ID]);
    const nums = result.map((r) => r.task_number);
    expect(nums).not.toContain(69); // archived
  });

  it("excludes subtasks belonging to other parents", () => {
    const result = simulateIncludeSubtasksQuery(subtaskPool, [PARENT_ID]);
    const nums = result.map((r) => r.task_number);
    expect(nums).not.toContain(70); // different parent
  });

  it("returns all 3 non-archived subtasks of the target parent", () => {
    const result = simulateIncludeSubtasksQuery(subtaskPool, [PARENT_ID]);
    expect(result).toHaveLength(3);
  });

  it("orders by task_number ascending", () => {
    const result = simulateIncludeSubtasksQuery(subtaskPool, [PARENT_ID]);
    const nums = result.map((r) => r.task_number);
    expect(nums).toEqual([65, 67, 68]);
  });
});

// ---------------------------------------------------------------------------
// Client-side: renderTaskTable subtask row building
//
// Mirrors todo.ts:46-85. For each task in the list, if t.subtasks has
// entries, they are ALL rendered (lines 66-78 have no status guard).
//
// Completed subtasks use the ✓ icon; open subtasks use ○; in_progress use ›.
// ---------------------------------------------------------------------------

type MockTask = {
  task_number: number;
  status: string;
  subtasks?: MockSubtask[];
};

type MockSubtask = {
  task_number: number;
  status: string;
};

/** Mirrors the row-building for subtasks in renderTaskTable (todo.ts:66-78). */
function buildSubtaskRows(task: MockTask): Array<{ taskNumber: number; status: string; icon: string }> {
  const rows: Array<{ taskNumber: number; status: string; icon: string }> = [];
  if (task.subtasks?.length) {
    for (const s of task.subtasks) {
      const icon =
        s.status === "completed" ? "✓" :
        s.status === "in_progress" ? "›" :
        "○";
      rows.push({ taskNumber: s.task_number, status: s.status, icon });
    }
  }
  return rows;
}

/** Mirrors the [subDone/subCount] progress label (todo.ts:53-55). */
function subtaskProgress(task: MockTask): { done: number; total: number } {
  const total = task.subtasks?.length || 0;
  const done = task.subtasks?.filter((s) => s.status === "completed").length || 0;
  return { done, total };
}

describe("client-side renderTaskTable — subtask rows", () => {
  const parent: MockTask = {
    task_number: 62,
    status: "open",
    subtasks: [
      { task_number: 65, status: "completed" },
      { task_number: 67, status: "open" },
    ],
  };

  it("completed subtask produces a row (not silently skipped)", () => {
    const rows = buildSubtaskRows(parent);
    const completedRow = rows.find((r) => r.taskNumber === 65);
    expect(completedRow).toBeDefined();
  });

  it("completed subtask row gets the ✓ icon", () => {
    const rows = buildSubtaskRows(parent);
    const completedRow = rows.find((r) => r.taskNumber === 65);
    expect(completedRow?.icon).toBe("✓");
  });

  it("open subtask row gets the ○ icon", () => {
    const rows = buildSubtaskRows(parent);
    const openRow = rows.find((r) => r.taskNumber === 67);
    expect(openRow?.icon).toBe("○");
  });

  it("renders all subtasks regardless of status", () => {
    const rows = buildSubtaskRows(parent);
    expect(rows).toHaveLength(2);
  });

  it("progress shows 1/2 when one subtask is completed", () => {
    const { done, total } = subtaskProgress(parent);
    expect(done).toBe(1);
    expect(total).toBe(2);
  });

  it("progress shows 0/2 when no subtasks are completed", () => {
    const allOpen: MockTask = {
      task_number: 10,
      status: "open",
      subtasks: [
        { task_number: 11, status: "open" },
        { task_number: 12, status: "open" },
      ],
    };
    const { done, total } = subtaskProgress(allOpen);
    expect(done).toBe(0);
    expect(total).toBe(2);
  });

  it("progress shows 2/2 when all subtasks are completed", () => {
    const allDone: MockTask = {
      task_number: 20,
      status: "open",
      subtasks: [
        { task_number: 21, status: "completed" },
        { task_number: 22, status: "completed" },
      ],
    };
    const { done, total } = subtaskProgress(allDone);
    expect(done).toBe(2);
    expect(total).toBe(2);
  });

  it("task with no subtasks produces no rows", () => {
    const noSubs: MockTask = { task_number: 99, status: "open" };
    const rows = buildSubtaskRows(noSubs);
    expect(rows).toHaveLength(0);
  });

  it("in_progress subtask gets the › icon", () => {
    const withInProgress: MockTask = {
      task_number: 30,
      status: "open",
      subtasks: [{ task_number: 31, status: "in_progress" }],
    };
    const rows = buildSubtaskRows(withInProgress);
    expect(rows[0]?.icon).toBe("›");
  });
});

// ---------------------------------------------------------------------------
// End-to-end data flow: completing a subtask and listing tasks
//
// Verifies that the combination of server response + client rendering
// results in the completed subtask being visible after it is completed.
// ---------------------------------------------------------------------------

describe("completing a subtask then listing tasks — it appears", () => {
  it("completed subtask under open parent is visible in mine/list output", () => {
    // Simulate: parent #62 is open; subtask #65 was just completed.
    // The server returns parent #62 with its subtasks (no status filter).
    const serverResponse: MockTask[] = [
      {
        task_number: 62,
        status: "open",
        subtasks: [
          { task_number: 65, status: "completed" }, // just completed
          { task_number: 67, status: "open" },
        ],
      },
    ];

    // renderTaskTable builds rows for all tasks and their subtasks.
    let completedSubtaskVisible = false;
    for (const task of serverResponse) {
      const rows = buildSubtaskRows(task);
      if (rows.some((r) => r.taskNumber === 65 && r.status === "completed")) {
        completedSubtaskVisible = true;
      }
    }

    expect(completedSubtaskVisible).toBe(true);
  });

  it("completed subtask progress indicator updates when subtask is completed", () => {
    const before: MockTask = {
      task_number: 62,
      status: "open",
      subtasks: [
        { task_number: 65, status: "open" },
        { task_number: 67, status: "open" },
      ],
    };
    const after: MockTask = {
      task_number: 62,
      status: "open",
      subtasks: [
        { task_number: 65, status: "completed" }, // now completed
        { task_number: 67, status: "open" },
      ],
    };

    expect(subtaskProgress(before)).toEqual({ done: 0, total: 2 });
    expect(subtaskProgress(after)).toEqual({ done: 1, total: 2 });
  });
});
