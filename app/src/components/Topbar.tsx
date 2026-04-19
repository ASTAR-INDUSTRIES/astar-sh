import { useEffect, useState } from "react";
import { useStore } from "../store";

function fmtClock(d: Date) {
  return d.toLocaleTimeString(undefined, { hour12: true });
}

export function Topbar() {
  const tasks = useStore((s) => s.tasks);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const open = tasks.length;
  const high = tasks.filter(
    (t) => t.priority === "high" || t.priority === "critical",
  ).length;

  return (
    <div className="topbar">
      <span className="logo">
        astar<span className="tilde">~</span>sh<span className="muted"> · tasks</span>
      </span>
      <span className="muted">
        {open} open · {high} high
      </span>
      <span className="muted">{fmtClock(now)}</span>
    </div>
  );
}
