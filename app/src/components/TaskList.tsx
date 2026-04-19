import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { TaskRow } from "./TaskRow";
import { TaskCard } from "./TaskCard";
import type { Task } from "../types";

export function TaskList() {
  const allTasks = useStore((s) => s.tasks);
  const allDone = useStore((s) => s.doneToday);
  const search = useStore((s) => s.search);
  const q = search.trim().toLowerCase();
  const matches = (t: Task) =>
    !q ||
    t.title.toLowerCase().includes(q) ||
    String(t.task_number).includes(q);
  const tasks = q ? allTasks.filter(matches) : allTasks;
  const doneToday = q ? allDone.filter(matches) : allDone;
  const selected = useStore((s) => s.selected);
  const expanded = useStore((s) => s.expanded);
  const select = useStore((s) => s.select);
  const expand = useStore((s) => s.expand);
  const fetchError = useStore((s) => s.fetchError);
  const lastFetch = useStore((s) => s.lastFetch);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(".row.sel");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (fetchError && !lastFetch) {
    return (
      <div className="empty">
        <div>could not load tasks.</div>
        <div className="muted small">{fetchError}</div>
      </div>
    );
  }

  if (lastFetch && tasks.length === 0 && doneToday.length === 0) {
    return (
      <div className="empty">
        <div>nothing open.</div>
        <div className="muted small">inbox zero</div>
      </div>
    );
  }

  if (!lastFetch) {
    return (
      <div className="empty">
        <div className="muted">loading…</div>
      </div>
    );
  }

  const renderRow = (t: Task, done: boolean) => (
    <div key={t.task_number}>
      <TaskRow
        task={t}
        selected={selected === t.task_number}
        done={done}
        onClick={() => {
          if (selected === t.task_number) {
            expand(t.task_number);
          } else {
            select(t.task_number);
          }
        }}
      />
      {expanded === t.task_number && <TaskCard taskNumber={t.task_number} />}
    </div>
  );

  return (
    <div className="list" ref={listRef}>
      {tasks.map((t) => renderRow(t, false))}
      {doneToday.length > 0 && (
        <div className="section-divider">
          done · today · {doneToday.length}
        </div>
      )}
      {doneToday.map((t) => renderRow(t, true))}
    </div>
  );
}
