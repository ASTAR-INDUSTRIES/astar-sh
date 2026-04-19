import { useStore } from "../store";

function K({ children }: { children: React.ReactNode }) {
  return <span className="kbd">{children}</span>;
}

export function Footbar() {
  const mode = useStore((s) => s.mode);
  const tasks = useStore((s) => s.tasks);

  if (mode === "closing") {
    return (
      <div className="footbar">
        <span className="accent">● closing — composer focused — ⏎ to confirm</span>
        <span>
          <K>⏎</K> confirm · <K>⇥</K> toggle · <K>⎋</K> cancel
        </span>
      </div>
    );
  }

  if (mode === "composer") {
    return (
      <div className="footbar">
        <span className="accent">● commenting</span>
        <span>
          <K>⏎</K> send · <K>⎋</K> cancel
        </span>
      </div>
    );
  }

  if (mode === "card") {
    return (
      <div className="footbar">
        <span>{tasks.length} open</span>
        <span>
          <K>c</K> comment · <K>x</K> done · <K>w</K> won't · <K>⎋</K> close card
        </span>
      </div>
    );
  }

  return (
    <div className="footbar">
      <span>{tasks.length} open</span>
      <span>
        <K>j</K>
        <K>k</K> move · <K>o</K> expand · <K>x</K> close · <K>c</K> comment ·{" "}
        <K>/</K> search · <K>r</K> refresh
      </span>
    </div>
  );
}
