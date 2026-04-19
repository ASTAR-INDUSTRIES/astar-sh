import type { TaskActivity } from "../types";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const month = d.toLocaleDateString(undefined, { month: "short" }).toLowerCase();
  const day = d.getDate();
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${month} ${day} ${time}`;
}

function entryText(a: TaskActivity): string | null {
  // commented action puts the comment in state_after.comment
  if (a.action === "commented") {
    const sa = a.state_after as Record<string, unknown> | undefined;
    if (sa && typeof sa.comment === "string") return sa.comment;
  }

  if (a.action === "created") {
    const sa = a.state_after as Record<string, unknown> | undefined;
    const src = (sa?.source as string) || "manual";
    return `created via ${src}`;
  }

  if (a.action === "completed") {
    return `closed as done`;
  }

  if (a.action === "cancelled") {
    return `closed as won't do`;
  }

  if (a.action === "updated") {
    const sa = a.state_after as Record<string, unknown> | undefined;
    if (!sa) return "updated";
    const parts: string[] = [];
    for (const [k, v] of Object.entries(sa)) {
      if (typeof v === "object" && v !== null && "to" in (v as object)) {
        const to = (v as { to: unknown }).to;
        parts.push(`${k} → ${String(to)}`);
      } else {
        parts.push(`${k} → ${String(v)}`);
      }
    }
    return parts.join(", ");
  }

  if (a.action === "assigned") {
    const sa = a.state_after as Record<string, unknown> | undefined;
    return `assigned → ${sa?.assigned_to ?? "?"}`;
  }

  if (a.action === "linked") {
    const sa = a.state_after as Record<string, unknown> | undefined;
    return `linked ${sa?.link_type ?? "?"} → ${sa?.link_ref ?? "?"}`;
  }

  return a.action;
}

function whoLabel(a: TaskActivity): { label: string; isSystem: boolean } {
  if (a.actor_type === "human" && a.action === "commented") {
    const local = (a.actor_email ?? "").split("@")[0] || "unknown";
    return { label: local, isSystem: false };
  }
  return { label: "astar", isSystem: true };
}

export function Feed({ activity }: { activity: TaskActivity[] }) {
  if (!activity || activity.length === 0) {
    return <div className="feed-empty muted small">no activity yet</div>;
  }
  // Server returns descending; flip to ascending for human reading
  const ordered = [...activity].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  return (
    <div className="feed">
      {ordered.map((a) => {
        const text = entryText(a);
        if (!text) return null;
        const { label, isSystem } = whoLabel(a);
        return (
          <div
            key={a.id}
            className={"entry" + (isSystem ? " sys" : "")}
          >
            <span className="when">{fmtWhen(a.timestamp)}</span>
            <span className={"who" + (isSystem ? " astar" : "")}>{label}</span>
            <span className="text">{text}</span>
          </div>
        );
      })}
    </div>
  );
}
