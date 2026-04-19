import { useStore } from "../store";
import { openInBrowser } from "../auth";

function CopyableCode({ code }: { code: string }) {
  return (
    <button
      className="code-pill"
      onClick={() => {
        navigator.clipboard.writeText(code).catch(() => {});
      }}
      title="Click to copy"
    >
      {code}
    </button>
  );
}

export function SignIn() {
  const signIn = useStore((s) => s.signIn);
  const startSignIn = useStore((s) => s.startSignIn);
  const cancelSignIn = useStore((s) => s.cancelSignIn);
  const authError = useStore((s) => s.authError);

  return (
    <div className="signin-wrap">
      <div className="signin">
        <div className="signin-title">astar<span className="tilde">~</span>sh</div>
        <div className="signin-sub">
          {authError ? authError : "Sign in with your @astarconsulting.no account."}
        </div>

        {signIn.phase === "idle" && (
          <button className="signin-btn primary" onClick={startSignIn}>
            Sign in with Microsoft
          </button>
        )}

        {signIn.phase === "starting" && (
          <div className="signin-status">Requesting code…</div>
        )}

        {signIn.phase === "awaiting" && (
          <>
            <div className="signin-step">
              1. We've opened your browser at{" "}
              <button
                className="signin-link"
                onClick={() => openInBrowser(signIn.flow.verification_uri)}
              >
                {signIn.flow.verification_uri.replace("https://", "")}
              </button>
            </div>
            <div className="signin-step">
              2. Enter this code, then sign in:
            </div>
            <CopyableCode code={signIn.flow.user_code} />
            <div className="signin-status muted">
              Waiting for you to sign in…
            </div>
            <button className="signin-btn cancel" onClick={cancelSignIn}>
              Cancel
            </button>
          </>
        )}

        {signIn.phase === "error" && (
          <>
            <div className="signin-status error">{signIn.error}</div>
            <button className="signin-btn primary" onClick={startSignIn}>
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
