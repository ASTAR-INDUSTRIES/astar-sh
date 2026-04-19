import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";

export function Composer({
  placeholder,
  hint,
  onSubmit,
  autoFocus = true,
}: {
  placeholder: string;
  hint: React.ReactNode;
  onSubmit: (text: string) => void;
  autoFocus?: boolean;
}) {
  const setMode = useStore((s) => s.setMode);
  const previousMode = useRef(useStore.getState().mode);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    previousMode.current = useStore.getState().mode;
    if (autoFocus) {
      // double-rAF to ensure textarea is in DOM and layout settled
      requestAnimationFrame(() =>
        requestAnimationFrame(() => ref.current?.focus()),
      );
    }
    return () => {
      const cur = useStore.getState().mode;
      if (cur === "composer") setMode(previousMode.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(value);
      setValue("");
    }
  }

  function autoresize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }

  return (
    <div className="composer">
      <span className="prompt">›</span>
      <textarea
        ref={ref}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          autoresize();
        }}
        onKeyDown={handleKey}
        onFocus={() => {
          previousMode.current = useStore.getState().mode === "composer"
            ? previousMode.current
            : useStore.getState().mode;
          // composer mode only matters if not already in closing
          if (useStore.getState().mode !== "closing") setMode("composer");
        }}
        onBlur={() => {
          if (useStore.getState().mode === "composer") setMode("card");
        }}
        rows={1}
      />
      <span className="hint">{hint}</span>
    </div>
  );
}
