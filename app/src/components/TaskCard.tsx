import { useEffect } from "react";
import { useStore } from "../store";
import { Composer } from "./Composer";
import { Feed } from "./Feed";

function fmtAge(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function K({ children }: { children: React.ReactNode }) {
  return <span className="k">{children}</span>;
}

export function TaskCard({ taskNumber }: { taskNumber: number }) {
  const detail = useStore((s) => s.detail[taskNumber]);
  const fallback = useStore((s) =>
    [...s.tasks, ...s.doneToday].find((x) => x.task_number === taskNumber),
  );
  const mode = useStore((s) => s.mode);
  const closeOutcome = useStore((s) => s.closeOutcome);
  const collapse = useStore((s) => s.collapse);
  const beginClose = useStore((s) => s.beginClose);
  const setMode = useStore((s) => s.setMode);
  const toggleOutcome = useStore((s) => s.toggleCloseOutcome);
  const postComment = useStore((s) => s.postComment);
  const confirmClose = useStore((s) => s.confirmClose);
  const fetchError = useStore((s) => s.fetchError);

  // Tab to toggle outcome in closing mode
  useEffect(() => {
    if (mode !== "closing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        toggleOutcome();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [mode, toggleOutcome]);

  // Render closing UI immediately even before detail loads —
  // the user pressed x and needs the composer focused right now.
  const t = detail?.task ?? fallback;
  if (!t) {
    return (
      <div className="card">
        <div className="muted small">loading…</div>
      </div>
    );
  }
  const closing = mode === "closing";
  const outcomeLabel = closeOutcome === "done" ? "done" : "won't do";

  return (
    <div className={"card" + (closing ? " closing" : "")}>
      <div className="card-head">
        <div className="left">
          <span>
            #{t.task_number} ·{" "}
            <b>{closing ? "CLOSING…" : t.status.toUpperCase()}</b>
          </span>
          {!closing && <span>{t.priority}</span>}
          {closing && (
            <span className="outcome-pick">
              outcome:{" "}
              <span
                className={"seg" + (closeOutcome === "done" ? " on" : "")}
                onClick={() => closeOutcome === "wont" && toggleOutcome()}
              >
                done
              </span>
              <span
                className={"seg" + (closeOutcome === "wont" ? " on" : "")}
                onClick={() => closeOutcome === "done" && toggleOutcome()}
              >
                won't do
              </span>
            </span>
          )}
          {!closing && t.assigned_to && (
            <span className="muted">{t.assigned_to.split("@")[0]}</span>
          )}
          {!closing && t.tags && t.tags.length > 0 && (
            <span className="muted">tag: {t.tags.join(", ")}</span>
          )}
        </div>
        <span className="muted">{fmtAge(t.completed_at) || ""}</span>
      </div>

      <div className="card-title">{t.title}</div>

      {detail ? (
        <Feed activity={detail.activity} />
      ) : (
        <div className="feed-empty muted small">loading activity…</div>
      )}
      {fetchError && (
        <div className="feed-empty accent small">error: {fetchError}</div>
      )}

      {closing ? (
        <Composer
          key="closing"
          placeholder={`closing as ${outcomeLabel} — say what happened (optional)`}
          hint={
            <>
              <K>⏎</K> close · <K>⎋</K> cancel · <K>⇥</K> toggle
            </>
          }
          onSubmit={(text) => confirmClose(text)}
        />
      ) : (
        <Composer
          key="comment"
          placeholder="comment…"
          hint={
            <>
              <K>⏎</K> send · <K>⎋</K> close card
            </>
          }
          onSubmit={(text) => postComment(text)}
          autoFocus={mode === "composer"}
        />
      )}

      <div className="actions">
        {closing ? (
          <>
            <span className="btn primary">
              confirm close <K>⏎</K>
            </span>
            <span
              className="btn"
              onClick={toggleOutcome}
              role="button"
            >
              switch to {closeOutcome === "done" ? "won't do" : "done"} <K>⇥</K>
            </span>
            <span
              className="btn cancel"
              onClick={collapse}
              role="button"
            >
              cancel <K>⎋</K>
            </span>
          </>
        ) : (
          <>
            <span
              className="btn primary"
              onClick={() => beginClose("done")}
              role="button"
            >
              close task <K>x</K>
            </span>
            <span
              className="btn"
              onClick={() => beginClose("wont")}
              role="button"
            >
              won't do <K>w</K>
            </span>
            <span
              className="btn"
              onClick={() => setMode("composer")}
              role="button"
            >
              comment <K>c</K>
            </span>
            <span
              className="btn cancel"
              onClick={collapse}
              role="button"
            >
              collapse <K>⎋</K>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
