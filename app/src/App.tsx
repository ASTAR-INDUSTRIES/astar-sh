import { useEffect } from "react";
import { useStore } from "./store";
import { useGlobalKeybinds } from "./keybinds";
import { Topbar } from "./components/Topbar";
import { TaskList } from "./components/TaskList";
import { Footbar } from "./components/Footbar";
import { ExpiredBanner } from "./components/ExpiredBanner";
import { SearchBar } from "./components/SearchBar";
import { SignIn } from "./components/SignIn";

const POLL_MS = 10_000;

export function App() {
  const loadAuth = useStore((s) => s.loadAuth);
  const poll = useStore((s) => s.poll);
  const auth = useStore((s) => s.auth);
  const authLoading = useStore((s) => s.authLoading);
  const authError = useStore((s) => s.authError);

  useGlobalKeybinds();

  useEffect(() => {
    loadAuth();
    const onFocus = () => loadAuth();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadAuth]);

  useEffect(() => {
    if (!auth || authError) return;
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [auth, authError, poll]);

  const needsSignIn = !authLoading && (!auth || !!authError);

  return (
    <div className="paper">
      <Topbar />
      {authLoading && !auth && (
        <div className="empty muted">checking auth…</div>
      )}
      {needsSignIn && <SignIn />}
      {auth && !authError && (
        <>
          <ExpiredBanner />
          <SearchBar />
          <TaskList />
        </>
      )}
      <Footbar />
    </div>
  );
}
