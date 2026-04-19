import { useEffect } from "react";
import { useStore } from "./store";

export function useGlobalKeybinds() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.authError) return;

      // If focus is in a text input (e.g. SearchBar), let it consume keys
      // except Escape which we handle below.
      const ae = document.activeElement as HTMLElement | null;
      const inText =
        ae &&
        (ae.tagName === "INPUT" ||
          ae.tagName === "TEXTAREA" ||
          ae.isContentEditable);

      const mode = s.mode;

      // Composer mode: only Esc cancels (Enter is handled by composer itself)
      if (mode === "composer" || mode === "closing") {
        if (e.key === "Escape") {
          e.preventDefault();
          s.collapse();
        }
        return;
      }

      // Don't intercept while typing in a text input — except give the user
      // an escape valve via Escape (handled by the input itself for blur).
      if (inText) return;

      // List + card modes share most keybinds
      if (mode === "list" || mode === "card") {
        switch (e.key) {
          case "j":
          case "ArrowDown":
            e.preventDefault();
            s.selectDelta(1);
            return;
          case "k":
          case "ArrowUp":
            e.preventDefault();
            s.selectDelta(-1);
            return;
          case "g":
            e.preventDefault();
            s.selectFirst();
            return;
          case "G":
            e.preventDefault();
            s.selectLast();
            return;
          case "o":
          case "Enter":
            if (s.selected != null) {
              e.preventDefault();
              s.expand(s.selected);
            }
            return;
          case "Escape":
            if (mode === "card") {
              e.preventDefault();
              s.collapse();
            }
            return;
          case "x":
            if (s.selected != null) {
              e.preventDefault();
              s.beginClose("done");
            }
            return;
          case "w":
            if (s.selected != null) {
              e.preventDefault();
              s.beginClose("wont");
            }
            return;
          case "c":
            if (s.selected != null) {
              e.preventDefault();
              s.expand(s.selected).then(() => s.setMode("composer"));
            }
            return;
          case "r":
            e.preventDefault();
            s.poll();
            return;
          case "/":
            e.preventDefault();
            window.dispatchEvent(new Event("astar:focus-search"));
            return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
