import type { Task } from "../types";

function dueLabel(d?: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function priClass(p: string) {
  if (p === "critical" || p === "high") return "high";
  if (p === "medium") return "med";
  return "low";
}

function priLabel(p: string) {
  if (p === "critical") return "crit";
  if (p === "high") return "high";
  if (p === "medium") return "med";
  return "low";
}

function shortAssignee(email?: string) {
  if (!email) return "—";
  const local = email.split("@")[0] || email;
  return local.length > 8 ? local.slice(0, 8) : local;
}

function doneTimeLabel(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function TaskRow({
  task,
  selected,
  done,
  onClick,
}: {
  task: Task;
  selected: boolean;
  done?: boolean;
  onClick: () => void;
}) {
  if (done) {
    const wontDo = task.status === "cancelled";
    return (
      <div
        className={"row done" + (selected ? " sel" : "")}
        onClick={onClick}
        role="button"
      >
        <span className={"mark done-mark" + (wontDo ? " wont" : "")} />
        <span className="id">#{task.task_number}</span>
        <span className="title strike">{task.title}</span>
        <span className={"pri " + (wontDo ? "low" : "doneok")}>
          {wontDo ? "won't" : "done"}
        </span>
        <span className="date">{doneTimeLabel(task.completed_at)}</span>
        <span className="who">{shortAssignee(task.assigned_to)}</span>
      </div>
    );
  }

  const cls = priClass(task.priority);
  return (
    <div
      className={"row" + (selected ? " sel" : "")}
      onClick={onClick}
      role="button"
    >
      <span className={"mark " + cls} />
      <span className="id">#{task.task_number}</span>
      <span className="title">{task.title}</span>
      <span className={"pri " + cls}>{priLabel(task.priority)}</span>
      <span className="date">{dueLabel(task.due_date)}</span>
      <span className="who">{shortAssignee(task.assigned_to)}</span>
    </div>
  );
}
