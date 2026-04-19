import { useEffect, useRef } from "react";
import { useStore } from "../store";

export function SearchBar() {
  const search = useStore((s) => s.search);
  const ref = useRef<HTMLInputElement | null>(null);

  // expose focus via global window event so the keybind handler can call it
  useEffect(() => {
    const focus = () => {
      ref.current?.focus();
      ref.current?.select();
    };
    window.addEventListener("astar:focus-search", focus);
    return () => window.removeEventListener("astar:focus-search", focus);
  }, []);

  return (
    <div className="searchbar">
      <span className="prompt">/</span>
      <input
        ref={ref}
        type="text"
        value={search}
        placeholder="search…"
        spellCheck={false}
        onChange={(e) => useStore.setState({ search: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            useStore.setState({ search: "" });
            ref.current?.blur();
          }
        }}
      />
      {search && (
        <button
          className="clear"
          onClick={() => useStore.setState({ search: "" })}
          aria-label="clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}
