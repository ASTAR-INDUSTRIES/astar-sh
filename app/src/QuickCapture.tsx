import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { api } from "./api";
import type { AuthCache } from "./types";
import "./quick.css";

type Status = "idle" | "submitting" | "success" | "error";

export function QuickCapture() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");
  const authRef = useRef<AuthCache | null>(null);

  // Load auth once, keep refreshing on focus
  useEffect(() => {
    const load = async () => {
      try {
        authRef.current = await invoke<AuthCache>("read_auth");
      } catch {
        authRef.current = null;
      }
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Re-focus input whenever window is shown
  useEffect(() => {
    const focus = () => {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
    };
    focus();
    const unsub = listen("quick:focus", focus);
    const onFocus = () => focus();
    window.addEventListener("focus", onFocus);
    return () => {
      unsub.then((f) => f());
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Hide when the window loses focus (except briefly while submitting)
  useEffect(() => {
    const onBlur = () => {
      if (status === "submitting") return;
      getCurrentWindow().hide();
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [status]);

  async function submit() {
    const title = value.trim();
    if (!title) return;
    const auth = authRef.current;
    if (!auth) {
      setStatus("error");
      setMessage("not authenticated — run `astar login`");
      return;
    }
    setStatus("submitting");
    try {
      const res = await api.createTask(auth.token, { title });
      setStatus("success");
      setMessage(`#${res.task_number} created`);
      setValue("");
      // Brief confirmation then hide
      setTimeout(() => {
        getCurrentWindow().hide();
        setStatus("idle");
        setMessage("");
      }, 900);
    } catch (e) {
      setStatus("error");
      setMessage(String(e));
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      getCurrentWindow().hide();
      setValue("");
      setStatus("idle");
      setMessage("");
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="quick" data-tauri-drag-region>
      <span className="prompt">›</span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder="new task…"
        spellCheck={false}
        autoFocus
        disabled={status === "submitting" || status === "success"}
        onChange={(e) => {
          setValue(e.target.value);
          if (status === "error") {
            setStatus("idle");
            setMessage("");
          }
        }}
        onKeyDown={onKey}
      />
      <span className={"hint " + status}>
        {status === "success"
          ? message
          : status === "error"
          ? message
          : status === "submitting"
          ? "creating…"
          : "⏎ create · ⎋ cancel"}
      </span>
    </div>
  );
}
