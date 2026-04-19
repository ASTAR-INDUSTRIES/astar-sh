import { useEffect } from "react";
import { useStore } from "../store";

export function ExpiredBanner() {
  const authError = useStore((s) => s.authError);
  const fetchError = useStore((s) => s.fetchError);

  // Auto-clear non-fatal fetch errors after 6s
  useEffect(() => {
    if (!fetchError) return;
    const id = setTimeout(() => {
      useStore.setState({ fetchError: null });
    }, 6000);
    return () => clearTimeout(id);
  }, [fetchError]);

  if (authError) {
    return (
      <div className="banner">
        <span className="dot" />
        <span>{authError}</span>
      </div>
    );
  }
  if (fetchError) {
    return (
      <div className="banner soft">
        <span className="dot" />
        <span>{fetchError}</span>
      </div>
    );
  }
  return null;
}
